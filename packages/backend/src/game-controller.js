// Iteration 4: Round orchestration & song assignment (KISS)
import { query } from './database.js';
import { getRedis } from './redis.js';
import { getRoomState } from './room-manager.js';
import { EVENTS, STATUSES, ROUND_PHASES } from '../../shared/constants/index.js';
import { spawn } from 'child_process';
import { putObject } from './storage.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

const redis = getRedis();

// Redis key helper
function roundKey(roomCode) {
    return `round:${roomCode}`;
}

/**
 * Validate input date for starting the game
 * @param roomState
 * @param playerId
 */
export function validateStartGame(roomState, playerId) {
    if (!roomState) throw new Error('Room not found');
    if (roomState.hostId !== playerId) throw new Error('Not host');
    if (roomState.status !== STATUSES.WAITING) throw new Error('Already started');
}

/**
 * Start the game: create round, assign songs, cache state
 * @param roomCode
 * @returns {Promise<{roomCode: string, roundId: *, phase: string, assignments: {}}>}
 */
export async function startGame(roomCode) {
    const code = (roomCode || '').toUpperCase();
    const room = await getRoomState(code);

    if (!room) throw new Error('Room not found');
    if (room.status !== STATUSES.WAITING) throw new Error('Already started');
    if (room.players.length < 2) throw new Error('Need at least 2 players');

    // Lock session status
    await query('UPDATE game_sessions SET status = $1 WHERE room_code = $2', [STATUSES.PLAYING, code]);

    // Create round 1
    const roundId = await createRound(code);

    try {
        const assignments = await assignSongs(room, roundId);

        // Cache round state in redis
        const state = {
            roundId,
            phase: ROUND_PHASES.ORIGINALS_RECORDING,
            assignments
        };
        await redis.set(roundKey(code), JSON.stringify(state), 'EX', 3600);

        // Update cached room status to in_progress (simple patch)
        const updatedRoom = await getRoomState(code);
        if (updatedRoom) {
            updatedRoom.status = STATUSES.PLAYING;
            await redis.set(`room:${code}`, JSON.stringify(updatedRoom), 'EX', 86400);
        }

        return {
            roomCode: code,
            roundId,
            phase: state.phase,
            assignments
        };
    } catch (err) {
        throw err;
    }
}

/**
 * Get the original song assigned to the player in the given round
 * @param ctx
 * @returns {Promise<{song: *, audioProxyUrl: string}>}
 */
export async function getAssignedOriginalSong(ctx) {
    const trackRes = await query('SELECT song_id FROM round_player_tracks WHERE round_id = $1 AND player_id = $2', [ctx.roundId, ctx.playerId]);
    if (!trackRes.rows.length) {
        throw new Error('Assignment not found');
    }

    const songId = trackRes.rows[0].song_id;
    const songRes = await query('SELECT id, title, lyrics, duration, midi_file_path FROM songs WHERE id = $1', [songId]);
    if (!songRes.rows.length) {
        throw new Error('Song not found');
    }
    const song = songRes.rows[0];
    const audioProxyUrl = `/api/audio/song/${song.id}?roundId=${encodeURIComponent(ctx.roundId)}`;

    return {
        song,
        audioProxyUrl
    };
}

/**
 * Upload original recording for the player in the given round and reverse it
 * @param ctx
 * @param file
 * @returns {Promise<{roomCode: string, originalObjectName: string, reversedObjectName: string}>}
 */
export async function uploadOriginalRecord(ctx, file) {
    const playerId = ctx.playerId;
    const roundId = ctx.roundId;

    const buffer = await uploadFileToBuffer(file);

    const trackCheck = await query('SELECT status FROM round_player_tracks WHERE round_id = $1 AND player_id = $2', [roundId, playerId]);
    if (!trackCheck.rows.length) {
        throw new Error('Track not found');
    }

    if (trackCheck.rows[0].status !== ROUND_PHASES.ORIGINALS_RECORDING) {
        console.log('Upload rejected, status:', trackCheck.rows[0].status);
        throw new Error('Already uploaded');
    }

    const roomRes = await query('SELECT s.room_code FROM rounds r JOIN game_sessions s ON r.session_id = s.id WHERE r.id = $1', [roundId]);
    if (!roomRes.rows.length) throw new Error('Round not found');

    const roomCode = roomRes.rows[0].room_code.toUpperCase();

    const originalObjectName = `original/${roundId}/${playerId}.webm`;
    await putObject('audio-recordings', originalObjectName, buffer, {'Content-Type': file.mimetype});

    // Perform reversal now (immediate)
    const tmpDir = os.tmpdir();
    const tmpIn = path.join(tmpDir, `orig_${roundId}_${playerId}.webm`);
    const tmpOut = path.join(tmpDir, `rev_${roundId}_${playerId}.webm`);
    fs.writeFileSync(tmpIn, buffer);
    await new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', ['-y', '-i', tmpIn, '-af', 'areverse', tmpOut]);
        proc.on('error', reject);
        proc.stderr.on('data', () => {});
        proc.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg failed')));
    });
    const reversedBuf = fs.readFileSync(tmpOut);
    const reversedObjectName = `reversed-original/${roundId}/${playerId}.webm`;
    await putObject('audio-recordings', reversedObjectName, reversedBuf, {'Content-Type': 'audio/webm'});
    fs.unlink(tmpIn, () => {}); fs.unlink(tmpOut, () => {});
    await query('UPDATE round_player_tracks SET original_path = $1, reversed_path = $2, status = $3 WHERE round_id = $4 AND player_id = $5', [originalObjectName, reversedObjectName, ROUND_PHASES.ORIGINAL_REVERSED_READY, roundId, playerId]);

    return {
        roomCode,
        originalObjectName,
        reversedObjectName
    };
}

