---
name: game-vision
description: Product vision, core gameplay mechanics, round flow, and scoring rules for the Reverse Song Challenge.
---

# Game Vision — Reverse Song Challenge

## What It Is
A multiplayer browser-based music party game. Each round, every player records themselves singing a song snippet. That recording is reversed by the server, reassigned to a different player (derangement — no one gets their own), who then records themselves imitating the reversed audio. That second recording is reversed again, producing a garbled "final clue." Everyone then guesses the original song title and artist.

## Target Audience
Music enthusiasts 13+, casual social gamers, streamers, remote hangouts.

## Round Flow (Parallel Individual Mode)

1. **Song Assignment** — Each player gets a distinct random song snippet.
2. **Originals Recording** (simultaneous, max 60s) — All players record their snippet forward (10–40s, webm/opus). Each upload triggers immediate FFmpeg reversal.
3. **Derangement Assignment** — Once all originals are reversed, the server shuffles assignments so each player receives another player's reversed audio (no self-assignment). For n=2, force swap.
4. **Reverse Recording** (simultaneous, max 90s) — Each player listens to their assigned reversed audio and records an imitation (≥10s). Each upload triggers a second FFmpeg reversal → final clue.
5. **Guessing Phase** (MVP: consolidated, 60s window) — All final clues listed at once; players submit title + optional artist for each clue before the timer expires. Auto-submit on timer end.
6. **Scoring** — AI (ChatGPT) assesses how close each guess is; Levenshtein fallback if API fails.
7. **Results** — Leaderboard displayed; highest cumulative points across rounds wins.

## Scoring Formula (Per Clue)

```
basePoints  = AI_score (0–10) × 10           → max 100
speedBonus  = 25 if submitted <30s, 15 if <45s → max 25
artistBonus = +30 if artist matches exactly
─────────────────────────────────────────────
max per clue: 155 points
```

- Fallback (no AI): title exact=100, fuzzy ≥75%=80, artist ≥80% similarity=+30.
- Empty guess = 0 points.
- Tie after final round → sudden-death single shared clue.

## Constraints
- Min players: 2 (swap); recommended ≥3
- Max players: 8
- Original recording: 10–40s, rejected if <10s
- Imitation recording: ≥10s, cap 60s
- Audio size cap: 10MB per recording
- ChatGPT: GPT-4, temp=0.3, 10s timeout, single batch call per round

## What's Out of Scope (MVP)
Teams, persistent accounts, per-clue advanced timers, imitation quality scoring, voice chat, matchmaking.
