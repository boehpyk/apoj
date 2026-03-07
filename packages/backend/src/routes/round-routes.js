import { validatePlayer } from '../auth.js';
import {
    getAssignedOriginalSong,
    uploadOriginalRecord,
    uploadReverseRecording,
    attemptAssignReverseRolesAndEmit
} from '../game-controller.js';
import { validateInputFile } from '../validators.js';
import { query } from '../database.js';
import { assessGuessesWithAI, calculateScore, checkArtistMatch } from '../score-calculator.js';
import { EVENTS, ROUND_PHASES } from '../../../shared/constants/index.js';
import { getRoomState } from '../room-manager.js';
import { deleteObjectsByPrefix } from '../storage.js';

/**
 * Fetches a round row joined with its game session's room_code.
 *
 * @param {string} roundId - UUID of the round
 * @returns {Promise<{id: string, phase: string, guessing_started_at: Date|null, room_code: string}|null>}
 */
async function fetchRoundWithRoom(roundId) {
    const res = await query(
        `SELECT r.id, r.phase, r.guessing_started_at, gs.room_code
         FROM rounds r
         JOIN game_sessions gs ON r.session_id = gs.id
         WHERE r.id = $1`,
        [roundId]
    );
    return res.rows[0] ?? null;
}

/**
 * Atomically transitions a round from SCORES_FETCHING → ROUND_ENDED.
 * Only the first concurrent caller wins; subsequent callers return false.
 *
 * @param {string} roundId - UUID of the round
 * @returns {Promise<boolean>} true if this call claimed scoring rights
 */
async function claimScoringRights(roundId) {
    const res = await query(
        `UPDATE rounds SET phase = $1 WHERE id = $2 AND phase = $3 RETURNING id`,
        [ROUND_PHASES.ROUND_ENDED, roundId, ROUND_PHASES.SCORES_FETCHING]
    );
    return res.rows.length > 0;
}

/**
 * Fetches all original songs assigned for a round, ordered by player_id.
 * Each song gets a 0-based clue_index matching the order used when scores were recorded.
 *
 * @param {string} roundId - UUID of the round
 * @returns {Promise<Array<{clueIndex: number, playerId: string, songId: string, title: string, artist: string}>>}
 */
async function fetchOriginalSongs(roundId) {
    const res = await query(
        `SELECT rpt.player_id, rpt.song_id, s.title, s.artist,
                ROW_NUMBER() OVER (ORDER BY rpt.player_id) - 1 as clue_index
         FROM round_player_tracks rpt
         JOIN songs s ON rpt.song_id = s.id
         WHERE rpt.round_id = $1
         ORDER BY rpt.player_id`,
        [roundId]
    );
    return res.rows.map(row => ({
        clueIndex: parseInt(row.clue_index),
        playerId: row.player_id,
        songId: row.song_id,
        title: row.title,
        artist: row.artist
    }));
}

/**
 * Fetches all player guesses submitted for a round, joined with player names.
 *
 * @param {string} roundId - UUID of the round
 * @returns {Promise<Array<{playerId: string, playerName: string, guesses: object[], submittedAt: Date}>>}
 */
async function fetchPlayerGuesses(roundId) {
    const res = await query(
        `SELECT pg.player_id, pg.guesses, pg.submitted_at, p.name as player_name
         FROM player_guesses pg
         JOIN players p ON pg.player_id = p.id
         WHERE pg.round_id = $1`,
        [roundId]
    );
    return res.rows.map(row => ({
        playerId: row.player_id,
        playerName: row.player_name,
        guesses: row.guesses,
        submittedAt: row.submitted_at
    }));
}

/**
 * Computes the score for one (player, clue) assessment and inserts it into round_scores.
 * Speed bonus is calculated from guessingStartedAt to the player's submission time.
 *
 * @param {string} roundId
 * @param {{playerId: string, clueIndex: number, aiScore: number, reasoning: string, usedFallback: boolean}} assessment
 * @param {{playerId: string, playerName: string, guesses: object[], submittedAt: Date}} playerGuess
 * @param {{clueIndex: number, title: string, artist: string}} original
 * @param {Date|null} guessingStartedAt
 * @returns {Promise<object|null>} Score result row for the response, or null if data missing
 */