/**
 * Get the current round state for the given room code
 * @param roomCode
 * @returns {Promise<{roundId: *, phase: *|string, assignments: {}, statuses: {}}|any|null>}
 */
export async function getRoundState(roomCode) {
    const code = (roomCode || '').toUpperCase();
    const cached = await redis.get(roundKey(code));
    if (cached) {
        const parsed = JSON.parse(cached);
        // enrich with statuses from DB (not cached previously)
        const roundId = parsed.roundId;
        const tracksRes = await query('SELECT player_id, status FROM round_player_tracks WHERE round_id = $1', [roundId]);
        const statuses = {};
        tracksRes.rows.forEach(r => {
            statuses[r.player_id] = r.status;
        });
        return {...parsed, statuses};
    }
    const roundRes = await query('SELECT r.id, r.phase FROM rounds r JOIN game_sessions s ON r.session_id = s.id WHERE s.room_code = $1 ORDER BY r.round_number DESC LIMIT 1', [code]);
    if (!roundRes.rows.length) return null;
    const roundId = roundRes.rows[0].id;
    const phase = roundRes.rows[0].phase || ROUND_PHASES.ORIGINALS_RECORDING;
    const tracksRes = await query('SELECT player_id, song_id, status FROM round_player_tracks WHERE round_id = $1', [roundId]);
    const assignments = {};
    const statuses = {};
    tracksRes.rows.forEach(r => {
        assignments[r.player_id] = r.song_id;
        statuses[r.player_id] = r.status;
    });
    const state = {roundId, phase, assignments, statuses};
    await redis.set(roundKey(code), JSON.stringify({roundId, phase, assignments}), 'EX', 3600);
    return state;
}

// Advance phase stub (Future iterations will call this after recordings)
export async function setRoundPhase(roomCode, phase) {
    const code = (roomCode || '').toUpperCase();
    const current = await getRoundState(code);

    if (!current) {
        throw new Error('Round not found');
    }

    current.phase = phase;
    await redis.set(roundKey(code), JSON.stringify(current), 'EX', 3600);
    await query('UPDATE rounds SET phase = $1 WHERE id = $2', [phase, current.roundId]);
    return current;
}

// Socket broadcast helper (inject io externally for decoupling)
export function broadcastAssignments(io, roomCode, assignments, connections) {
    const playerIds = Object.keys(assignments);
    io.in(roomCode).fetchSockets().then(sockets => {
        sockets.forEach(sock => {
            const meta = connections.get(sock.id);
            const playerId = meta?.playerId;
            const payload = {
                playerIds,
                songId: playerId ? assignments[playerId] : null
            };
            sock.emit(EVENTS.SONGS_ASSIGNED, payload);
        });
    });
}

export async function attemptAssignReverseRolesAndEmit(io, roomCode) {
    const code = (roomCode || '').toUpperCase();
    const round = await getRoundState(code);

    if (!round) {
        return false;
    }

    // Check if all originals uploaded
    const allUploaded = Object.values(round.statuses || {}).every(st => st === ROUND_PHASES.ORIGINAL_REVERSED_READY);
    console.log(allUploaded);
    if (!allUploaded) {
        return false;
    }

    // Derangement: assign each player's original to a different player
    const playerIds = Object.keys(round.assignments);
    const shuffled = [...playerIds];

    // Simple Fisher-Yates shuffle until no position matches original
    function derange(arr) {
        for (let tries = 0; tries < 10; tries++) {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            if (arr.every((pid, idx) => pid !== playerIds[idx])) {
                return arr;
            }
        }
        // Fallback manual swap for conflicts
        for (let i = 0; i < arr.length; i++) {
            if (arr[i] === playerIds[i]) {
                const swapWith = (i + 1) % arr.length;
                [arr[i], arr[swapWith]] = [arr[swapWith], arr[i]];
            }
        }
        return arr;
    }
    derange(shuffled);

    // Persist reverse_player_id mapping
    for (let i = 0; i < playerIds.length; i++) {
        const originalOwner = playerIds[i];
        const reverseActor = shuffled[i];
        await query('UPDATE round_player_tracks SET reverse_player_id = $1, status = $4 WHERE round_id = $2 AND player_id = $3', [reverseActor, round.roundId, originalOwner, ROUND_PHASES.REVERSED_RECORDING]);
    }

    // Set phase to reversing_first (if not already)
    await setRoundPhase(code, ROUND_PHASES.REVERSED_RECORDING);

    // Emit batch event to room once (UI can show ready to reverse recording available per assignment after actual reversal completes)
    io.to(code).emit(EVENTS.REVERSED_RECORDING_STARTED, {
        roundId: round.roundId,
        reverseMap: playerIds.reduce((acc, owner, idx) => {
            acc[owner] = shuffled[idx];
            return acc;
        }, {})
    });

    return true;
}

