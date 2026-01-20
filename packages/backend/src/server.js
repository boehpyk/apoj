import 'dotenv/config';
import Fastify from 'fastify';
import { Server } from 'socket.io';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';

import { testConnection, query } from './database.js';
import { testRedis } from './redis.js';
import { ensureBuckets, getObjectStream } from './storage.js';
import {
    createRoom,
    joinRoom,
    getRoomState,
} from './room-manager.js';
import {
    validateStartGame,
    startGame,
    getRoundState,
    attemptAssignReverseRolesAndEmit,
    getAssignedOriginalSong,
    uploadOriginalRecord,
    uploadReverseRecording
} from './game-controller.js';
import {
    validatePlayer,
    requireToken,
    invalidateAllRoomTokens,
    resolvePlayerContext
} from './auth.js';
import { validateInputFile } from "./validators.js";
import { assessGuessesWithAI, calculateScore, checkArtistMatch } from './score-calculator.js';
import {EVENTS, ROUND_PHASES} from '../../shared/constants/index.js';

const fastify = Fastify();

fastify.get('/api/health', async () => ({status: 'ok'}));

/**
 * Create room endpoint
 */
fastify.post('/api/rooms', async (req, reply) => {
    try {
        const { playerName } = req.body || {};
        const room = await createRoom(playerName);
        reply.send(room);
    } catch (e) {
        reply.code(400).send({error: e.message});
    }
});

/**
 * Join room endpoint
 */
fastify.post('/api/rooms/:code/join', async (req, reply) => {
    try {
        const { code } = req.params;
        const { playerName } = req.body || {};
        const room = await joinRoom(code, playerName);
        reply.send(room);
    } catch (e) {
        reply.code(400).send({error: e.message});
    }
});

/**
 * Get room state endpoint
 */
fastify.get('/api/rooms/:code', async (req, reply) => {
    const { code } = req.params;
    const state = await getRoomState(code.toUpperCase());
    if ( !state ) return reply.code(404).send({error: 'Not found'});
    reply.send(state);
});

/**
 * Start game endpoint
 */
fastify.post('/api/rooms/:code/start', async (req, reply) => {
    const { code } = req.params;
    const { playerId } = req.body || {};
    const roomState = await getRoomState(code.toUpperCase());

    try {
        validateStartGame(roomState, playerId);
    } catch (e) {
        reply.code(400).send({error: e.message});
    }

    if (! io) {
        reply.code(500).send({
            error: 'WebSocket not initialized'
        });
    }

    try {
        const started = await startGame(code);

        io.to(code.toUpperCase()).emit(EVENTS.GAME_STARTED, {
            roomCode: started.roomCode,
            roundId: started.roundId,
            phase: started.phase
        });
        // broadcastAssignments(io, code.toUpperCase(), started.assignments, connections);
        reply.send(started);
    } catch (e) {
        return reply.code(500).send({
            error: e.message
        });
    }
});

// Get round state endpoint
fastify.get('/api/rooms/:code/round', async (req, reply) => {
    const {code} = req.params;
    const round = await getRoundState(code.toUpperCase());
    if (!round) {
        return reply.code(404).send({
            error: 'Not found'
        });
    }
    reply.send(round);
});

/**
 * Get assigned original song for player in round
 */
fastify.get('/api/rounds/:roundId/song', async (req, reply) => {
    let ctx = null;
    try {
        ctx = await validatePlayer(req);
    } catch (e) {
        return reply.code(401).send({
            error: e.message
        });
    }

    try {
        const {song, audioProxyUrl} = await getAssignedOriginalSong(ctx);
        reply.send({...song, audioProxyUrl});
    } catch (e) {
        reply.code(400).send({
            error: e.message
        });
    }
});

/**
 * Upload original recording endpoint
 */
