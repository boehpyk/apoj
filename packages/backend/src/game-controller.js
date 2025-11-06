// Iteration 4: Round orchestration & song assignment (KISS)
import {query} from './database.js';
import {getRedis} from './redis.js';
import {getRoomState as getRoomStateCached} from './room-manager.js';
import {EVENTS} from '../../shared/constants/index.js';

const redis = getRedis();

// Redis key helper
function roundKey(roomCode) {
    return `round:${roomCode}`;
}

export async function startGame(roomCode) {
    const code = (roomCode || '').toUpperCase();
    const room = await getRoomStateCached(code);
    if (!room) throw new Error('Room not found');
    if (room.status !== 'waiting') throw new Error('Already started');
    if (room.players.length < 2) throw new Error('Need at least 2 players');

    // Lock session status
    await query('UPDATE game_sessions SET status = $1 WHERE room_code = $2', ['in_progress', code]);

    // Create round 1 (legacy columns mostly unused now)
    const roundRes = await query(
        'INSERT INTO rounds (session_id, round_number, phase, performing_team, guessing_team) SELECT id, $1, $2, $3, $4 FROM game_sessions WHERE room_code = $5 RETURNING id',
        [1, 'originals_recording', 'A', 'B', code]
    );
    const roundId = roundRes.rows[0].id;

    // Fetch distinct random songs equal to player count
    const songCount = room.players.length;
    const songsRes = await query('SELECT id FROM songs ORDER BY random() LIMIT $1', [songCount]);
    if (songsRes.rows.length < songCount) throw new Error('Not enough songs');
    const songIds = songsRes.rows.map(r => r.id);

    // Assign each player a song id (index order) and insert track rows
    const assignments = {};
    for (let i = 0; i < room.players.length; i++) {
        const player = room.players[i];
        const songId = songIds[i];
        assignments[player.id] = songId;
        await query('INSERT INTO round_player_tracks (round_id, player_id, song_id) VALUES ($1, $2, $3)', [roundId, player.id, songId]);
    }

    // Cache round state in redis
    const state = {roundId, phase: 'originals_recording', assignments};
    await redis.set(roundKey(code), JSON.stringify(state), 'EX', 3600);

    // Update cached room status to in_progress (simple patch)
    const updatedRoom = await getRoomStateCached(code);
    if (updatedRoom) {
        updatedRoom.status = 'in_progress';
        await redis.set(`room:${code}`, JSON.stringify(updatedRoom), 'EX', 86400);
    }

    return {roomCode: code, roundId, phase: state.phase, assignments};
}

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
    const phase = roundRes.rows[0].phase || 'originals_recording';
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
    if (!current) throw new Error('Round not found');
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
            const payload = {playerIds, songId: playerId ? assignments[playerId] : null};
            sock.emit(EVENTS.SONGS_ASSIGNED, payload);
        });
    });
}

export async function attemptAssignReverseRolesAndEmit(io, roomCode) {
    const code = (roomCode || '').toUpperCase();
    const round = await getRoundState(code);
    if (!round) return false;
    // Check if all originals uploaded
    const allUploaded = Object.values(round.statuses || {}).every(st => st === 'original_uploaded' || st === 'reversed_ready');
    if (!allUploaded) return false;
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
            if (arr.every((pid, idx) => pid !== playerIds[idx])) return arr;
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
        await query('UPDATE round_player_tracks SET reverse_player_id = $1 WHERE round_id = $2 AND player_id = $3', [reverseActor, round.roundId, originalOwner]);
    }
    // Set phase to reversing_first (if not already)
    await setRoundPhase(code, 'reversing_first');
    // Emit batch event to room once (UI can show ready to reverse recording available per assignment after actual reversal completes)
    io.to(code).emit(EVENTS.REVERSED_READY, {roundId: round.roundId, reverseMap: playerIds.reduce((acc, owner, idx) => {acc[owner] = shuffled[idx]; return acc;}, {})});
    return true;
}
