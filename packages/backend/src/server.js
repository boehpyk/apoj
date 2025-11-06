import Fastify from 'fastify';
import {Server} from 'socket.io';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';

import {testConnection} from './database.js';
import {testRedis} from './redis.js';
import {ensureBuckets} from './storage.js';
import {
    createRoom,
    joinRoom,
    getRoomState,
    verifyToken,
    invalidateAllRoomTokens
} from './room-manager.js';
import {startGame, getRoundState, broadcastAssignments, attemptAssignReverseRolesAndEmit} from './game-controller.js';
import {EVENTS} from '../../shared/constants/index.js';
import {putObject, getObjectStream} from './storage.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

const fastify = Fastify();

fastify.get('/api/health', async () => ({status: 'ok'}));

// Room endpoints (Iteration 2)
fastify.post('/api/rooms', async (req, reply) => {
    try {
        const {playerName} = req.body || {};
        const room = await createRoom(playerName);
        reply.send(room);
    } catch (e) {
        reply.code(400).send({error: e.message});
    }
});

fastify.post('/api/rooms/:code/join', async (req, reply) => {
    try {
        const {code} = req.params;
        const {playerName} = req.body || {};
        const room = await joinRoom(code, playerName);
        reply.send(room);
    } catch (e) {
        reply.code(400).send({error: e.message});
    }
});

fastify.get('/api/rooms/:code', async (req, reply) => {
    const {code} = req.params;
    const state = await getRoomState(code.toUpperCase());
    if (!state) return reply.code(404).send({error: 'Not found'});
    reply.send(state);
});

// Start game endpoint (Iteration 4)
fastify.post('/api/rooms/:code/start', async (req, reply) => {
    try {
        const {code} = req.params;
        const {playerId} = req.body || {};
        const roomState = await getRoomState(code.toUpperCase());
        if (!roomState) throw new Error('Room not found');
        if (roomState.hostId !== playerId) throw new Error('Not host');
        if (roomState.status !== 'waiting') throw new Error('Already started');
        const started = await startGame(code);
        if (io) {
            io.to(code.toUpperCase()).emit(EVENTS.GAME_STARTED, {
                roomCode: started.roomCode,
                roundId: started.roundId,
                phase: started.phase
            });
            broadcastAssignments(io, code.toUpperCase(), started.assignments, connections);
        }
        reply.send(started);
    } catch (e) {
        reply.code(400).send({error: e.message});
    }
});

// Get round state endpoint
fastify.get('/api/rooms/:code/round', async (req, reply) => {
    const {code} = req.params;
    const round = await getRoundState(code.toUpperCase());
    if (!round) return reply.code(404).send({error: 'Not found'});
    reply.send(round);
});

// Secure token validation helper
function requireToken(req, reply) {
    const token = req.headers['x-player-token'];
    if (!token || typeof token !== 'string') {
        reply.code(401).send({error: 'Missing token'});
        return null;
    }
    return token;
}

async function resolvePlayerContext(token, roundId) {
    const meta = await verifyToken(token);
    if (!meta) return null;
    // Verify round belongs to same room
    const db = await import('./database.js');
    const roundRes = await db.query('SELECT r.id, s.room_code FROM rounds r JOIN game_sessions s ON r.session_id = s.id WHERE r.id = $1', [roundId]);
    if (!roundRes.rows.length) return null;
    const roomCode = roundRes.rows[0].room_code.toUpperCase();
    if (roomCode !== meta.roomCode) return null;
    return {playerId: meta.playerId, roomCode};
}

// Iteration 5: Get assigned song for player
fastify.get('/api/rounds/:roundId/song', async (req, reply) => {
    console.log('GET /api/rounds/:roundId/song called');
    try {
        const token = requireToken(req, reply);
        if (!token) return;
        const {roundId} = req.params;
        const ctx = await resolvePlayerContext(token, roundId);
        if (!ctx) {
            return reply.code(403).send({error: 'Forbidden'});
        }
        const db = await import('./database.js');
        const trackRes = await db.query('SELECT song_id FROM round_player_tracks WHERE round_id = $1 AND player_id = $2', [roundId, ctx.playerId]);
        if (!trackRes.rows.length) throw new Error('Assignment not found');
        const songId = trackRes.rows[0].song_id;
        const songRes = await db.query('SELECT id, title, lyrics, duration, midi_file_path FROM songs WHERE id = $1', [songId]);
        if (!songRes.rows.length) throw new Error('Song not found');
        const song = songRes.rows[0];
        const audioProxyUrl = `/api/audio/song/${song.id}?roundId=${encodeURIComponent(roundId)}`;
        reply.send({...song, audioProxyUrl});
    } catch (e) {
        reply.code(400).send({error: e.message});
    }
});

