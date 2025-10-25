import Fastify from 'fastify';

const fastify = Fastify();

fastify.get('/api/health', async () => ({ status: 'ok' }));

// Root route removed; Vue frontend served separately via its own container.

const PORT = process.env.PORT || 3000;

fastify.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  console.log(`[backend] listening on http://localhost:${PORT}`);
}).catch(err => {
  console.error('[backend] failed to start', err);
  process.exit(1);
});
