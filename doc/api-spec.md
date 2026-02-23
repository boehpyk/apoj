# API Specification

Reverse Karaoke — Backend API Reference

Backend runs at `http://localhost:3000`. All REST endpoints return JSON unless stated otherwise.

---

## Authentication

Two mechanisms exist, used depending on the call site:

| Mechanism | How | Used by |
|---|---|---|
| Header | `X-Player-Token: <token>` | All REST endpoints that require auth (except audio streaming) |
| Query param | `?token=<token>` | Audio streaming endpoints (`/api/audio/*`) — because `<audio src>` cannot set custom headers |

Tokens are 32-character hex strings (16 random bytes), stored in Redis under `token_lookup:{token}` → `{ playerId, roomCode }`. They expire after 24 hours. Tokens are issued when a room is created or joined.

`validatePlayer(req)` (used by most protected endpoints) reads the token, resolves it through Redis, then cross-checks the `roundId` path param against the PostgreSQL `rounds` table to confirm the round belongs to the same room as the token. It returns a context object `{ playerId, roomCode, roundId }`.

---

## REST Endpoints

### GET /api/health
Auth: none
Response 200: `{ status: "ok" }`
Description: Simple liveness probe. Returns immediately without touching the database.

---

### POST /api/rooms
Auth: none
Body: `{ playerName: string }`
Response 200: `{ roomCode: string, sessId: uuid, hostId: uuid, status: "waiting", players: [{ id: uuid, name: string }], playerId: uuid, playerToken: string }`
Response 400: `{ error: string }`
Description: Creates a new game session and registers the calling player as host. Generates a unique 6-character alphanumeric room code (retries up to 5 times on collision). Inserts a `game_sessions` row, a `players` row, sets `host_id`, caches the room in Redis, and issues a player token. `playerName` must be at least 3 characters.

---

### POST /api/rooms/:code/join
Auth: none
Path params: `code` (string, 6-char room code, case-insensitive)
Body: `{ playerName: string }`
Response 200: `{ roomCode: string, sessId: uuid, hostId: uuid, status: "waiting", players: [...], playerId: uuid, playerToken: string }`
Response 400: `{ error: string }` — possible messages: `Invalid room code`, `Invalid player name`, `Room not found`, `Room locked`, `Name taken`
Description: Joins an existing room as a new player. The room must be in `waiting` status. Player names must be at least 3 characters and unique within the room (case-insensitive). Adds a `players` row, updates the Redis cache, and issues a player token.

---

### GET /api/rooms/:code
Auth: none
Path params: `code` (string)
Response 200: `{ roomCode: string, sessId: uuid, hostId: uuid, status: string, players: [{ id: uuid, name: string }] }`
Response 404: `{ error: "Not found" }`
Description: Returns current room state. Reads from Redis first; falls back to PostgreSQL on cache miss. Status is one of `waiting`, `playing`, or `ended`.

---

### POST /api/rooms/:code/start
Auth: none (but validates `playerId` in body matches `hostId` in room state)
Path params: `code` (string)
Body: `{ playerId: uuid }`
Response 200: `{ roomCode: string, roundId: uuid, phase: "originals_recording", assignments: { [playerId]: songId } }`
Response 400: `{ error: string }` — possible messages: `Room not found`, `Not host`, `Already started`, `Need at least 2 players`, `Not enough songs`
Response 500: `{ error: "WebSocket not initialized" }` or `{ error: string }`
Description: Host-only action. Validates that the caller is the host and the room is still waiting. Creates a `rounds` row (round number 1), picks `n` random songs (one per player), inserts `round_player_tracks` rows, caches round state in Redis, and emits `GAME_STARTED` to the Socket.IO room. Requires at least 2 players.
Socket.IO side-effect: emits `game_started` to the room — see Socket.IO section.

---

### GET /api/rooms/:code/round
Auth: none
Path params: `code` (string)
Response 200: `{ roundId: uuid, phase: string, assignments: { [playerId]: songId }, statuses: { [playerId]: string } }`
Response 404: `{ error: "Not found" }`
Description: Returns the current round state for a room. Merges Redis-cached round metadata with live per-player track statuses from PostgreSQL `round_player_tracks`.

