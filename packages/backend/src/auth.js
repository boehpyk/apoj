import { query } from './database.js';
import { getRedis } from './redis.js';
import crypto from 'crypto';
import { getRoomState } from "./room-manager.js";
import { ROOM_TTL_SECONDS } from "../../shared/constants/index.js";

const redis = getRedis();

export async function validatePlayer(req) {
    const { roundId } = req.params;

    const token = requireToken(req);
    if (!token) {
        throw new Error('Invalid token');
    }
    const ctx = await resolvePlayerContext(token, roundId);
    if (!ctx) {
        throw new Error('Invalid player');
    }
    return ctx;
}

export async function verifyToken(token) {
    if (!token) return null;
    const data = await redis.get(`token_lookup:${token}`);
    return data ? JSON.parse(data) : null;
}

/**
 * Get player token from request headers
 * @param req
 * @returns {string|null}
 */
export function requireToken(req) {
    const token = req.headers['x-player-token'];
    if (!token || typeof token !== 'string') {
        return null;
    }
    return token;
}

/**
 * Resolve player context from token and round ID
 * @param token
 * @param roundId
 * @returns {Promise<{playerId: *, roomCode: string}|null>}
 */
export async function resolvePlayerContext(token, roundId) {
    const meta = await verifyToken(token);
    if (!meta) return null;

    // Verify round belongs to same room
    const roundRes = await query('SELECT r.id, s.room_code FROM rounds r JOIN game_sessions s ON r.session_id = s.id WHERE r.id = $1', [roundId]);
    if (!roundRes.rows.length) return null;

    const roomCode = roundRes.rows[0].room_code.toUpperCase();
    if (roomCode !== meta.roomCode) return null;

    return {
        playerId: meta.playerId,
        roomCode,
        roundId
    };
}

/**
 * Create and store a player token in Redis for the given player and room
 * @param playerId
 * @param roomCode
 * @returns {Promise<string>}
 */
export async function storePlayerToken(playerId, roomCode) {
    const token = crypto.randomBytes(16).toString('hex');
    // token lookup both directions for validation
    await redis.set(`player_token:${playerId}`, JSON.stringify({token, roomCode}), 'EX', ROOM_TTL_SECONDS);
    await redis.set(`token_lookup:${token}`, JSON.stringify({playerId, roomCode}), 'EX', ROOM_TTL_SECONDS);
    return token;
}

/**
 * Invalidate a player's token
 * @param playerId
 * @returns {Promise<boolean>}
 */
export async function invalidatePlayerToken(playerId) {
    const data = await redis.get(`player_token:${playerId}`);
    if (!data) return false;
    const parsed = JSON.parse(data);
    await redis.del(`player_token:${playerId}`);
    await redis.del(`token_lookup:${parsed.token}`);
    return true;
}

/**
 * Invalidate all player tokens in a room
 * @param roomCode
 * @returns {Promise<number>}
 */
export async function invalidateAllRoomTokens(roomCode) {
    const state = await getRoomState(roomCode);
    if (!state) return 0;
    let count = 0;
    for (const p of state.players) {
        const ok = await invalidatePlayerToken(p.id);
        if (ok) count++;
    }
    return count;
}
