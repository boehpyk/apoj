import { Client } from 'minio';

// KISS: direct client, env defaults for dev
const client = new Client({
  endPoint: process.env.MINIO_ENDPOINT || 'minio',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
});

export function getStorage() { return client; }

export async function ensureBuckets() {
  const buckets = ['audio-recordings', 'midi-files'];
  for (const b of buckets) {
    const exists = await client.bucketExists(b).catch(() => false);
    if (!exists) {
      await client.makeBucket(b).catch(err => console.error('[storage] bucket create failed', b, err.message));
    }
  }
}

export async function putObject(bucket, objectName, data, meta = {}) {
  return client.putObject(bucket, objectName, data, meta);
}

