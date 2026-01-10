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
    broadcastAssignments,
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
import {EVENTS, ROUND_PHASES, STATUSES} from '../../shared/constants/index.js';

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
            io.to(roomCode).emit(EVENTS.FINAL_AUDIO_READY, {
                roundId: roundIdValue,
                phase: ROUND_PHASES.GUESSING
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