---

### POST /api/rooms/:code/end
Auth: none (but validates `playerId` in body matches `hostId`)
Path params: `code` (string)
Body: `{ playerId: uuid }`
Response 200: `{ ok: true, invalidated: number }`
Response 400: `{ error: string }` — possible messages: `Room not found`, `Not host`, `Already ended`
Description: Host-only action. Updates `game_sessions.status` to `ended`, sets `ended_at = NOW()`, then invalidates all player tokens in the room (removes both `player_token:{playerId}` and `token_lookup:{token}` keys from Redis). Returns the count of tokens invalidated.

---

### GET /api/rounds/:roundId/song
Auth: `X-Player-Token` header (or `?token=` query param)
Path params: `roundId` (uuid)
Response 200: `{ id: uuid, title: string, lyrics: string, duration: number, midi_file_path: string, audioProxyUrl: string }`
Response 400: `{ error: string }` — e.g. `Assignment not found`, `Song not found`
Response 401: `{ error: string }`
Description: Returns the song assigned to the authenticated player for this round, plus a proxy URL to stream the audio. The `audioProxyUrl` is of the form `/api/audio/song/{songId}?roundId={roundId}` and requires the same token for access.

---

### POST /api/rounds/:roundId/original-recording
Auth: `X-Player-Token` header (or `?token=` query param)
Path params: `roundId` (uuid)
Body: `multipart/form-data` with a single audio file field (any `audio/*` MIME type, max 10 MB)
Response 200: `{ ok: true, original: string, reversed: string }`
Response 400: `{ error: string }` — e.g. `No file`, `Invalid type`, `File too large`, `Track not found`, `Already uploaded`, `ffmpeg failed`
Response 401: `{ error: string }`
Response 500: `{ error: "WebSocket not initialized" }`
Description: Accepts the player's original singing recording. Validates the player's track is still in `originals_recording` status, stores the raw file to MinIO at `original/{roundId}/{playerId}.webm`, synchronously reverses it via FFmpeg (`areverse` filter, using temp files in `os.tmpdir()`), stores the reversed file at `reversed-original/{roundId}/{playerId}.webm`, and updates the `round_player_tracks` row to `original_reversed_ready`.
After upload, emits `ORIGINAL_UPLOADED` to the room. If all players have now uploaded, triggers derangement assignment (no player gets their own recording) and emits `REVERSED_RECORDING_STARTED`.

---

### POST /api/rounds/:roundId/reverse-recording
Auth: `X-Player-Token` header (or `?token=` query param)
Path params: `roundId` (uuid)
Body: `multipart/form-data` with a single audio file field (any `audio/*` MIME type, max 10 MB)
Response 200: `{ ok: true, reverseRecording: string, finalAudio: string }`
Response 400: `{ error: string }` — e.g. `No file`, `Invalid type`, `File too large`, `No reverse assignment found`, `Not in reverse recording phase`, `Round not found`, `ffmpeg failed`
Response 401: `{ error: string }`
Description: Accepts the player's imitation of the reversed audio. Looks up which original track this player is assigned to reverse (via `reverse_player_id` in `round_player_tracks`), stores the imitation at `reverse-recording/{roundId}/{playerId}.webm`, reverses it again via FFmpeg to produce the final garbled audio, stores it at `final-audio/{roundId}/{playerId}.webm`, and updates the original owner's track row to `final_audio_ready`.
Emits `REVERSE_RECORDING_UPLOADED` to the room. If all players are done, updates the round phase to `guessing` in PostgreSQL and emits `GUESSING_STARTED`.

---

