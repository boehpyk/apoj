---
name: conventions
description: Coding standards and style conventions for the Reverse Song Challenge codebase — KISS-oriented, functions over classes, direct queries, no unnecessary abstractions.
---

# Coding Conventions

## Core Philosophy: KISS + YAGNI
- Prefer simple functions over classes
- One file = one responsibility
- Implement only what's needed now
- Fail fast — validate inputs early

## Naming
- **Files**: `kebab-case.js` (e.g. `room-manager.js`, `score-calculator.js`)
- **Functions**: `camelCase`
- **Constants**: `UPPER_SNAKE_CASE`
- No class prefixes (`createRoom` not `RoomFactory.create`)

## What NOT to Do
- No class hierarchies, repositories, DTOs, or service layer abstractions
- No complex YAML/JSON config files — use `.env` + JS constants only
- No ORM — use raw parameterized `pg` queries
- No event bus abstractions over Socket.IO
- No over-logging (debug/trace for every step)
- No redundant JSDoc — only on public-facing functions

## Backend Patterns

```javascript
// ✅ Simple route handler
fastify.post('/api/rooms', async (req, reply) => {
  const { playerName } = req.body || {};
  if (!playerName || playerName.length < 3) {
    return reply.code(400).send({ error: 'Invalid player name' });
  }
  const room = await createRoom(playerName);
  reply.send(room);
});

// ✅ Direct DB query
async function getRoomByCode(roomCode) {
  const result = await db.query(
    'SELECT * FROM game_sessions WHERE room_code = $1',
    [roomCode]
  );
  return result.rows[0];
}

// ✅ Simple Redis operation
async function cacheRoomState(roomCode, state) {
  await redis.setex(`room:${roomCode}`, 86400, JSON.stringify(state));
}

// ✅ Socket.IO event handler
io.on('connection', (socket) => {
  socket.on(EVENTS.JOIN_ROOM, async (data) => {
    const { roomCode, playerId } = data || {};
    if (!roomCode || !playerId) return;
    // ... handle
    io.to(roomCode).emit(EVENTS.ROOM_UPDATED, state);
  });
});
```

## Frontend Patterns

```vue
<!-- ✅ Composition API, <script setup>, minimal logic -->
<script setup>
import { ref } from 'vue'
const isRecording = ref(false)

async function startRecording() {
  isRecording.value = true
}
</script>
```

- Use `<script setup>` always — never Options API
- Keep state component-local (`ref`, `reactive`) — no Pinia
- One component per game phase — don't split further unless clearly reusable
- Always clean up Socket.IO listeners in `onBeforeUnmount` using stored handler references

## All Event/Phase Names
Always import from shared — never hardcode strings:
```javascript
import { EVENTS, ROUND_PHASES, STATUSES } from '../../shared/constants/index.js'
// or in frontend:
import { EVENTS, ROUND_PHASES } from 'shared/constants/index.js'
```

## Error Handling
Handle only errors that affect user experience. No custom error class hierarchies.

```javascript
// ✅ Essential validation only
if (!roomCode || roomCode.length !== 6) {
  throw new Error('Invalid room code');
}
```

## Commit Style
```
feat: add audio recording
fix: websocket reconnection
refactor: simplify room creation
```
Short and imperative. One feature per commit.

## Pre-Commit Checklist
- Single responsibility per file
- No `console.log` left in (use `console.error` for real errors only)
- No hardcoded values — use env vars or shared constants
- JSDoc only for public functions
- Tested manually
