---
name: business-logic
description: Authoritative business rules: round lifecycle states, data models, scoring logic, edge cases, and constraints for the Reverse Song Challenge.
---

# Business Logic — Reverse Song Challenge

## Round Lifecycle States

```
originals_recording
  → (all uploaded + reversed) → derangement_assignment
reversed_recording
  → (all uploaded + second-reversed) → guessing
scores_fetching
  → (AI scored) → round_ended
```

Per-player track statuses in `round_player_tracks.status`:
- `originals_recording` — awaiting original upload
- `originals_reversed_ready` — original uploaded and reversed
- `reversed_recording` — awaiting reverse imitation upload
- `final_audio_ready` — imitation uploaded and reversed → final clue ready

Phase transitions are triggered when **all** players reach the required status.

## Key Entities

| Entity | Storage | Notes |
|--------|---------|-------|
| Game session (room) | Redis + PostgreSQL `game_sessions` | room_code is 6-char uppercase |
| Players | Redis (in room state) + PostgreSQL `players` | socket_id tracked for WS |
| Round | Redis (`round:{roomCode}`) + PostgreSQL `rounds` | phase column is authoritative |
| Per-player track | PostgreSQL `round_player_tracks` | one row per player per round |
| Guesses | PostgreSQL `player_guesses` | one row per player per round |
| Scores | PostgreSQL `round_scores` | one row per player per clue |

## Derangement Assignment
- Shuffle player indices until no player maps to themselves (max 20 retries).
- For n=2: force swap.
- Fallback: cyclic shift if retries exhausted.
- Excluded players (missing original): remove from permutation; their clue is skipped.
- Stored as `reverse_player_id` on `round_player_tracks`.

## Audio Pipeline (Both Reversal Passes)
```
Player uploads webm →
  server validates (size ≤10MB, content-type) →
  stores original to MinIO (original/{roundId}/{playerId}.webm) →
  spawns FFmpeg: ffmpeg -y -i input.webm -af areverse output.webm →
  stores reversed to MinIO (reversed-original/{roundId}/{playerId}.webm) →
  updates round_player_tracks.status → originals_reversed_ready
```
Second pass (imitation → final clue):
```
Player uploads imitation →
  stores to MinIO (reverse-recording/{roundId}/{playerId}.webm) →
  spawns FFmpeg areverse →
  stores final to MinIO (final-audio/{roundId}/{originalOwnerId}.webm) →
  updates round_player_tracks.status → final_audio_ready
```
Note: `final_path` is keyed by `originalOwnerId` (the player whose original was used), not the imitation recorder.

## Scoring Logic

```javascript
// AI score (0–10) → base points
basePoints = Math.round(aiScore * 10)  // max 100

// Speed bonus (based on submission time in seconds)
speedBonus = seconds < 30 ? 25 : seconds < 45 ? 15 : 0

// Artist bonus
artistBonus = artistMatches ? 30 : 0

total = basePoints + speedBonus + artistBonus  // max 155
```

Fallback (Levenshtein, when OpenAI unavailable):
- Title exact match → 100 pts
- Title similarity ≥ 0.75 → 80 pts
- Artist similarity ≥ 0.8 → +30 pts

## Guessing Phase Rules
- One submission per player per round (duplicates rejected 400).
- Payload: `{ guesses: [{ clueIndex, title, artist? }] }` — array of all clues at once.
- Scoring triggered when all players submit (or client triggers it after timer).
- The scoring endpoint is idempotent-guarded: returns 400 if `round_scores` already has rows for this round.

## Edge Cases
- **Missing original**: exclude that player from derangement, skip their clue generation.
- **All originals missing**: abort round, no scoring.
- **Missing imitation**: skip that clue entirely; song counts as unused for next round reuse.
- **Duplicate guess entries** for same clueIndex: keep first.
- **OpenAI timeout** (>10s): fall back to Levenshtein automatically.
- **Round already scored**: `POST /score` returns 400 immediately.
