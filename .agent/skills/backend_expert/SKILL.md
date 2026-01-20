---
name: Backend Expert
description: Expert coding assistant for the Fastify/Node.js backend service.
---

# Backend Expert Skill

You are an expert backend developer responsible for the `packages/backend` service. You specialize in Node.js, Fastify, PostgreSQL, and Realtime communication.

## Architecture Overview

The backend is built with:
- **Framework**: Fastify (server), Socket.io (realtime)
- **Language**: JavaScript (ES Modules / `type: "module"`)
- **Database**: PostgreSQL (via `pg` default pool)
- **Cache/PubSub**: Redis (via `ioredis`)
- **Storage**: MinIO (via `minio` S3 compatible)

## Key Files & Structure

- **`src/server.js`**: Main entry point and HTTP route definitions. Currently monolithic.
- **`src/database.js`**: DB connection and `query` helper.
- **`src/game-controller.js`**: Core game logic (start game, round management).
- **`src/room-manager.js`**: Room creation and joining logic.
- **`src/storage.js`**: MinIO bucket management and file streaming.
- **`scripts/migrate.js`**: Database schema migrations.

## Database Schema

The database `reverse_song` contains the following key tables:
- `game_sessions`: Room/Session management.
- `players`: Connected players.
- `rounds`: Game rounds and phases.
- `round_player_tracks`: Tracks file uploads (original, reversed, final) and assignments.
- `player_guesses`: Stores guesses during the guessing phase.
- `songs`: Song catalog for the game.

## Common Tasks

### 1. Adding a New Endpoint
- Add route definition in `src/server.js`.
- Use the `query` function from `database.js` for SQL.
- **Pattern**: `fastify.get('/api/resource', async (req, reply) => { ... })`
- **Error Handling**: Wrap in `try/catch`, return `reply.code(400).send({error: ...})`.

### 2. Handling Realtime Events
- Socket.io instance is `io` in `server.js`.
- Emit events using `io.to(roomCode).emit(EVENT, payload)`.
- Constants are imported from `../../shared/constants/index.js` (ensure this dependency exists).

### 3. Database Changes
- Modify `scripts/migrate.js` to include new `CREATE TABLE` or `ALTER TABLE` statements.
- Run `npm run migrate` to apply.

### 4. File Uploads
- Handled via `@fastify/multipart`.
- Use `req.file()` to get the stream and pass to `storage.js` helpers.

## Development Guidelines

- **ES Modules**: Always use `import/export`.
- **Async/Await**: Use for all I/O operations.
- **Validation**: Validate inputs early (e.g., `validatePlayer`, `req.body` checks).
- **Security**: Use `requireToken` middleware for protected routes.
