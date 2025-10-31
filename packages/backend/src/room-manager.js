// Room manager: create/join/get room state (KISS)
import { query } from './database.js';
import { getRedis } from './redis.js';

const redis = getRedis();
const ROOM_TTL_SECONDS = 86400; // 24h

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function cacheRoom(roomCode, state) {
  await redis.set(`room:${roomCode}`, JSON.stringify(state), 'EX', ROOM_TTL_SECONDS);
  return state;
}

async function hydrateRoom(roomCode) {
  const sessRes = await query('SELECT id, host_id, status FROM game_sessions WHERE room_code = $1', [roomCode]);
  if (!sessRes.rows.length) return null;
  const session = sessRes.rows[0];
  const playersRes = await query('SELECT id, name FROM players WHERE session_id = $1 ORDER BY joined_at ASC', [session.id]);
  const state = {
    roomCode,
    hostId: session.host_id,
    status: session.status,
    players: playersRes.rows.map(r => ({ id: r.id, name: r.name }))
  };
  await cacheRoom(roomCode, state);
  return state;
}

export async function getRoomState(roomCode) {
  const cached = await redis.get(`room:${roomCode}`);
  if (cached) return JSON.parse(cached);
  return hydrateRoom(roomCode);
}

export async function createRoom(playerName) {
  const name = (playerName || '').trim();
  if (name.length < 3) throw new Error('Invalid player name');
  let roomCode;
  let sessionId;
  // Retry until unique code inserted
  for (let i = 0; i < 5; i++) {
    roomCode = generateRoomCode();
    try {
      const res = await query('INSERT INTO game_sessions (room_code, status) VALUES ($1, $2) RETURNING id', [roomCode, 'waiting']);
      sessionId = res.rows[0].id;
      break;
    } catch (e) {
      // Unique violation -> retry
      if (i === 4) throw e;
    }
  }
  const playerRes = await query('INSERT INTO players (session_id, name) VALUES ($1, $2) RETURNING id, name', [sessionId, name]);
  const player = playerRes.rows[0];
  await query('UPDATE game_sessions SET host_id = $1 WHERE id = $2', [player.id, sessionId]);
  const state = { roomCode, hostId: player.id, status: 'waiting', players: [{ id: player.id, name: player.name }] };
  await cacheRoom(roomCode, state);
  return { playerId: player.id, ...state };
}

export async function joinRoom(roomCode, playerName) {
  const code = (roomCode || '').toUpperCase();
  if (code.length !== 6) throw new Error('Invalid room code');
  const name = (playerName || '').trim();
  if (name.length < 3) throw new Error('Invalid player name');
  let state = await getRoomState(code);
  if (!state) throw new Error('Room not found');
  if (state.status !== 'waiting') throw new Error('Room locked');
  // Reject duplicate names (case-insensitive exact)
  if (state.players.some(p => p.name.toLowerCase() === name.toLowerCase())) throw new Error('Name taken');
  // Load session id from DB for insert
  const sessRes = await query('SELECT id FROM game_sessions WHERE room_code = $1', [code]);
  if (!sessRes.rows.length) throw new Error('Room not found');
  const sessionId = sessRes.rows[0].id;
  const playerRes = await query('INSERT INTO players (session_id, name) VALUES ($1, $2) RETURNING id, name', [sessionId, name]);
  const player = playerRes.rows[0];
  state.players.push({ id: player.id, name: player.name });
  await cacheRoom(code, state);
  return { playerId: player.id, ...state };
}

export async function removePlayerFromCache(roomCode, playerId) {
  const state = await getRoomState(roomCode);
  if (!state) return null;
  const before = state.players.length;
  state.players = state.players.filter(p => p.id !== playerId);
  // If host left, clear hostId (room effectively unusable until future improvement)
  if (state.hostId === playerId) {
    state.hostId = null;
  }
  if (state.players.length !== before) {
    await cacheRoom(roomCode, state);
  }
  return state;
}