fastify.post('/api/rounds/:roundId/original-recording', async (req, reply) => {
    if (!io) {
        return reply.code(500).send({
            error: 'WebSocket not initialized'
        });
    }

    let ctx;
    try {
        ctx = await validatePlayer(req);
    } catch (e) {
        return reply.code(401).send({
            error: e.message
        });
    }

    const file = await req.file();
    try {
        validateInputFile(file)
    } catch (e) {
        return reply.code(400).send({error: e.message});
    }

    try {
        const { roomCode, originalObjectName, reversedObjectName } = await uploadOriginalRecord(ctx, file);
        const roundId = ctx.roundId;
        const playerId = ctx.playerId;

        const statusesRes = await query('SELECT status FROM round_player_tracks WHERE round_id = $1', [roundId]);
        const allUploaded = statusesRes.rows.every(r => r.status === ROUND_PHASES.ORIGINAL_REVERSED_READY);
        io.to(roomCode).emit(EVENTS.ORIGINAL_UPLOADED, {
            playerId,
            roundId,
            uploadedCount: statusesRes.rows.filter(r => r.status === ROUND_PHASES.ORIGINAL_REVERSED_READY).length,
            totalPlayers: statusesRes.rows.length
        });
        if (allUploaded) {
            await attemptAssignReverseRolesAndEmit(io, roomCode);
        }
        reply.send({
            ok: true,
            original: originalObjectName,
            reversed: reversedObjectName
        });
    } catch (e) {
        reply.code(400).send({error: e.message});
    }
});

/**
 * Upload reverse recording endpoint
 */
fastify.post('/api/rounds/:roundId/reverse-recording', async (req, reply) => {
    let ctx = null;
    try {
        ctx = await validatePlayer(req);
    } catch (e) {
        return reply.code(401).send({
            error: e.message
        });
    }

    const file = await req.file();
    try {
        validateInputFile(file);
    } catch (e) {
        return reply.code(400).send({error: e.message});
    }

    try {
        const { roomCode, reverseRecordingObjectName, finalAudioObjectName, originalOwnerId } = await uploadReverseRecording(ctx, file);
        const roundIdValue = ctx.roundId;
        const playerId = ctx.playerId;

        // Check if all reverse recordings are uploaded
        const statusesRes = await query('SELECT status FROM round_player_tracks WHERE round_id = $1', [roundIdValue]);
        const allFinalReady = statusesRes.rows.every(r => r.status === ROUND_PHASES.FINAL_AUDIO_READY);

        io.to(roomCode).emit(EVENTS.REVERSE_RECORDING_UPLOADED, {
            playerId,
            roundId: roundIdValue,
            originalOwnerId,
            uploadedCount: statusesRes.rows.filter(r => r.status === ROUND_PHASES.FINAL_AUDIO_READY).length,
            totalPlayers: statusesRes.rows.length
        });

        if (allFinalReady) {
            // All reverse recordings done, transition to guessing phase
            await query('UPDATE rounds SET phase = $1 WHERE id = $2', [ROUND_PHASES.GUESSING, roundIdValue]);
            io.to(roomCode).emit(EVENTS.GUESSING_STARTED, {
                roundId: roundIdValue,
                phase: ROUND_PHASES.GUESSING,
                submittedCount: 0,
                totalPlayers: statusesRes.rows.length
            });
        }

        reply.send({
            ok: true,
            reverseRecording: reverseRecordingObjectName,
            finalAudio: finalAudioObjectName
        });
    } catch (e) {
        reply.code(400).send({error: e.message});
    }
});

/**
 * Get clues for guessing phase
 * GET /api/rounds/:roundId/clues
 */
