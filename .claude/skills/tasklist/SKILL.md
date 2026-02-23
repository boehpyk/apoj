---
name: tasklist
description: Current development progress — what iterations are complete and what remains to be built.
---

# Development Progress

## Status Summary

| Iteration | Feature | Status |
|-----------|---------|--------|
| 0 | Project Setup | ✅ Complete |
| 1 | Database & Storage | ✅ Complete |
| 2 | Basic Room System | ✅ Complete |
| 3 | WebSocket Foundation | ✅ Complete |
| 4 | Round Orchestration & Song Assignment | ✅ Complete |
| 5 | Recording (Original) | ✅ Complete |
| 6 | Audio Reversal (First Pass) | ✅ Complete |
| 7 | Recording (Reverse) | ✅ Complete |
| 8 | Guessing Phase | ✅ Complete |
| 9 | Scoring & Leaderboard | ✅ Complete |
| 10 | Frontend Polish | ⏳ Pending |

## What's Built (Iterations 0–9)

The full game loop is functionally complete end-to-end:
- Room create/join with 6-char codes, Redis + PostgreSQL persistence
- Real-time Socket.IO events for all phase transitions
- Per-player song assignment with derangement shuffle
- Original audio upload → FFmpeg reversal (inline, no job queue)
- Reverse imitation upload → second FFmpeg reversal → final clue
- Consolidated guessing phase with timer and auto-submit
- OpenAI GPT-4 scoring with Levenshtein fallback
- Round results leaderboard with score breakdowns

## What Remains (Iteration 10: Frontend Polish)

### Frontend
- [ ] Loading & error states (currently silently fails in places)
- [ ] Toast notifications for user feedback
- [ ] Responsive / mobile layout
- [ ] Animations (player joins, score reveals)
- [ ] Copy room code button (partially done in RoomView)
- [ ] Connection status indicator
- [ ] Leave room confirmation dialog

### Backend
- [ ] Input validation schemas (currently ad-hoc checks)
- [ ] Old/expired room cleanup job
- [ ] Temp audio file cleanup (`/tmp/` after FFmpeg)

### Testing
- [ ] Mobile & slow network scenarios
- [ ] 8-player stress test

## Backlog (Post-MVP)
- Real-time upload progress events
- Spectator late-join (read-only)
- Profanity filter
- Persistent user accounts
- Cosmetic avatars
- Per-clue timed guessing (vs. current consolidated window)
- Sudden-death tiebreaker round
