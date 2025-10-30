import Fastify from 'fastify';
import { testConnection } from './database.js';
import { testRedis } from './redis.js';
import { ensureBuckets } from './storage.js';
import { createRoom, joinRoom, getRoomState } from './room-manager.js';

const fastify = Fastify();

fastify.get('/api/health', async () => ({ status: 'ok' }));

// Room endpoints (Iteration 2)
fastify.post('/api/rooms', async (req, reply) => {
  try {
    const { playerName } = req.body || {};
    const room = await createRoom(playerName);
    reply.send(room);
  } catch (e) {
    reply.code(400).send({ error: e.message });
  }
});

fastify.post('/api/rooms/:code/join', async (req, reply) => {
  try {
    const { code } = req.params;
    const { playerName } = req.body || {};
    const room = await joinRoom(code, playerName);
    reply.send(room);
  } catch (e) {
    reply.code(400).send({ error: e.message });
  }
});

fastify.get('/api/rooms/:code', async (req, reply) => {
  const { code } = req.params;
  const state = await getRoomState(code.toUpperCase());
  if (!state) return reply.code(404).send({ error: 'Not found' });
  reply.send(state);
});

async function initInfra() {
  const dbOk = await testConnection().catch(() => false);
  const redisOk = await testRedis();
  await ensureBuckets().catch(err => console.error('[storage] bucket init error', err));
  console.log('[infra] db:', dbOk ? 'ok' : 'fail', 'redis:', redisOk ? 'ok' : 'fail');
}

const PORT = process.env.PORT || 3000;

initInfra().then(() => {
  fastify.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
    console.log(`[backend] listening on http://localhost:${PORT}`);
  }).catch(err => {
    console.error('[backend] failed to start', err);
    process.exit(1);
  });
});