// Simple audio reversal using ffmpeg (KISS) placed inline for now
import {spawn} from 'child_process';
async function reverseAudioTemp(inputStream, tmpInputPath, outputPath) {
    // Write stream to disk then ffmpeg areverse
    await new Promise((resolve, reject) => {
        const write = fs.createWriteStream(tmpInputPath);
        inputStream.pipe(write);
        write.on('finish', resolve);
        write.on('error', reject);
    });
    await new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', ['-y', '-i', tmpInputPath, '-af', 'areverse', outputPath]);
        proc.on('error', reject);
        proc.stderr.on('data', () => {});
        proc.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg failed')));
    });
}

// Iteration 5: Upload original recording
fastify.post('/api/rounds/:roundId/original-recording', async (req, reply) => {
    try {
        const token = requireToken(req, reply);
        if (!token) return;
        const {roundId} = req.params;
        const ctx = await resolvePlayerContext(token, roundId);
        if (!ctx) return reply.code(403).send({error: 'Forbidden'});
        const playerId = ctx.playerId;
        const file = await req.file();
        if (!file) throw new Error('No file');
        if (!file.mimetype.startsWith('audio')) throw new Error('Invalid type');
        if (file.file.truncated) throw new Error('File too large');
        const chunks = [];
        let totalBytes = 0;
        for await (const chunk of file.file) {
            chunks.push(chunk);
            totalBytes += chunk.length;
            if (totalBytes > 10 * 1024 * 1024) throw new Error('File exceeds 10MB');
        }
        const buffer = Buffer.concat(chunks);
        const db = await import('./database.js');
        const trackCheck = await db.query('SELECT status FROM round_player_tracks WHERE round_id = $1 AND player_id = $2', [roundId, playerId]);
        if (!trackCheck.rows.length) throw new Error('Track not found');
        if (trackCheck.rows[0].status !== 'pending_original') throw new Error('Already uploaded');
        const roomRes = await db.query('SELECT s.room_code FROM rounds r JOIN game_sessions s ON r.session_id = s.id WHERE r.id = $1', [roundId]);
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
        await db.query('UPDATE round_player_tracks SET original_path = $1, reversed_path = $2, status = $3 WHERE round_id = $4 AND player_id = $5', [originalObjectName, reversedObjectName, 'reversed_ready', roundId, playerId]);
        const statusesRes = await db.query('SELECT status FROM round_player_tracks WHERE round_id = $1', [roundId]);
        const allUploaded = statusesRes.rows.every(r => r.status === 'reversed_ready');
        if (io) {
            io.to(roomCode).emit(EVENTS.ORIGINAL_UPLOADED, {
                playerId,
                roundId,
                uploadedCount: statusesRes.rows.filter(r => r.status === 'reversed_ready').length,
                totalPlayers: statusesRes.rows.length
            });
            if (allUploaded) {
                await attemptAssignReverseRolesAndEmit(io, roomCode);
            }
        }
        reply.send({ok: true, original: originalObjectName, reversed: reversedObjectName});
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
        await import('./database.js').then(m => m.query('UPDATE game_sessions SET status = $1, ended_at = NOW() WHERE room_code = $2', ['ended', code.toUpperCase()]));
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
        const db = await import('./database.js');
        const assign = await db.query('SELECT 1 FROM round_player_tracks WHERE round_id = $1 AND player_id = $2 AND song_id = $3 LIMIT 1', [roundId, ctx.playerId, songId]);
        if (!assign.rows.length) return reply.code(403).send({error: 'Forbidden'});
        const songRes = await db.query('SELECT midi_file_path FROM songs WHERE id = $1', [songId]);
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
                        socket.emit(EVENTS.SONGS_ASSIGNED, payload);
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
