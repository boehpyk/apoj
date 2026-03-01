import 'dotenv/config';
import Fastify from 'fastify';
import { Server } from 'socket.io';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';

import { testConnection, query } from './database.js';
import { testRedis } from './redis.js';
import { ensureBuckets } from './storage.js';
import { getRoomState } from './room-manager.js';
import { getRoundState } from './game-controller.js';
import { verifyToken } from './auth.js';
import { EVENTS } from '../../shared/constants/index.js';

import { registerRoomRoutes } from './routes/room-routes.js';
import { registerRoundRoutes } from './routes/round-routes.js';
import { registerAudioRoutes } from './routes/audio-routes.js';

const fastify = Fastify();

fastify.register(multipart, {limits: {fileSize: 10 * 1024 * 1024, files: 1}});
fastify.register(rateLimit, {global: false});

fastify.get('/api/health', async () => ({status: 'ok'}));

// Map socket.id -> { roomCode, playerId }
const connections = new Map();
let io; // define io for later assignment
const getIo = () => io;

registerRoomRoutes(fastify, getIo);
registerRoundRoutes(fastify, getIo);
registerAudioRoutes(fastify, getIo);

/**
 * Initialize infrastructure: DB, Redis, Storage
 * @returns {Promise<void>}
 */
async function initInfra() {
    const dbOk = await testConnection().catch(() => false);
    const redisOk = await testRedis();
    await ensureBuckets().catch(err => console.error('[storage] bucket init error', err));
    console.log('[infra] db:', dbOk ? 'ok' : 'fail', 'redis:', redisOk ? 'ok' : 'fail');
}

const PORT = process.env.PORT || 3000;

initInfra().then(() => {
    fastify.listen({port: PORT, host: '0.0.0.0'}).then(() => {
        console.log(`[backend] listening on http://localhost:${PORT}`);
        io = new Server(fastify.server, {cors: {origin: '*'}});
        io.on('connection', (socket) => {
            socket.on(EVENTS.JOIN_ROOM, async (data) => {
                try {
                    const {roomCode, playerId, token} = data || {};
                    if (!roomCode || !playerId || !token) return;

                    // Validate token matches the claimed playerId
                    const tokenMeta = await verifyToken(token);
                    if (!tokenMeta || tokenMeta.playerId !== playerId || tokenMeta.roomCode !== roomCode.toUpperCase()) {
                        socket.emit('error', {message: 'Invalid token'});
                        return;
                    }

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
                            phase: round.phase,
                            mode: round.mode || 'private',
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

            // Host navigates to a different song during guessing (public mode)
            socket.on(EVENTS.HOST_SONG_CHANGED, async ({ roundId, clueIndex } = {}) => {
                const { roomCode, playerId } = connections.get(socket.id) || {};
                if (!roomCode || !playerId || typeof clueIndex !== 'number') return;
                const room = await getRoomState(roomCode);
                if (!room || room.hostId !== playerId) return;
                const countRes = await query(
                    'SELECT COUNT(*) AS count FROM round_player_tracks WHERE round_id = $1 AND final_path IS NOT NULL',
                    [roundId]
                );
                io.to(roomCode).emit(EVENTS.HOST_SONG_CHANGED, {
                    roundId, clueIndex, totalClues: parseInt(countRes.rows[0].count)
                });
            });

            // Host plays or pauses the current audio (public mode)
            socket.on(EVENTS.HOST_AUDIO_SYNC, async ({ roundId, clueIndex, action, positionSeconds } = {}) => {
                const { roomCode, playerId } = connections.get(socket.id) || {};
                if (!roomCode || !playerId) return;
                if (!['play', 'pause'].includes(action)) return;
                const room = await getRoomState(roomCode);
                if (!room || room.hostId !== playerId) return;
                io.to(roomCode).emit(EVENTS.HOST_AUDIO_SYNC, { roundId, clueIndex, action, positionSeconds });
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
