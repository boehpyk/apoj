# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A real-time multiplayer "Reverse Karaoke" game. Players record themselves singing a song, the recording is reversed, another player records themselves imitating the reversed audio, then that second recording is reversed again — producing a comically garbled version of the original. Everyone then guesses the original song title and artist. OpenAI scores the guesses.

## Development Commands

All services run inside Docker. Copy `.env.example` to `.env` before first run.

```bash
make up.dev         # Start all services (Postgres, Redis, MinIO, backend, frontend)
make down.dev       # Stop all services
make logs.backend   # Stream backend logs
make logs.frontend  # Stream frontend logs
make logs.all       # Stream all logs
make health         # Check backend health (http://localhost:3000/api/health)

pnpm db:migrate     # Run DB migrations (requires containers running)
pnpm db:seed        # Seed songs table
pnpm db:count       # Count songs in DB
```

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **MinIO Console**: http://localhost:9001 (minioadmin / minioadmin in dev)
- **Backend debugger**: port 9229

## Architecture

### Monorepo Structure

```
packages/
  backend/src/       # Node.js/Fastify backend (ESM)
  frontend/src/      # Vue 3 SPA (ESM)
  shared/constants/  # EVENTS, STATUSES, ROUND_PHASES — shared by both
docker/              # Dockerfiles for backend and frontend
docker-compose.dev.yml
```

### Backend (`packages/backend/src/`)

- **`server.js`** — All REST endpoints and Socket.IO setup. The `io` instance is initialized after Fastify starts and referenced by closure in route handlers.
- **`game-controller.js`** — Round lifecycle: song assignment, FFmpeg audio reversal (via `child_process.spawn`), derangement shuffle for reverse assignments.
- **`room-manager.js`** — Room CRUD; Redis is primary cache, PostgreSQL is source of truth.
- **`auth.js`** — Token-based auth. Tokens are random hex strings stored in Redis (`token_lookup:{token}` → `{playerId, roomCode}`). Passed via `X-Player-Token` header or `?token=` query param.
- **`score-calculator.js`** — OpenAI GPT-4 scores guesses; falls back to Levenshtein distance if AI fails.
- **`storage.js`** — MinIO client wrapper (`audio-recordings` bucket).
- **`database.js`** / **`redis.js`** — Connection singletons.

No ORM. All DB queries use raw parameterized `pg` queries.

### Frontend (`packages/frontend/src/`)

- **`views/GameView.vue`** — The main game screen. It's purely phase-driven: renders a different component per `ROUND_PHASES` value. Registers and cleans up all Socket.IO event handlers.
- **`views/RoomView.vue`** — Lobby (join/create room, wait for host to start).
- **`views/HomeView.vue`** — Landing page.
- **`components/game/`** — One component per game phase: `OriginalRecording.vue`, `ReverseRecording.vue`, `GuessingPhase.vue`, `RoundResults.vue`.
- **`composables/useSocket.js`** — Creates and exposes the Socket.IO client.
- **`composables/useAudioRecorder.js`** — MediaRecorder API wrapper.

Player identity (`playerId`, `playerToken`) is persisted in browser `sessionStorage`.

The frontend imports shared constants directly: `import { ROUND_PHASES } from 'shared/constants/index.js'`.

### Shared (`packages/shared/constants/index.js`)

Single source of truth for:
- `EVENTS` — Socket.IO event names
- `STATUSES` — Game session statuses (`waiting`, `playing`, `ended`)
- `ROUND_PHASES` — Round lifecycle states (see below)

### Game Round Flow

```
ORIGINALS_RECORDING
  → (each player uploads their recording → FFmpeg reverses it)
ORIGINAL_REVERSED_READY (per-player status)
  → (when all players ready) → derangement assigns reverse singers
REVERSED_RECORDING
  → (each assigned player uploads their imitation → FFmpeg reverses it again → final audio)
FINAL_AUDIO_READY (per-player status)
  → (when all done) → transition to guessing
GUESSING
  → (each player listens to final audios and submits guesses)
SCORES_FETCHING
  → (OpenAI assesses all guesses → scores saved to round_scores)
ROUND_ENDED
```

### MinIO Audio Object Paths

```
audio-recordings/
  original/{roundId}/{playerId}.webm
  reversed-original/{roundId}/{playerId}.webm
  reverse-recording/{roundId}/{playerId}.webm
  final-audio/{roundId}/{playerId}.webm
```

### Redis Key Patterns

```
room:{roomCode}         → JSON room state (24h TTL)
round:{roomCode}        → JSON round state (1h TTL)
token_lookup:{token}    → JSON {playerId, roomCode}
player_token:{playerId} → JSON {token, roomCode}
```

## Coding Conventions (from `doc/05-conventions.md`)

- **Prefer simple functions over classes**. Avoid unnecessary abstractions, controllers, repositories, or service layers.
- **Files**: `kebab-case.js`. **Functions**: `camelCase`. **Constants**: `UPPER_SNAKE_CASE`.
- Both packages use ES modules (`"type": "module"`). Always use ESM `import`/`export`.
- Write raw `pg` queries, not ORM abstractions.
- Direct Socket.IO event handlers — no event bus abstractions.
- Log only essential operations (`logger.info`/`logger.error`), not verbose trace logs.
- JSDoc only for public-facing functions.
- All Socket.IO event names must come from `packages/shared/constants/index.js`.

## Key Quirks & Gotchas

- **`io` is a module-level closure** in `server.js`. It's `undefined` until Fastify finishes starting. Route handlers guard with `if (!io) return reply.code(500)`.
- **Player token auth**: Audio streaming endpoints accept `?token=` query param (since `<audio src>` can't set custom headers). Other endpoints use `X-Player-Token` header.
- **FFmpeg is synchronous in-process**: reversal is done inline in upload handlers via `child_process.spawn` + temp files in `os.tmpdir()`. No job queue.
- **Scoring is triggered client-side**: `GameView.vue` calls `POST /api/rounds/:roundId/score` after the last guess is submitted. The endpoint is idempotent-guarded (returns 400 if already scored).
- **Round state is dual-stored**: Redis holds cached round metadata; PostgreSQL `round_player_tracks` holds authoritative per-player status. `getRoundState()` merges both.
- **Derangement shuffle**: Reverse singer assignment ensures no player gets their own recording to reverse (Fisher-Yates with fallback swap).
