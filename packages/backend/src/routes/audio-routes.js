import { requireToken, resolvePlayerContext } from '../auth.js';
import { query } from '../database.js';
import { getObjectStream } from '../storage.js';

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
            const token = requireToken(req, reply);
            if (!token) {
                return;
            }

            const { roundId, playerId } = req.params;
            if (!roundId || !playerId) {
                return reply.code(400).send({ error: 'Missing params' });
            }

            const ctx = await resolvePlayerContext(token, roundId);
            if (!ctx) {
                return reply.code(403).send({ error: 'Forbidden' });
            }

            // Get final audio path
            const trackRes = await query(
                'SELECT final_path FROM round_player_tracks WHERE round_id = $1 AND player_id = $2',
                [roundId, playerId]
            );

            if (!trackRes.rows.length || !trackRes.rows[0].final_path) {
                return reply.code(404).send({ error: 'Final audio not found' });
            }

            const objectName = trackRes.rows[0].final_path;
            const stream = await getObjectStream('audio-recordings', objectName);

            reply.header('Content-Type', 'audio/webm');
            reply.header('Cache-Control', 'no-cache');
            return reply.send(stream);
        } catch (e) {
            console.error('[final audio] error:', e);
            reply.code(404).send({ error: 'Not found' });
        }
    });

    // Secure audio streaming by song UUID & assignment validation
    fastify.get('/api/audio/song/:songId', {config: {rateLimit: {max: 5, timeWindow: '10s'}}}, async (req, reply) => {
        try {
            const token = requireToken(req, reply);
            if (!token) return;
            const {songId} = req.params;
            const {roundId} = req.query;
            if (!songId || !roundId) return reply.code(400).send({error: 'Missing params'});
            const ctx = await resolvePlayerContext(token, roundId);
            if (!ctx) return reply.code(403).send({error: 'Forbidden'});
            const assign = await query('SELECT 1 FROM round_player_tracks WHERE round_id = $1 AND player_id = $2 AND song_id = $3 LIMIT 1', [roundId, ctx.playerId, songId]);
            if (!assign.rows.length) return reply.code(403).send({error: 'Forbidden'});
            const songRes = await query('SELECT midi_file_path FROM songs WHERE id = $1', [songId]);
            if (!songRes.rows.length) return reply.code(404).send({error: 'Not found'});
            const objectName = songRes.rows[0].midi_file_path;
            const stream = await getObjectStream('audio-recordings', objectName);
            const lower = objectName.toLowerCase();
            let type = 'application/octet-stream';
            if (lower.endsWith('.mp3')) type = 'audio/mpeg';
            else if (lower.endsWith('.webm')) type = 'audio/webm';
            reply.header('Content-Type', type);
            reply.header('Cache-Control', 'no-cache');
            return reply.send(stream);
        } catch (e) {
            reply.code(404).send({error: 'Not found'});
        }
    });

    // Stream reversed original audio for reverse singers
    fastify.get('/api/audio/reversed/:roundId/:playerId', {config: {rateLimit: {max: 5, timeWindow: '10s'}}}, async (req, reply) => {
        try {
            const token = requireToken(req, reply);
            if (!token) return;
            const {roundId, playerId} = req.params;
            if (!roundId || !playerId) return reply.code(400).send({error: 'Missing params'});

            const ctx = await resolvePlayerContext(token, roundId);
            if (!ctx) return reply.code(403).send({error: 'Forbidden'});

            // Check if requester is assigned to reverse this player's original
            const assign = await query(
                'SELECT reversed_path FROM round_player_tracks WHERE round_id = $1 AND player_id = $2 AND reverse_player_id = $3',
                [roundId, playerId, ctx.playerId]
            );

            if (!assign.rows.length || !assign.rows[0].reversed_path) {
                return reply.code(403).send({error: 'Not assigned or not ready'});
            }

            const objectName = assign.rows[0].reversed_path;
            const stream = await getObjectStream('audio-recordings', objectName);

            reply.header('Content-Type', 'audio/webm');
            reply.header('Cache-Control', 'no-cache');
            return reply.send(stream);
        } catch (e) {
            reply.code(404).send({error: 'Not found'});
        }
    });
}
