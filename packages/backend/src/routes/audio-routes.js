import { requireToken, resolvePlayerContext } from '../auth.js';
import { query } from '../database.js';
import { getObjectStream } from '../storage.js';

/**
 * Extracts the player token from the request and resolves the player's context for the round.
 * Sends error responses and returns null on auth/context failure.
 *
 * @param {import('fastify').FastifyRequest} req
 * @param {import('fastify').FastifyReply} reply
 * @param {string} roundId - UUID of the round to resolve context for
 * @returns {Promise<import('../auth.js').PlayerContext|null>}
 */
async function resolveAudioContext(req, reply, roundId) {
    const token = requireToken(req, reply);
    if (!token) return null;
    const ctx = await resolvePlayerContext(token, roundId);
    if (!ctx) {
        reply.code(403).send({ error: 'Forbidden' });
        return null;
    }
    return ctx;
}

/**
 * Streams an audio object from the 'audio-recordings' MinIO bucket with appropriate headers.
 *
 * @param {import('fastify').FastifyReply} reply
 * @param {string} objectName - MinIO object path within the bucket
 * @param {string} [contentType='audio/webm'] - MIME type for the Content-Type header
 * @returns {Promise<void>}
 */
async function streamAudioObject(reply, objectName, contentType = 'audio/webm') {
    const stream = await getObjectStream('audio-recordings', objectName);
    reply.header('Content-Type', contentType);
    reply.header('Cache-Control', 'no-cache');
    return reply.send(stream);
}

/**
 * Infers the audio MIME type from a file path's extension.
 *
 * @param {string} objectName - File path or name
 * @returns {string} 'audio/mpeg', 'audio/webm', or 'application/octet-stream'
 */
function inferAudioMimeType(objectName) {
    const lower = objectName.toLowerCase();
    if (lower.endsWith('.mp3')) return 'audio/mpeg';
    if (lower.endsWith('.webm')) return 'audio/webm';
    return 'application/octet-stream';
}

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {() => import('socket.io').Server} getIo
 */
export function registerAudioRoutes(fastify, getIo) {
    /**
     * Stream final audio (reversed twice) for guessing
     * GET /api/audio/final/:roundId/:playerId
     */
    fastify.get('/api/audio/final/:roundId/:playerId', {config: {rateLimit: {max: 10, timeWindow: '10s'}}}, async (req, reply) => {
        try {
            const { roundId, playerId } = req.params;
            if (!roundId || !playerId) {
                return reply.code(400).send({ error: 'Missing params' });
            }

            const ctx = await resolveAudioContext(req, reply, roundId);
            if (!ctx) return;

            // Get final audio path
            const trackRes = await query(
                'SELECT final_path FROM round_player_tracks WHERE round_id = $1 AND player_id = $2',
                [roundId, playerId]
            );

            if (!trackRes.rows.length || !trackRes.rows[0].final_path) {
                return reply.code(404).send({ error: 'Final audio not found' });
            }

            return streamAudioObject(reply, trackRes.rows[0].final_path);
        } catch (e) {
            console.error('[final audio] error:', e);
            reply.code(404).send({ error: 'Not found' });
        }
    });

    // Secure audio streaming by song UUID & assignment validation
    fastify.get('/api/audio/song/:songId', {config: {rateLimit: {max: 5, timeWindow: '10s'}}}, async (req, reply) => {
        try {
            const {songId} = req.params;
            const {roundId} = req.query;
            if (!songId || !roundId) return reply.code(400).send({error: 'Missing params'});

            const ctx = await resolveAudioContext(req, reply, roundId);
            if (!ctx) return;

            const assign = await query('SELECT 1 FROM round_player_tracks WHERE round_id = $1 AND player_id = $2 AND song_id = $3 LIMIT 1', [roundId, ctx.playerId, songId]);
            if (!assign.rows.length) return reply.code(403).send({error: 'Forbidden'});

            const songRes = await query('SELECT audio_file_path FROM songs WHERE id = $1', [songId]);
            if (!songRes.rows.length) return reply.code(404).send({error: 'Not found'});

            const objectName = songRes.rows[0].audio_file_path;
            return streamAudioObject(reply, objectName, inferAudioMimeType(objectName));
        } catch (e) {
            reply.code(404).send({error: 'Not found'});
        }
    });

    // Stream reversed original audio for reverse singers
    fastify.get('/api/audio/reversed/:roundId/:playerId', {config: {rateLimit: {max: 5, timeWindow: '10s'}}}, async (req, reply) => {
        try {
            const {roundId, playerId} = req.params;
            if (!roundId || !playerId) return reply.code(400).send({error: 'Missing params'});

            const ctx = await resolveAudioContext(req, reply, roundId);
            if (!ctx) return;

            // Check if requester is assigned to reverse this player's original
            const assign = await query(
                'SELECT reversed_path FROM round_player_tracks WHERE round_id = $1 AND player_id = $2 AND reverse_player_id = $3',
                [roundId, playerId, ctx.playerId]
            );

            if (!assign.rows.length || !assign.rows[0].reversed_path) {
                return reply.code(403).send({error: 'Not assigned or not ready'});
            }

            return streamAudioObject(reply, assign.rows[0].reversed_path);
        } catch (e) {
            reply.code(404).send({error: 'Not found'});
        }
    });
}