fastify.get('/api/rounds/:roundId/clues', async (req, reply) => {
    let ctx = null;
    try {
        ctx = await validatePlayer(req);
    } catch (e) {
        return reply.code(401).send({ error: e.message });
    }

    const { roundId } = req.params;

    try {
        // Get all final audio tracks for this round
        const tracksRes = await query(
            `SELECT 
                rpt.player_id as original_player_id,
                rpt.reverse_player_id as imitation_player_id,
                rpt.final_path,
                rpt.song_id,
                p.name as imitation_player_name
            FROM round_player_tracks rpt
            LEFT JOIN players p ON p.id = rpt.reverse_player_id
            WHERE rpt.round_id = $1 
            AND rpt.final_path IS NOT NULL
            ORDER BY rpt.player_id`,
            [roundId]
        );

        const clues = tracksRes.rows.map((row, index) => ({
            clueIndex: index,
            originalPlayerId: row.original_player_id,
            imitationPlayerId: row.imitation_player_id,
            imitationPlayerName: row.imitation_player_name || 'Unknown',
            songId: row.song_id,
            finalAudioUrl: `/api/audio/final/${roundId}/${row.original_player_id}`
        }));

        reply.send({ clues });
    } catch (e) {
        reply.code(500).send({ error: 'Failed to fetch clues' });
    }
});

/**
 * Submit guesses for the round
 * POST /api/rounds/:roundId/guess
 */
fastify.post('/api/rounds/:roundId/guess', async (req, reply) => {
    let ctx = null;
    try {
        ctx = await validatePlayer(req);
    } catch (e) {
        return reply.code(401).send({ error: e.message });
    }

    const { roundId } = req.params;
    const { guesses } = req.body || {};

    if (!Array.isArray(guesses) || guesses.length === 0) {
        return reply.code(400).send({ error: 'Guesses array required' });
    }

    try {
        // Validate round is in guessing phase and get room_code
        const roundRes = await query(
            `SELECT r.phase, gs.room_code 
             FROM rounds r 
             JOIN game_sessions gs ON r.session_id = gs.id 
             WHERE r.id = $1`,
            [roundId]
        );

        if (!roundRes.rows.length) {
            return reply.code(404).send({ error: 'Round not found' });
        }

        const round = roundRes.rows[0];
        if (round.phase !== ROUND_PHASES.GUESSING) {
            return reply.code(400).send({ error: 'Not in guessing phase' });
        }

        // Check if player already submitted
        const existingRes = await query(
            'SELECT id FROM player_guesses WHERE round_id = $1 AND player_id = $2',
            [roundId, ctx.playerId]
        );

        if (existingRes.rows.length > 0) {
            return reply.code(400).send({ error: 'Already submitted' });
        }

        // Store guesses (for now, just store as JSONB)
        await query(
            `INSERT INTO player_guesses (round_id, player_id, guesses, submitted_at)
             VALUES ($1, $2, $3, NOW())`,
            [roundId, ctx.playerId, JSON.stringify(guesses)]
        );

        // Count how many players have submitted
        const countRes = await query(
            'SELECT COUNT(*) as count FROM player_guesses WHERE round_id = $1',
            [roundId]
        );

        const submittedCount = parseInt(countRes.rows[0].count);

        // Get total players in round
        const totalRes = await query(
            'SELECT COUNT(*) as count FROM round_player_tracks WHERE round_id = $1',
            [roundId]
        );

        const totalPlayers = parseInt(totalRes.rows[0].count);

        // Emit event to update progress
        io.to(round.room_code).emit(EVENTS.GUESSING_ENDED, {
            roundId,
            playerId: ctx.playerId,
            submittedCount,
            totalPlayers
        });

        // If all players submitted, move to scoring phase
        if (submittedCount >= totalPlayers) {
            await query(
                'UPDATE rounds SET phase = $1 WHERE id = $2',
                [ROUND_PHASES.SCORES_FETCHING, roundId]
            );

            io.to(round.room_code).emit(EVENTS.GUESSING_ENDED, {
                roundId,
                phase: ROUND_PHASES.SCORES_FETCHING
            });
        }

        reply.send({ ok: true, submittedCount, totalPlayers });
    } catch (e) {
        console.error('[guess] error:', e);
        reply.code(500).send({ error: 'Failed to submit guess' });
    }
});