/**
 * Upload reverse recording and create final audio (second reversal)
 * @param ctx
 * @param file
 * @returns {Promise<{roomCode: string, reverseRecordingObjectName: string, finalAudioObjectName: string}>}
 */
export async function uploadReverseRecording(ctx, file) {
    const playerId = ctx.playerId;
    const roundId = ctx.roundId;

    const buffer = await uploadFileToBuffer(file);

    // Find which original this player is reversing
    const trackCheck = await query(
        'SELECT player_id, status FROM round_player_tracks WHERE round_id = $1 AND reverse_player_id = $2',
        [roundId, playerId]
    );

    if (!trackCheck.rows.length) {
        throw new Error('No reverse assignment found');
    }

    const originalOwnerId = trackCheck.rows[0].player_id;
    const currentStatus = trackCheck.rows[0].status;

    if (currentStatus !== ROUND_PHASES.REVERSED_RECORDING) {
        throw new Error('Not in reverse recording phase');
    }

    const roomRes = await query(
        'SELECT s.room_code FROM rounds r JOIN game_sessions s ON r.session_id = s.id WHERE r.id = $1',
        [roundId]
    );
    if (!roomRes.rows.length) throw new Error('Round not found');

    const roomCode = roomRes.rows[0].room_code.toUpperCase();

    // Store reverse recording
    const reverseRecordingObjectName = `reverse-recording/${roundId}/${playerId}.webm`;
    await putObject('audio-recordings', reverseRecordingObjectName, buffer, {'Content-Type': file.mimetype});

    // Perform second reversal to create final audio
    const tmpDir = os.tmpdir();
    const tmpIn = path.join(tmpDir, `reverse_${roundId}_${playerId}.webm`);
    const tmpOut = path.join(tmpDir, `final_${roundId}_${playerId}.webm`);

    fs.writeFileSync(tmpIn, buffer);

    await new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', ['-y', '-i', tmpIn, '-af', 'areverse', tmpOut]);
        proc.on('error', reject);
        proc.stderr.on('data', () => {});
        proc.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg failed')));
    });

    const finalAudioBuf = fs.readFileSync(tmpOut);
    const finalAudioObjectName = `final-audio/${roundId}/${playerId}.webm`;
    await putObject('audio-recordings', finalAudioObjectName, finalAudioBuf, {'Content-Type': 'audio/webm'});

    fs.unlink(tmpIn, () => {});
    fs.unlink(tmpOut, () => {});

    // Update track status
    await query(
        'UPDATE round_player_tracks SET reversed_path = $1, final_path = $2, status = $3 WHERE round_id = $4 AND player_id = $5',
        [reverseRecordingObjectName, finalAudioObjectName, ROUND_PHASES.FINAL_AUDIO_READY, roundId, originalOwnerId]
    );

    return {
        roomCode,
        reverseRecordingObjectName,
        finalAudioObjectName,
        originalOwnerId
    };
}

/**
 * Create a new round for the given room code
 * @param code
 * @returns {Promise<*>}
 */
const createRound = async (code) => {
    const roundResult = await query(
        'INSERT INTO rounds (session_id, round_number, phase) SELECT id, $1, $2 FROM game_sessions WHERE room_code = $3 RETURNING id',
        [1, ROUND_PHASES.ORIGINALS_RECORDING, code]
    );
    return roundResult.rows[0].id;
}

/**
 * Assign songs to players for the round
 * @param room
 * @param roundId
 * @returns {Promise<{}>}
 */
const assignSongs = async (room, roundId) => {
    // Fetch distinct random songs equal to player count
    const playersCount = room.players.length;
    const songsRes = await query('SELECT id FROM songs ORDER BY random() LIMIT $1', [playersCount]);
    if (songsRes.rows.length < playersCount) throw new Error('Not enough songs');
    const songIds = songsRes.rows.map(r => r.id);

    // Assign each player a song id (index order) and insert track rows
    const assignments = {};
    for (let i = 0; i < room.players.length; i++) {
        const player = room.players[i];
        const songId = songIds[i];
        assignments[player.id] = songId;
        await query('INSERT INTO round_player_tracks (round_id, player_id, song_id, status) VALUES ($1, $2, $3, $4)', [roundId, player.id, songId, ROUND_PHASES.ORIGINALS_RECORDING]);
    }

    return assignments;
}

/**
 * Upload file to buffer with size limit
 * @param file
 * @returns {Promise<Buffer<ArrayBuffer>>}
 */
const uploadFileToBuffer = async (file) => {
    const chunks = [];
    let totalBytes = 0;

    for await (const chunk of file.file) {
        chunks.push(chunk);
        totalBytes += chunk.length;
        if (totalBytes > 10 * 1024 * 1024) throw new Error('File exceeds 10MB');
    }
    return Buffer.concat(chunks);
}