### GET /api/rounds/:roundId/clues
Auth: `X-Player-Token` header (or `?token=` query param)
Path params: `roundId` (uuid)
Response 200: `{ clues: [{ clueIndex: number, originalPlayerId: uuid, imitationPlayerId: uuid, imitationPlayerName: string, songId: uuid, finalAudioUrl: string }] }`
Response 401: `{ error: string }`
Response 500: `{ error: "Failed to fetch clues" }`
Description: Returns all final audio clues for the guessing phase. Each clue includes an audio URL (`/api/audio/final/{roundId}/{originalPlayerId}`) that requires the player's token. Clues are ordered by `original_player_id`. Only returns tracks where `final_path IS NOT NULL`.

---

### POST /api/rounds/:roundId/guess
Auth: `X-Player-Token` header (or `?token=` query param)
Path params: `roundId` (uuid)
Body: `{ guesses: [{ clueIndex: number, title: string, artist: string, notes?: string }] }`
Response 200: `{ ok: true, submittedCount: number, totalPlayers: number }`
Response 400: `{ error: string }` — e.g. `Guesses array required`, `Round not found`, `Not in guessing phase`, `Already submitted`
Response 401: `{ error: string }`
Response 500: `{ error: "Failed to submit guess" }`
Description: Records the player's guesses for all clues in the round. The round must be in `guessing` phase. Each player may only submit once (idempotent guard on `player_guesses` table). Guesses are stored as JSONB. When all players have submitted, updates the round phase to `scores_fetching` and emits `GUESSING_ENDED` to the room.

---

### POST /api/rounds/:roundId/score
Auth: `X-Player-Token` header (or `?token=` query param)
Path params: `roundId` (uuid)
Response 200: `{ ok: true, scores: [{ playerId: uuid, playerName: string, clueIndex: number, basePoints: number, speedBonus: number, artistBonus: number, total: number, aiScore: number, reasoning: string }] }`
Response 400: `{ error: string }` — `Round not found`, `Round already scored`, `No guesses submitted`
Response 401: `{ error: string }`
Response 500: `{ error: "Failed to calculate scores" }`
Description: Triggers AI scoring of all guesses. Idempotent-guarded: returns 400 if `round_scores` already has entries for this round. Fetches all original songs and player guesses, calls `assessGuessesWithAI()` (OpenAI GPT-4 with Levenshtein fallback if the API key is absent or the call fails), computes `basePoints` (aiScore × 10), `speedBonus` (25 pts if < 30s, 15 pts if < 45s — currently hardcoded to 45s), and `artistBonus` (30 pts if artist similarity ≥ 0.8). Maximum 155 points per clue. Saves results to `round_scores`, updates round phase to `round_ended`, and emits `SCORES_FETCHING_ENDED` to the room.
Note: This endpoint is intended to be called by the client-side after the last guess is submitted, not automatically by the server.

---

### GET /api/rounds/:roundId/results
Auth: `X-Player-Token` header (or `?token=` query param)
Path params: `roundId` (uuid)
Response 200:
```json
{
  "clues": [
    {
      "clueIndex": 0,
      "correctTitle": "string",
      "correctArtist": "string",
      "playerScores": [
        {
          "playerId": "uuid",
          "playerName": "string",
          "guessTitle": "string",
          "guessArtist": "string",
          "aiScore": 8.5,
          "basePoints": 85,
          "speedBonus": 15,
          "artistBonus": 30,
          "totalPoints": 130,
          "reasoning": "string"
        }
      ]
    }
  ],
  "leaderboard": [
    { "playerId": "uuid", "playerName": "string", "totalScore": 260 }
  ]
}
```
Response 401: `{ error: string }`
Response 500: `{ error: "Failed to fetch results" }`
Description: Returns per-clue score breakdowns and an overall leaderboard sorted by total score descending. Joins `round_scores`, `players`, `round_player_tracks`, `songs`, and `player_guesses`. Clues are ordered by `clue_index`; players within each clue are ordered by `total_points DESC`.

---