async function computeAndSaveScore(roundId, assessment, playerGuess, original, guessingStartedAt) {
    const guess = playerGuess.guesses.find(g => g.clueIndex === assessment.clueIndex);
    if (!guess) return null;

    let submissionTimeSeconds = 45; // fallback if timestamps unavailable
    if (guessingStartedAt && playerGuess.submittedAt) {
        const submittedAt = new Date(playerGuess.submittedAt);
        submissionTimeSeconds = Math.max(0, (submittedAt - guessingStartedAt) / 1000);
    }

    const artistMatch = checkArtistMatch(guess.artist, original.artist);
    const scoreBreakdown = calculateScore(assessment.aiScore, submissionTimeSeconds, artistMatch);

    await query(
        `INSERT INTO round_scores
         (round_id, player_id, clue_index, ai_score, base_points, speed_bonus, artist_bonus, total_points, reasoning, used_fallback)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
            roundId,
            assessment.playerId,
            assessment.clueIndex,
            assessment.aiScore,
            scoreBreakdown.basePoints,
            scoreBreakdown.speedBonus,
            scoreBreakdown.artistBonus,
            scoreBreakdown.total,
            assessment.reasoning,
            assessment.usedFallback
        ]
    );

    return {
        playerId: assessment.playerId,
        playerName: playerGuess.playerName,
        clueIndex: assessment.clueIndex,
        songTitle: original.title,
        songArtist: original.artist,
        ...scoreBreakdown,
        aiScore: assessment.aiScore,
        reasoning: assessment.reasoning
    };
}

/**
 * Fetches all round scores joined with player names, song info, per-player guesses,
 * and singer info. Uses a CTE to assign clue_index by player_id order.
 *
 * @param {string} roundId - UUID of the round
 * @returns {Promise<object[]>} Raw DB rows
 */
async function fetchRoundScoresWithDetails(roundId) {
    const res = await query(
        `WITH player_clue_map AS (
            SELECT
                rpt.player_id,
                rpt.song_id,
                rpt.reverse_player_id,
                ROW_NUMBER() OVER (ORDER BY rpt.player_id) - 1 AS clue_index
            FROM round_player_tracks rpt
            WHERE rpt.round_id = $1
        )
        SELECT
            rs.player_id,
            p.name as player_name,
            rs.clue_index,
            rs.ai_score,
            rs.base_points,
            rs.speed_bonus,
            rs.artist_bonus,
            rs.total_points,
            rs.reasoning,
            rs.used_fallback,
            s.title as correct_title,
            s.artist as correct_artist,
            pg.guesses,
            pcm.reverse_player_id as singer_player_id,
            singer.name as singer_player_name
        FROM round_scores rs
        JOIN players p ON rs.player_id = p.id
        JOIN player_clue_map pcm ON pcm.clue_index = rs.clue_index
        JOIN songs s ON pcm.song_id = s.id
        LEFT JOIN players singer ON singer.id = pcm.reverse_player_id
        LEFT JOIN player_guesses pg ON rs.player_id = pg.player_id AND rs.round_id = pg.round_id
        WHERE rs.round_id = $1
        ORDER BY rs.clue_index, rs.total_points DESC`,
        [roundId]
    );
    return res.rows;
}

/**
 * Transforms raw score rows into per-clue breakdowns and a sorted leaderboard.
 * Singer bonus (30% of clue's total points) is credited to the reverse singer.
 * Pure function — no DB calls.
 *
 * @param {object[]} rows - Rows from fetchRoundScoresWithDetails
 * @returns {{clues: object[], leaderboard: object[]}}
 */
function buildResultsPayload(rows) {
    const clueResults = {};
    const playerTotals = {};

    for (const row of rows) {
        const clueIndex = row.clue_index;

        if (!clueResults[clueIndex]) {
            clueResults[clueIndex] = {
                clueIndex,
                correctTitle: row.correct_title,
                correctArtist: row.correct_artist,
                singerPlayerId: row.singer_player_id,
                singerPlayerName: row.singer_player_name,
                playerScores: []
            };
        }

        const guesses = row.guesses ?? [];
        const playerGuess = guesses.find(g => g.clueIndex === clueIndex);

        clueResults[clueIndex].playerScores.push({
            playerId: row.player_id,
            playerName: row.player_name,
            guessTitle: playerGuess?.title || '',
            guessArtist: playerGuess?.artist || '',
            aiScore: row.ai_score,
            basePoints: row.base_points,
            speedBonus: row.speed_bonus,
            artistBonus: row.artist_bonus,
            totalPoints: row.total_points,
            reasoning: row.reasoning
        });

        if (!playerTotals[row.player_id]) {
            playerTotals[row.player_id] = {
                playerId: row.player_id,
                playerName: row.player_name,
                totalScore: 0
            };
        }
        playerTotals[row.player_id].totalScore += row.total_points;
    }

    const SINGER_BONUS_MULTIPLIER = 0.3;
    for (const clue of Object.values(clueResults)) {
        const sumOfPoints = clue.playerScores.reduce((sum, ps) => sum + ps.totalPoints, 0);
        clue.singerBonus = Math.round(sumOfPoints * SINGER_BONUS_MULTIPLIER);

        if (clue.singerPlayerId && clue.singerBonus > 0) {
            if (!playerTotals[clue.singerPlayerId]) {
                playerTotals[clue.singerPlayerId] = {
                    playerId: clue.singerPlayerId,
                    playerName: clue.singerPlayerName,
                    totalScore: 0
                };
            }
            playerTotals[clue.singerPlayerId].totalScore += clue.singerBonus;
        }
    }

    const leaderboard = Object.values(playerTotals).sort((a, b) => b.totalScore - a.totalScore);
    return { clues: Object.values(clueResults), leaderboard };
}

/**
 * Returns the number of players who have submitted guesses and the total player count for the round.
 *
 * @param {string} roundId - UUID of the round
 * @returns {Promise<{submittedCount: number, totalPlayers: number}>}
 */
async function getGuessingProgress(roundId) {
    const [countRes, totalRes] = await Promise.all([
        query('SELECT COUNT(*) as count FROM player_guesses WHERE round_id = $1', [roundId]),
        query('SELECT COUNT(*) as count FROM round_player_tracks WHERE round_id = $1', [roundId])
    ]);
    return {
        submittedCount: parseInt(countRes.rows[0].count),
        totalPlayers: parseInt(totalRes.rows[0].count)
    };
}

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {() => import('socket.io').Server} getIo
 */
export function registerRoundRoutes(fastify, getIo) {
    /**
     * Get assigned original song for player in round
     */
    fastify.get('/api/rounds/:roundId/song', async (req, reply) => {
        let ctx = null;
        try {
            ctx = await validatePlayer(req);
        } catch (e) {
            return reply.code(401).send({
                error: e.message
            });
        }

        try {
            const {song, audioProxyUrl} = await getAssignedOriginalSong(ctx);
            reply.send({...song, audioProxyUrl});
        } catch (e) {
            reply.code(400).send({
                error: e.message
            });
        }
    });

    /**
     * Upload original recording endpoint
     */
    fastify.post('/api/rounds/:roundId/original-recording', async (req, reply) => {
        const io = getIo();
        if (!io) {
            return reply.code(500).send({
                error: 'WebSocket not initialized'
            });
        }

        let ctx;
        try {
            ctx = await validatePlayer(req);
        } catch (e) {
            return reply.code(401).send({
                error: e.message
            });
        }

        const file = await req.file();
        try {
            validateInputFile(file)
        } catch (e) {
            return reply.code(400).send({error: e.message});
        }

        try {
            const { roomCode, originalObjectName, reversedObjectName } = await uploadOriginalRecord(ctx, file);
            const roundId = ctx.roundId;
            const playerId = ctx.playerId;

            const statusesRes = await query('SELECT status FROM round_player_tracks WHERE round_id = $1', [roundId]);
            const allUploaded = statusesRes.rows.every(r => r.status === ROUND_PHASES.ORIGINAL_REVERSED_READY);
            io.to(roomCode).emit(EVENTS.ORIGINAL_UPLOADED, {
                playerId,
                roundId,
                uploadedCount: statusesRes.rows.filter(r => r.status === ROUND_PHASES.ORIGINAL_REVERSED_READY).length,
                totalPlayers: statusesRes.rows.length
            });
            if (allUploaded) {
                await attemptAssignReverseRolesAndEmit(io, roomCode);
            }
            reply.send({
                ok: true,
                original: originalObjectName,
                reversed: reversedObjectName
            });
        } catch (e) {
            reply.code(400).send({error: e.message});
        }
    });

    /**
     * Upload reverse recording endpoint
     */
    fastify.post('/api/rounds/:roundId/reverse-recording', async (req, reply) => {
        let ctx = null;
        try {
            ctx = await validatePlayer(req);
        } catch (e) {
            return reply.code(401).send({
                error: e.message
            });
        }

        const file = await req.file();
        try {
            validateInputFile(file);
        } catch (e) {
            return reply.code(400).send({error: e.message});
        }

        try {
            const { roomCode, reverseRecordingObjectName, finalAudioObjectName, originalOwnerId } = await uploadReverseRecording(ctx, file);
            const roundIdValue = ctx.roundId;
            const playerId = ctx.playerId;

            const io = getIo();

            // Check if all reverse recordings are uploaded
            const statusesRes = await query('SELECT status FROM round_player_tracks WHERE round_id = $1', [roundIdValue]);
            const allFinalReady = statusesRes.rows.every(r => r.status === ROUND_PHASES.FINAL_AUDIO_READY);

            io.to(roomCode).emit(EVENTS.REVERSE_RECORDING_UPLOADED, {
                playerId,
                roundId: roundIdValue,
                originalOwnerId,
                uploadedCount: statusesRes.rows.filter(r => r.status === ROUND_PHASES.FINAL_AUDIO_READY).length,
                totalPlayers: statusesRes.rows.length
            });

            if (allFinalReady) {
                // All reverse recordings done, transition to guessing phase
                await query('UPDATE rounds SET phase = $1, guessing_started_at = NOW() WHERE id = $2', [ROUND_PHASES.GUESSING, roundIdValue]);
                io.to(roomCode).emit(EVENTS.GUESSING_STARTED, {
                    roundId: roundIdValue,
                    phase: ROUND_PHASES.GUESSING,
                    submittedCount: 0,
                    totalPlayers: statusesRes.rows.length
                });
            }

            reply.send({
                ok: true,
                reverseRecording: reverseRecordingObjectName,
                finalAudio: finalAudioObjectName
            });
        } catch (e) {
            reply.code(400).send({error: e.message});
        }
    });

    /**
     * Get clues for guessing phase
     * GET /api/rounds/:roundId/clues
     */
    fastify.get('/api/rounds/:roundId/clues', async (req, reply) => {
        let ctx = null;
        try {
            ctx = await validatePlayer(req);
        } catch (e) {
            return reply.code(401).send({ error: e.message });
        }

        const { roundId } = req.params;

        try {
            // Get all final audio tracks for this round
            const tracksRes = await query(
                `SELECT
                    rpt.player_id as original_player_id,
                    rpt.reverse_player_id as imitation_player_id,
                    rpt.final_path,
                    rpt.song_id,
                    op.name as original_player_name,
                    ip.name as imitation_player_name
                FROM round_player_tracks rpt
                LEFT JOIN players op ON op.id = rpt.player_id
                LEFT JOIN players ip ON ip.id = rpt.reverse_player_id
                WHERE rpt.round_id = $1
                AND rpt.final_path IS NOT NULL
                ORDER BY rpt.player_id`,
                [roundId]
            );

            const clues = tracksRes.rows.map((row, index) => ({
                clueIndex: index,
                originalPlayerId: row.original_player_id,
                originalPlayerName: row.original_player_name || 'Unknown',
                imitationPlayerId: row.imitation_player_id,
                imitationPlayerName: row.imitation_player_name || 'Unknown',
                songId: row.song_id,
                finalAudioUrl: `/api/audio/final/${roundId}/${row.original_player_id}`
            }));

            reply.send({ clues });
        } catch (e) {
            reply.code(500).send({ error: 'Failed to fetch clues' });
        }
    });

    /**
     * Submit guesses for the round
     * POST /api/rounds/:roundId/guess
     */
    fastify.post('/api/rounds/:roundId/guess', async (req, reply) => {
        let ctx = null;
        try {
            ctx = await validatePlayer(req);
        } catch (e) {
            return reply.code(401).send({ error: e.message });
        }

        const { roundId } = req.params;
        const { guesses } = req.body || {};

        if (!Array.isArray(guesses) || guesses.length === 0) {
            return reply.code(400).send({ error: 'Guesses array required' });
        }

        try {
            const round = await fetchRoundWithRoom(roundId);

            if (!round) {
                return reply.code(404).send({ error: 'Round not found' });
            }
            if (round.phase !== ROUND_PHASES.GUESSING) {
                return reply.code(400).send({ error: 'Not in guessing phase' });
            }

            // Check if player already submitted
            const existingRes = await query(
                'SELECT id FROM player_guesses WHERE round_id = $1 AND player_id = $2',
                [roundId, ctx.playerId]
            );

            if (existingRes.rows.length > 0) {
                return reply.code(400).send({ error: 'Already submitted' });
            }

            // Store guesses (for now, just store as JSONB)
            await query(
                `INSERT INTO player_guesses (round_id, player_id, guesses, submitted_at)
                 VALUES ($1, $2, $3, NOW())`,
                [roundId, ctx.playerId, JSON.stringify(guesses)]
            );

            const { submittedCount, totalPlayers } = await getGuessingProgress(roundId);

            const io = getIo();
            io.to(round.room_code).emit(EVENTS.GUESS_SUBMITTED, {
                roundId,
                submittedCount,
                totalPlayers,
            });

            if (submittedCount >= totalPlayers) {
                await query(
                    'UPDATE rounds SET phase = $1 WHERE id = $2 AND phase = $3',
                    [ROUND_PHASES.SCORES_FETCHING, roundId, ROUND_PHASES.GUESSING]
                );
                io.to(round.room_code).emit(EVENTS.GUESSING_ENDED, {
                    roundId,
                    phase: ROUND_PHASES.SCORES_FETCHING,
                });
            }

            reply.send({ ok: true, submittedCount, totalPlayers });
        } catch (e) {
            console.error('[guess] error:', e);
            reply.code(500).send({ error: 'Failed to submit guess' });
        }
    });

    /**
     * Host ends the guessing phase (public mode only)
     * POST /api/rounds/:roundId/end-guessing
     */
    fastify.post('/api/rounds/:roundId/end-guessing', async (req, reply) => {
        let ctx;
        try {
            ctx = await validatePlayer(req);
        } catch (e) {
            return reply.code(401).send({ error: e.message });
        }

        const { roundId } = req.params;

        try {
            const room = await getRoomState(ctx.roomCode);
            if (!room) return reply.code(404).send({ error: 'Room not found' });
            if (room.hostId !== ctx.playerId) return reply.code(403).send({ error: 'Not host' });

            const roundRes = await query('SELECT phase FROM rounds WHERE id = $1', [roundId]);
            if (!roundRes.rows.length) return reply.code(404).send({ error: 'Round not found' });
            if (roundRes.rows[0].phase !== ROUND_PHASES.GUESSING) {
                return reply.code(400).send({ error: 'Not in guessing phase' });
            }

            const io = getIo();
            const deadlineMs = Date.now() + 5000;
            io.to(ctx.roomCode).emit(EVENTS.GUESSING_SUBMIT_NOW, { roundId, deadlineMs });

            // Safety-net: emit GUESSING_ENDED 7s after host triggers end, regardless of submissions
            setTimeout(async () => {
                try {
                    const check = await query('SELECT phase FROM rounds WHERE id = $1', [roundId]);
                    if (check.rows[0]?.phase === ROUND_PHASES.GUESSING) {
                        await query(
                            'UPDATE rounds SET phase = $1 WHERE id = $2 AND phase = $3',
                            [ROUND_PHASES.SCORES_FETCHING, roundId, ROUND_PHASES.GUESSING]
                        );
                        io.to(ctx.roomCode).emit(EVENTS.GUESSING_ENDED, {
                            roundId,
                            phase: ROUND_PHASES.SCORES_FETCHING
                        });
                    }
                } catch (e) {
                    console.error('[end-guessing] safety-net error:', e);
                }
            }, 60000);

            reply.send({ ok: true, deadlineMs });
        } catch (e) {
            console.error('[end-guessing] error:', e);
            reply.code(500).send({ error: e.message });
        }
    });

    /**
     * Calculate and save round scores
     * POST /api/rounds/:roundId/score
     */
    fastify.post('/api/rounds/:roundId/score', async (req, reply) => {
        let ctx = null;
        try {
            ctx = await validatePlayer(req);
        } catch (e) {
            return reply.code(401).send({ error: e.message });
        }

        const { roundId } = req.params;

        try {
            const round = await fetchRoundWithRoom(roundId);
            if (!round) {
                return reply.code(404).send({ error: 'Round not found' });
            }

            const guessingStartedAt = round.guessing_started_at ? new Date(round.guessing_started_at) : null;

            // Atomically claim scoring rights — only the first concurrent request wins.
            // UPDATE ... WHERE phase = SCORES_FETCHING is atomic in PostgreSQL and prevents
            // the race condition where multiple clients all call triggerScoring() at once.
            const claimed = await claimScoringRights(roundId);
            if (!claimed) {
                return reply.code(400).send({ error: 'Round already scored' });
            }

            const [originalSongs, playerGuesses] = await Promise.all([
                fetchOriginalSongs(roundId),
                fetchPlayerGuesses(roundId)
            ]);

            if (playerGuesses.length === 0) {
                return reply.code(400).send({ error: 'No guesses submitted' });
            }

            // Assess with ChatGPT
            console.log('[score] Assessing guesses with AI...');
            const assessments = await assessGuessesWithAI(originalSongs, playerGuesses);

            // Calculate scores and save to database
            const scoreResults = [];

            for (const assessment of assessments) {
                const playerGuess = playerGuesses.find(pg => pg.playerId === assessment.playerId);
                if (!playerGuess) continue;

                const original = originalSongs.find(s => s.clueIndex === assessment.clueIndex);
                if (!original) continue;

                const result = await computeAndSaveScore(roundId, assessment, playerGuess, original, guessingStartedAt);
                if (result) scoreResults.push(result);
            }

            // Emit scores to room
            const io = getIo();
            io.to(round.room_code).emit(EVENTS.SCORES_FETCHING_ENDED, {
                roundId,
                scores: scoreResults
            });

            reply.send({ ok: true, scores: scoreResults });
        } catch (e) {
            console.error('[score] error:', e);
            reply.code(500).send({ error: 'Failed to calculate scores' });
        }
    });

    /**
     * Get round results and leaderboard
     * GET /api/rounds/:roundId/results
     */
    fastify.get('/api/rounds/:roundId/results', async (req, reply) => {
        let ctx = null;
        try {
            ctx = await validatePlayer(req);
        } catch (e) {
            return reply.code(401).send({ error: e.message });
        }

        const { roundId } = req.params;

        try {
            const rows = await fetchRoundScoresWithDetails(roundId);
            reply.send(buildResultsPayload(rows));
        } catch (e) {
            console.error('[results] error:', e);
            reply.code(500).send({ error: 'Failed to fetch results' });
        }
    });

    /**
     * Host ends the round — broadcasts ROUND_PHASE_CHANGED to all players.
     * POST /api/rounds/:roundId/end
     */
    fastify.post('/api/rounds/:roundId/end', async (req, reply) => {
        let ctx;
        try {
            ctx = await validatePlayer(req);
        } catch (e) {
            return reply.code(401).send({ error: e.message });
        }

        const { roundId } = req.params;

        try {
            const room = await getRoomState(ctx.roomCode);
            if (!room) return reply.code(404).send({ error: 'Room not found' });
            if (room.hostId !== ctx.playerId) return reply.code(403).send({ error: 'Not host' });

            await query('UPDATE rounds SET phase = $1 WHERE id = $2', [ROUND_PHASES.ROUND_ENDED, roundId]);

            const io = getIo();
            io.to(ctx.roomCode).emit(EVENTS.ROUND_PHASE_CHANGED, { roundId, phase: ROUND_PHASES.ROUND_ENDED });

            reply.send({ ok: true });
        } catch (e) {
            console.error('[round/end] error:', e);
            reply.code(500).send({ error: e.message });
        }
    });

    /**
     * Host ends the round and deletes all audio files for it from MinIO.
     * POST /api/rounds/:roundId/cleanup
     */
    fastify.post('/api/rounds/:roundId/cleanup', async (req, reply) => {
        let ctx;
        try {
            ctx = await validatePlayer(req);
        } catch (e) {
            return reply.code(401).send({ error: e.message });
        }

        const { roundId } = req.params;

        try {
            const room = await getRoomState(ctx.roomCode);
            if (!room) return reply.code(404).send({ error: 'Room not found' });
            if (room.hostId !== ctx.playerId) return reply.code(403).send({ error: 'Not host' });

            await query('UPDATE rounds SET phase = $1 WHERE id = $2', [ROUND_PHASES.ROUND_ENDED, roundId]);

            const prefixes = ['original', 'reversed-original', 'reverse-recording', 'final-audio'];
            for (const prefix of prefixes) {
                await deleteObjectsByPrefix('audio-recordings', `${prefix}/${roundId}/`);
            }

            const io = getIo();
            io.to(ctx.roomCode).emit(EVENTS.ROUND_PHASE_CHANGED, { roundId, phase: ROUND_PHASES.ROUND_ENDED });

            reply.send({ ok: true });
        } catch (e) {
            console.error('[round/cleanup] error:', e);
            reply.code(500).send({ error: e.message });
        }
    });
}
