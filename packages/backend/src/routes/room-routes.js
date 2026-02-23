import { createRoom, joinRoom, getRoomState } from '../room-manager.js';
import { validateStartGame, startGame, getRoundState } from '../game-controller.js';
import { requireToken, verifyToken, invalidateAllRoomTokens } from '../auth.js';
import { query } from '../database.js';
import { EVENTS } from '../../../shared/constants/index.js';

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {() => import('socket.io').Server} getIo
 */
export function registerRoomRoutes(fastify, getIo) {
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

        const token = requireToken(req);
        if (!token) {
            return reply.code(401).send({ error: 'Missing token' });
        }
        const meta = await verifyToken(token);
        if (!meta) {
            return reply.code(401).send({ error: 'Invalid token' });
        }
        const playerId = meta.playerId;

        const roomState = await getRoomState(code.toUpperCase());

        try {
            validateStartGame(roomState, playerId);
        } catch (e) {
            return reply.code(400).send({error: e.message});
        }

        const io = getIo();
        if (!io) {
            return reply.code(500).send({
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

    // End game endpoint: host can end game; invalidate all tokens
    fastify.post('/api/rooms/:code/end', async (req, reply) => {
        const {code} = req.params;

        const token = requireToken(req);
        if (!token) {
            return reply.code(401).send({ error: 'Missing token' });
        }
        const meta = await verifyToken(token);
        if (!meta) {
            return reply.code(401).send({ error: 'Invalid token' });
        }
        const playerId = meta.playerId;

        try {
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
}