/**
 * Stream final audio (reversed twice) for guessing
 * GET /api/audio/final/:roundId/:playerId
 */
fastify.get('/api/audio/final/:roundId/:playerId', {config: {rateLimit: {max: 10, timeWindow: '10s'}}}, async (req, reply) => {
    try {
        const token = requireToken(req, reply);
        if (!token) {
            return;
        }

        const { roundId, playerId } = req.params;
        if (!roundId || !playerId) {
            return reply.code(400).send({ error: 'Missing params' });
        }

        const ctx = await resolvePlayerContext(token, roundId);
        if (!ctx) {
            return reply.code(403).send({ error: 'Forbidden' });
        }

        // Get final audio path
        const trackRes = await query(
            'SELECT final_path FROM round_player_tracks WHERE round_id = $1 AND player_id = $2',
            [roundId, playerId]
        );

        if (!trackRes.rows.length || !trackRes.rows[0].final_path) {
            return reply.code(404).send({ error: 'Final audio not found' });
        }

        const objectName = trackRes.rows[0].final_path;
        const stream = await getObjectStream('audio-recordings', objectName);

        reply.header('Content-Type', 'audio/webm');
        reply.header('Cache-Control', 'no-cache');
        return reply.send(stream);
    } catch (e) {
        console.error('[final audio] error:', e);
        reply.code(404).send({ error: 'Not found' });
    }
});

/**
 * Calculate and save round scores
 * POST /api/rounds/:roundId/score
 */