### GET /api/audio/song/:songId
Auth: `?token=` query param (required)
Path params: `songId` (uuid)
Query params: `roundId` (uuid, required), `token` (string, required)
Rate limit: 5 requests per 10 seconds per IP
Response 200: Audio stream (`audio/mpeg` or `audio/webm` depending on file extension, or `application/octet-stream` as fallback). `Cache-Control: no-cache`.
Response 400: `{ error: "Missing params" }`
Response 403: `{ error: "Forbidden" }` — token invalid, round/room mismatch, or player not assigned this song
Response 404: `{ error: "Not found" }` — song not in DB or not in MinIO
Description: Secure proxy for streaming the original song reference audio (the song the player is supposed to sing). Verifies the token is valid and belongs to the same room as the round, then checks `round_player_tracks` to confirm this player is actually assigned the requested song in this round. Streams the file from MinIO (`audio-recordings` bucket, path from `songs.midi_file_path`).

---

### GET /api/audio/reversed/:roundId/:playerId
Auth: `?token=` query param (required)
Path params: `roundId` (uuid), `playerId` (uuid, the original recording owner)
Query params: `token` (string, required)
Rate limit: 5 requests per 10 seconds per IP
Response 200: Audio stream (`audio/webm`). `Cache-Control: no-cache`.
Response 400: `{ error: "Missing params" }`
Response 403: `{ error: "Not assigned or not ready" }` — the requesting player is not assigned to reverse this particular original, or the reversed file is not yet available
Response 404: `{ error: "Not found" }`
Description: Secure proxy for streaming the reversed-original audio that a reverse singer needs to listen to and imitate. Verifies the requesting player is specifically assigned (`reverse_player_id`) to reverse the given `playerId`'s original in this round, then streams the `reversed_path` file from MinIO.

---

### GET /api/audio/final/:roundId/:playerId
Auth: `?token=` query param (required)
Path params: `roundId` (uuid), `playerId` (uuid, the original recording owner)
Query params: `token` (string, required)
Rate limit: 10 requests per 10 seconds per IP
Response 200: Audio stream (`audio/webm`). `Cache-Control: no-cache`.
Response 400: `{ error: "Missing params" }`
Response 403: `{ error: "Forbidden" }` — token invalid or round/room mismatch
Response 404: `{ error: "Final audio not found" }` or `{ error: "Not found" }`
Description: Streams the final garbled audio for guessing (the output of reversing the reverse recording). Any authenticated player in the same room can request any clue's final audio. Streams the `final_path` file from MinIO.

---

## Socket.IO Events

The Socket.IO server is mounted on the same HTTP server as Fastify, with `cors: { origin: '*' }`.

### Event: join_room (client → server)
Payload: `{ roomCode: string, playerId: uuid }`
Emits back (server → client):
- `player_joined` → to all other sockets in the room: `{ playerId: uuid }`
- `room_updated` → to all sockets in the room (including sender): full room state object
- `game_started` → to sender only (if a round is already in progress): `{ roomCode: string, roundId: uuid, phase: string }`

Description: Called by the client immediately after receiving credentials from `POST /api/rooms` or `POST /api/rooms/:code/join`. The server validates that the room exists and that the `playerId` is a registered member of it. Joins the socket to a Socket.IO room keyed by `roomCode`. Stores `{ roomCode, playerId }` in the in-memory `connections` map (keyed by `socket.id`). If a round is already running (reconnect scenario), re-emits `game_started` to the rejoining socket so it can restore its UI state.
Note: `playerToken` is not validated in this event handler — only `playerId` membership in the room is checked.

---

### Event: disconnect (client → server, built-in)
Payload: none (Socket.IO lifecycle event)
Emits back:
- `player_left` → to all other sockets in the room: `{ playerId: uuid }`

Description: Fired automatically by Socket.IO when a socket disconnects. Removes the entry from the `connections` map and notifies remaining players. Does not invalidate the player's token (token invalidation is commented out).

---

## Server-Emitted Events (server → client, triggered by REST calls)

These events are emitted as side-effects of REST endpoint calls. Clients should register handlers for all of them in `GameView.vue`.

### game_started
Trigger: `POST /api/rooms/:code/start` succeeds, or on `join_room` if a round is in progress
Payload: `{ roomCode: string, roundId: uuid, phase: "originals_recording" }`
Description: Signals all players to enter the game screen and begin the originals recording phase.

