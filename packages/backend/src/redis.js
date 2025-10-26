import Redis from 'ioredis';

// KISS: no config abstraction
const redis = new Redis({ host: 'redis', port: 6379 });

export function getRedis() { return redis; }

export async function testRedis() {
  try {
    await redis.set('health:redis', 'ok', 'EX', 5);
    const v = await redis.get('health:redis');
    return v === 'ok';
  } catch (e) {
    return false;
  }
}

