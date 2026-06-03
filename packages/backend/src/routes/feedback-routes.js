import { query } from '../database.js';

const VALID_TYPES = new Set(['bug', 'suggestion', 'other']);

export function registerFeedbackRoutes(fastify) {
  fastify.post('/api/feedback', {
    config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
  }, async (req, reply) => {
    const { message, type = 'other', page = null, hp = '' } = req.body || {};

    // Honeypot: bots fill hidden fields, humans don't
    if (hp) return reply.code(200).send({ ok: true });

    if (!message?.trim()) return reply.code(400).send({ error: 'Message required' });
    if (message.length > 2000) return reply.code(400).send({ error: 'Message too long (max 2000 chars)' });

    const safeType = VALID_TYPES.has(type) ? type : 'other';

    await query(
      'INSERT INTO feedback (message, type, page) VALUES ($1, $2, $3)',
      [message.trim(), safeType, page ?? null]
    );

    fastify.log.info({ type: safeType, page }, '[feedback] received');
    return { ok: true };
  });
}