fastify.post('/api/rounds/:roundId/score', async (req, reply) => {
    let ctx = null;
    try {
        ctx = await validatePlayer(req);
    } catch (e) {
        return reply.code(401).send({ error: e.message });
    }

    const { roundId } = req.params;

    try {
        // Get round and room info
        const roundRes = await query(
            `SELECT r.id, r.phase, gs.room_code 
             FROM rounds r 
             JOIN game_sessions gs ON r.session_id = gs.id 
             WHERE r.id = $1`,
            [roundId]
        );

        if (!roundRes.rows.length) {
            return reply.code(404).send({ error: 'Round not found' });
        }

        const round = roundRes.rows[0];

        // Check if already scored
        const existingScores = await query(
            'SELECT COUNT(*) as count FROM round_scores WHERE round_id = $1',
            [roundId]
        );

        if (parseInt(existingScores.rows[0].count) > 0) {
            return reply.code(400).send({ error: 'Round already scored' });
        }

        // Fetch all original songs for this round
        const songsRes = await query(
            `SELECT rpt.player_id, rpt.song_id, s.title, s.artist,
                    ROW_NUMBER() OVER (ORDER BY rpt.player_id) - 1 as clue_index
             FROM round_player_tracks rpt
             JOIN songs s ON rpt.song_id = s.id
             WHERE rpt.round_id = $1
             ORDER BY rpt.player_id`,
            [roundId]
        );

        const originalSongs = songsRes.rows.map(row => ({
            clueIndex: parseInt(row.clue_index),
            playerId: row.player_id,
            songId: row.song_id,
            title: row.title,
            artist: row.artist
        }));

        // Fetch all player guesses
        const guessesRes = await query(
            `SELECT pg.player_id, pg.guesses, pg.submitted_at, p.name as player_name
             FROM player_guesses pg
             JOIN players p ON pg.player_id = p.id
             WHERE pg.round_id = $1`,
            [roundId]
        );

        const playerGuesses = guessesRes.rows.map(row => ({
            playerId: row.player_id,
            playerName: row.player_name,
            guesses: JSON.parse(row.guesses),
            submittedAt: row.submitted_at
        }));

        if (playerGuesses.length === 0) {
            return reply.code(400).send({ error: 'No guesses submitted' });
        }

        // Assess with ChatGPT
        console.log('[score] Assessing guesses with AI...');
        const assessments = await assessGuessesWithAI(originalSongs, playerGuesses);

        // Calculate scores and save to database
        const scoreResults = [];

        for (const assessment of assessments) {
            const playerGuess = playerGuesses.find(pg => pg.playerId === assessment.playerId);
            if (!playerGuess) continue;

            const guess = playerGuess.guesses.find(g => g.clueIndex === assessment.clueIndex);
            if (!guess) continue;

            const original = originalSongs.find(s => s.clueIndex === assessment.clueIndex);
            if (!original) continue;

            // Calculate submission time (simplified - using current time)
            const submissionTimeSeconds = 45; // TODO: Track actual submission time per clue

            // Check artist match
            const artistMatch = checkArtistMatch(guess.artist, original.artist);

            // Calculate final score
            const scoreBreakdown = calculateScore(
                assessment.aiScore,
                submissionTimeSeconds,
                artistMatch
            );

            // Save to database
            await query(
                `INSERT INTO round_scores 
                 (round_id, player_id, clue_index, ai_score, base_points, speed_bonus, artist_bonus, total_points, reasoning, used_fallback)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [
                    roundId,
                    assessment.playerId,
                    assessment.clueIndex,
                    assessment.aiScore,
                    scoreBreakdown.basePoints,
                    scoreBreakdown.speedBonus,
                    scoreBreakdown.artistBonus,
                    scoreBreakdown.total,
                    assessment.reasoning,
                    assessment.usedFallback
                ]
            );

            scoreResults.push({
                playerId: assessment.playerId,
                playerName: playerGuess.playerName,
                clueIndex: assessment.clueIndex,
                ...scoreBreakdown,
                aiScore: assessment.aiScore,
                reasoning: assessment.reasoning
            });
        }

        // Update round phase
        await query(
            'UPDATE rounds SET phase = $1 WHERE id = $2',
            [ROUND_PHASES.ROUND_ENDED, roundId]
        );

        // Emit scores to room
        io.to(round.room_code).emit(EVENTS.SCORES_FETCHING_ENDED, {
            roundId,
            scores: scoreResults
        });

        reply.send({ ok: true, scores: scoreResults });
    } catch (e) {
        console.error('[score] error:', e);
        reply.code(500).send({ error: 'Failed to calculate scores' });
    }
});

/**
 * Get round results and leaderboard
 * GET /api/rounds/:roundId/results
 */
fastify.get('/api/rounds/:roundId/results', async (req, reply) => {
    let ctx = null;
    try {
        ctx = await validatePlayer(req);
    } catch (e) {
        return reply.code(401).send({ error: e.message });
    }

    const { roundId } = req.params;

    try {
        // Get scores with player names and song info
        const scoresRes = await query(
            `SELECT 
                rs.player_id,
                p.name as player_name,
                rs.clue_index,
                rs.ai_score,
                rs.base_points,
                rs.speed_bonus,
                rs.artist_bonus,
                rs.total_points,
                rs.reasoning,
                rs.used_fallback,
                s.title as correct_title,
                s.artist as correct_artist,
                pg.guesses
             FROM round_scores rs
             JOIN players p ON rs.player_id = p.id
             JOIN round_player_tracks rpt ON rs.round_id = rpt.round_id AND rs.clue_index = (
                 SELECT ROW_NUMBER() OVER (ORDER BY rpt2.player_id) - 1 
                 FROM round_player_tracks rpt2 
                 WHERE rpt2.round_id = rs.round_id AND rpt2.player_id = rpt.player_id
             )
             JOIN songs s ON rpt.song_id = s.id
             LEFT JOIN player_guesses pg ON rs.player_id = pg.player_id AND rs.round_id = pg.round_id
             WHERE rs.round_id = $1
             ORDER BY rs.clue_index, rs.total_points DESC`,
            [roundId]
        );

        // Group by clue
        const clueResults = {};
        const playerTotals = {};

        for (const row of scoresRes.rows) {
            const clueIndex = row.clue_index;

            if (!clueResults[clueIndex]) {
                clueResults[clueIndex] = {
                    clueIndex,
                    correctTitle: row.correct_title,
                    correctArtist: row.correct_artist,
                    playerScores: []
                };
            }

            const guesses = row.guesses ? JSON.parse(row.guesses) : [];
            const playerGuess = guesses.find(g => g.clueIndex === clueIndex);

            clueResults[clueIndex].playerScores.push({
                playerId: row.player_id,
                playerName: row.player_name,
                guessTitle: playerGuess?.title || '',
                guessArtist: playerGuess?.artist || '',
                aiScore: row.ai_score,
                basePoints: row.base_points,
                speedBonus: row.speed_bonus,
                artistBonus: row.artist_bonus,
                totalPoints: row.total_points,
                reasoning: row.reasoning
            });

            // Accumulate player totals
            if (!playerTotals[row.player_id]) {
                playerTotals[row.player_id] = {
                    playerId: row.player_id,
                    playerName: row.player_name,
                    totalScore: 0
                };
            }
            playerTotals[row.player_id].totalScore += row.total_points;
        }

        // Build leaderboard
        const leaderboard = Object.values(playerTotals)
            .sort((a, b) => b.totalScore - a.totalScore);

        reply.send({
            clues: Object.values(clueResults),
            leaderboard
        });
    } catch (e) {
        console.error('[results] error:', e);
        reply.code(500).send({ error: 'Failed to fetch results' });
    }
});

// End game endpoint: host can end game; invalidate all tokens
fastify.post('/api/rooms/:code/end', async (req, reply) => {
    try {
        const {code} = req.params;
        const {playerId} = req.body || {};
        const state = await getRoomState(code.toUpperCase());
        if (!state) throw new Error('Room not found');
        if (state.hostId !== playerId) throw new Error('Not host');
        if (state.status === 'ended') throw new Error('Already ended');
        await query('UPDATE game_sessions SET status = $1, ended_at = NOW() WHERE room_code = $2', ['ended', code.toUpperCase()]);
        const invalidated = await invalidateAllRoomTokens(code.toUpperCase());
        reply.send({ok: true, invalidated});
    } catch (e) {
        reply.code(400).send({error: e.message});
    }
});

// Secure audio streaming by song UUID & assignment validation
fastify.get('/api/audio/song/:songId', {config: {rateLimit: {max: 5, timeWindow: '10s'}}}, async (req, reply) => {
    try {
        const token = requireToken(req, reply);
        if (!token) return;
        const {songId} = req.params;
        const {roundId} = req.query;
        if (!songId || !roundId) return reply.code(400).send({error: 'Missing params'});
        const ctx = await resolvePlayerContext(token, roundId);
        if (!ctx) return reply.code(403).send({error: 'Forbidden'});
        const assign = await query('SELECT 1 FROM round_player_tracks WHERE round_id = $1 AND player_id = $2 AND song_id = $3 LIMIT 1', [roundId, ctx.playerId, songId]);
        if (!assign.rows.length) return reply.code(403).send({error: 'Forbidden'});
        const songRes = await query('SELECT midi_file_path FROM songs WHERE id = $1', [songId]);
        if (!songRes.rows.length) return reply.code(404).send({error: 'Not found'});
        const objectName = songRes.rows[0].midi_file_path;
        const stream = await getObjectStream('audio-recordings', objectName);
        const lower = objectName.toLowerCase();
        let type = 'application/octet-stream';
        if (lower.endsWith('.mp3')) type = 'audio/mpeg';
        else if (lower.endsWith('.webm')) type = 'audio/webm';
        reply.header('Content-Type', type);
        reply.header('Cache-Control', 'no-cache');
        return reply.send(stream);
    } catch (e) {
        reply.code(404).send({error: 'Not found'});
    }
});

// Stream reversed original audio for reverse singers
fastify.get('/api/audio/reversed/:roundId/:playerId', {config: {rateLimit: {max: 5, timeWindow: '10s'}}}, async (req, reply) => {
    try {
        const token = requireToken(req, reply);
        if (!token) return;
        const {roundId, playerId} = req.params;
        if (!roundId || !playerId) return reply.code(400).send({error: 'Missing params'});

        const ctx = await resolvePlayerContext(token, roundId);
        if (!ctx) return reply.code(403).send({error: 'Forbidden'});

        // Check if requester is assigned to reverse this player's original
        const assign = await query(
            'SELECT reversed_path FROM round_player_tracks WHERE round_id = $1 AND player_id = $2 AND reverse_player_id = $3',
            [roundId, playerId, ctx.playerId]
        );

        if (!assign.rows.length || !assign.rows[0].reversed_path) {
            return reply.code(403).send({error: 'Not assigned or not ready'});
        }

        const objectName = assign.rows[0].reversed_path;
        const stream = await getObjectStream('audio-recordings', objectName);

        reply.header('Content-Type', 'audio/webm');
        reply.header('Cache-Control', 'no-cache');
        return reply.send(stream);
    } catch (e) {
        reply.code(404).send({error: 'Not found'});
    }
});

/**
 * Initialize infrastructure: DB, Redis, Storage, WebSocket
 * @returns {Promise<void>}
 */
async function initInfra() {
    const dbOk = await testConnection().catch(() => false);
    const redisOk = await testRedis();
    await ensureBuckets().catch(err => console.error('[storage] bucket init error', err));
    console.log('[infra] db:', dbOk ? 'ok' : 'fail', 'redis:', redisOk ? 'ok' : 'fail');
}

const PORT = process.env.PORT || 3000;

// Map socket.id -> { roomCode, playerId }
const connections = new Map();
let io; // define io for later assignment

fastify.register(multipart, {limits: {fileSize: 10 * 1024 * 1024, files: 1}});
fastify.register(rateLimit, {global: false});

initInfra().then(() => {
    fastify.listen({port: PORT, host: '0.0.0.0'}).then(() => {
        console.log(`[backend] listening on http://localhost:${PORT}`);
        io = new Server(fastify.server, {cors: {origin: '*'}});
        io.on('connection', (socket) => {
            socket.on(EVENTS.JOIN_ROOM, async (data) => {
                try {
                    const {roomCode, playerId} = data || {};
                    if (!roomCode || !playerId) return;
                    const state = await getRoomState(roomCode.toUpperCase());
                    if (!state) return;
                    if (!state.players.some(p => p.id === playerId)) return;

                    socket.join(roomCode);
                    connections.set(socket.id, {roomCode, playerId});
                    socket.to(roomCode).emit(EVENTS.PLAYER_JOINED, {playerId});
                    io.to(roomCode).emit(EVENTS.ROOM_UPDATED, state);

                    const round = await getRoundState(roomCode.toUpperCase());
                    if (round) {
                        socket.emit(EVENTS.GAME_STARTED, {
                            roomCode: roomCode.toUpperCase(),
                            roundId: round.roundId,
                            phase: round.phase
                        });
                        const meta = connections.get(socket.id);
                        const pid = meta?.playerId;
                        const payload = {
                            playerIds: Object.keys(round.assignments),
                            songId: pid ? round.assignments[pid] : null
                        };
                        // socket.emit(EVENTS.SONGS_ASSIGNED, payload);
                    }
                } catch {
                }
            });

            socket.on('disconnect', () => {
                const meta = connections.get(socket.id);
                if (!meta) return;
                const {roomCode, playerId} = meta;
                connections.delete(socket.id);
                // invalidatePlayerToken(playerId).catch(() => {
                // });
                socket.to(roomCode).emit(EVENTS.PLAYER_LEFT, {playerId});
            });
        });
    }).catch(err => {
        console.error('[backend] failed to start', err);
        process.exit(1);
    });
});