---

### original_uploaded
Trigger: `POST /api/rounds/:roundId/original-recording` succeeds for any player
Payload: `{ playerId: uuid, roundId: uuid, uploadedCount: number, totalPlayers: number }`
Description: Progress indicator. Lets all players know how many originals have been successfully reversed (i.e. are in `original_reversed_ready` status).

---

### reversed_recording_started
Trigger: All players have uploaded originals (all tracks reach `original_reversed_ready`)
Payload: `{ roundId: uuid, reverseMap: { [originalOwnerId]: reverseActorId } }`
Description: Signals the start of the reverse recording phase. `reverseMap` tells each player which original recording they are responsible for imitating — the client should extract its own assignment from the map using the player's own ID as the value to look up against.

---

### reverse_recording_uploaded
Trigger: `POST /api/rounds/:roundId/reverse-recording` succeeds for any player
Payload: `{ playerId: uuid, roundId: uuid, originalOwnerId: uuid, uploadedCount: number, totalPlayers: number }`
Description: Progress indicator. Lets all players know how many final audios are ready (tracks in `final_audio_ready` status). `originalOwnerId` identifies whose original track just got its final audio produced.

---

### guessing_started
Trigger: All players have uploaded reverse recordings (all tracks reach `final_audio_ready`)
Payload: `{ roundId: uuid, phase: "guessing", submittedCount: 0, totalPlayers: number }`
Description: Signals the start of the guessing phase. All final audios are ready; clients should fetch clues from `GET /api/rounds/:roundId/clues`.

---

### guessing_ended
Trigger: Last player submits their guesses via `POST /api/rounds/:roundId/guess`
Payload: `{ roundId: uuid, phase: "scores_fetching" }`
Description: All guesses are in. The client that triggered this (i.e. the last submitter) should call `POST /api/rounds/:roundId/score` to kick off AI scoring.

---

### scores_fetching_ended
Trigger: `POST /api/rounds/:roundId/score` completes successfully
Payload: `{ roundId: uuid, scores: [{ playerId, playerName, clueIndex, basePoints, speedBonus, artistBonus, total, aiScore, reasoning }] }`
Description: AI scoring is complete and the round is over (`round_ended` phase). Clients should transition to the results screen. Full results (with correct answers) are available via `GET /api/rounds/:roundId/results`.

---

### player_joined
Trigger: A player successfully calls the `join_room` Socket.IO event
Payload: `{ playerId: uuid }`
Emitted to: All other sockets in the room (not the joining socket itself)
Description: Notifies existing room members that a new player has connected their socket.

---

### player_left
Trigger: A socket disconnects
Payload: `{ playerId: uuid }`
Emitted to: All other sockets in the room
Description: Notifies remaining players that a member's socket dropped.

---

### room_updated
Trigger: A player successfully calls the `join_room` Socket.IO event
Payload: Full room state object — `{ roomCode, sessId, hostId, status, players: [{ id, name }] }`
Emitted to: All sockets in the room including the joining one
Description: Broadcasts the latest room state so all lobby members can refresh their player list.

---

## Round Phase State Machine

For reference, the valid phase values (from `packages/shared/constants/index.js`) and their transitions:

| Phase | Value | Description |
|---|---|---|
| `ORIGINALS_RECORDING` | `originals_recording` | Players sing and upload originals |
| `ORIGINAL_REVERSED_READY` | `originals_reversed_ready` | Per-player: original reversed by FFmpeg |
| `REVERSED_RECORDING` | `reversed_recording` | Players imitate the reversed audio |
| `FINAL_AUDIO_READY` | `final_audio_ready` | Per-player: reverse recording reversed again |
| `GUESSING` | `guessing` | Players listen and guess song titles |
| `SCORES_FETCHING` | `scores_fetching` | AI is scoring guesses |
| `ROUND_ENDED` | `round_ended` | Scores saved, results available |

The `phase` column on the `rounds` table reflects the room-wide phase. Individual player progress is tracked in `round_player_tracks.status` using the same constants.
