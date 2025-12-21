// Room manager: create/join/get room state (KISS)
import { query } from './database.js';
import { getRedis } from './redis.js';
import crypto from 'crypto';
import { STATUSES, ROOM_TTL_SECONDS } from "../../shared/constants/index.js";
import { storePlayerToken } from './auth.js';

const redis = getRedis();

/**
 * Generate a random room code
 * @returns {string}
 */
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Cache room state in Redis
 * @param roomCode
 * @param state
 * @returns {Promise<*>}
 */
async function cacheRoom(roomCode, state) {
    await redis.set(`room:${roomCode}`, JSON.stringify(state), 'EX', ROOM_TTL_SECONDS);
    return state;
}

/**
 * Load room state from database and cache it
 * @param roomCode
 * @returns {Promise<{roomCode: *, hostId: *, status: *, players: {id: *, name: *}[]}|null>}
 */
async function hydrateRoom(roomCode) {
    const sessRes = await query('SELECT id, host_id, status FROM game_sessions WHERE room_code = $1', [roomCode]);
    if (!sessRes.rows.length) return null;
    const session = sessRes.rows[0];
    const playersRes = await query('SELECT id, name FROM players WHERE session_id = $1 ORDER BY joined_at ASC', [session.id]);
    const state = {
        roomCode,
        sessId: session.id,
        hostId: session.host_id,
        status: session.status,
        players: playersRes.rows.map(r => ({
            id: r.id,
            name: r.name
        }))
    };
    await cacheRoom(roomCode, state);
    return state;
}

/**
 * Get the current state of a room from cache or database
 * @param roomCode
 * @returns {Promise<null|{roomCode: *, hostId: *, status: *, players: {id: *, name: *}[]}|any>}
 */
export async function getRoomState(roomCode) {
    const cached = await redis.get(`room:${roomCode}`);
    if (cached) return JSON.parse(cached);
    return hydrateRoom(roomCode);
}

/**
 * Create a new room with the given player as host
 * @param { String } playerName
 * @returns {Promise<{playerId: *, playerToken: string, roomCode: *, hostId: *, status: string, players: [{id: *, name: *}]}>}
 */
export async function createRoom(playerName) {
    const name = (playerName || '').trim();
    if (name.length < 3) throw new Error('Invalid player name');
    let roomCode;
    let sessionId;
    // Retry until unique code inserted
    for (let i = 0; i < 5; i++) {
        roomCode = generateRoomCode();
        try {
            const res = await query('INSERT INTO game_sessions (room_code, status) VALUES ($1, $2) RETURNING id', [roomCode, STATUSES.WAITING]);
            sessionId = res.rows[0].id;
            break;
        } catch (e) {
            // Unique violation -> retry
            if (i === 4) throw Error('Unable to generate unique room code');
        }
    }
    const playerRes = await query('INSERT INTO players (session_id, name) VALUES ($1, $2) RETURNING id, name', [sessionId, name]);
    const player = playerRes.rows[0];
    await query('UPDATE game_sessions SET host_id = $1 WHERE id = $2', [player.id, sessionId]);
    const state = {
        roomCode,
        sessId: sessionId,
        hostId: player.id,
        status: STATUSES.WAITING,
        players: [
            {id: player.id, name: player.name}
        ]
    };
    await cacheRoom(roomCode, state);
    const token = await storePlayerToken(player.id, roomCode);
    return {
        playerId: player.id,
        playerToken: token,
        ...state
    };
}

/**
 * Join an existing room
 * @param roomCode
 * @param playerName
 * @returns {Promise<{playerId: *, playerToken: string}>}
 */
export async function joinRoom(roomCode, playerName) {
    const code = (roomCode || '').toUpperCase();

    if (code.length !== 6) throw new Error('Invalid room code');

    const name = (playerName || '').trim();

    if (name.length < 3) throw new Error('Invalid player name');

    let state = await getRoomState(code);

    if (!state) throw new Error('Room not found');

    if (state.status !== STATUSES.WAITING) throw new Error('Room locked');

    // Reject duplicate names (case-insensitive exact)
    if (state.players.some(p => p.name.toLowerCase() === name.toLowerCase())) throw new Error('Name taken');

    const playerRes = await query('INSERT INTO players (session_id, name) VALUES ($1, $2) RETURNING id, name', [state.sessId, name]);
    const player = playerRes.rows[0];
    state.players.push({
        id: player.id,
        name: player.name
    });
    await cacheRoom(code, state);
    const token = await storePlayerToken(player.id, code);
    return {
        playerId: player.id,
        playerToken: token,
        ...state
    };
}