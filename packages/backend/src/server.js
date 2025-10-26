import Fastify from 'fastify';
import { testConnection } from './database.js';
import { testRedis } from './redis.js';
import { ensureBuckets, putObject } from './storage.js';

const fastify = Fastify();

fastify.get('/api/health', async () => ({ status: 'ok' }));

fastify.post('/api/test-upload', async () => {
  const content = Buffer.from('test file ' + Date.now(), 'utf-8');
  const name = `dev-test/${Date.now()}.txt`;
  await putObject('audio-recordings', name, content);
  return { stored: name };
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
