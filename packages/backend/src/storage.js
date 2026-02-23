import { Client } from 'minio';

// KISS: direct client, env defaults for dev
const clientParams = {
    endPoint: process.env.MINIO_ENDPOINT || 'minio',
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    useSSL: false,
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
};
const client = new Client(clientParams);

const PUBLIC_HOST = process.env.MINIO_PUBLIC_HOST || 'localhost';
const PUBLIC_PORT = process.env.MINIO_PUBLIC_PORT || (process.env.MINIO_PORT || '9000');
const PUBLIC_PROTOCOL = process.env.MINIO_PUBLIC_PROTOCOL || 'http';

export function getStorage() { return client; }

export async function ensureBuckets() {
  const buckets = ['audio-recordings'];
  for (const b of buckets) {
    const exists = await client.bucketExists(b).catch(() => false);
    if (!exists) {
      await client.makeBucket(b).catch(err => console.error('[storage] bucket create failed', b, err));
    }
  }
}

export async function putObject(bucket, objectName, data, meta = {}) {
  return client.putObject(bucket, objectName, data, meta);
}

export async function getPresignedUrl(bucket, objectName, expirySeconds = 300) {
  try {
    const raw = await client.presignedGetObject(bucket, objectName, expirySeconds);
    // Rewrite internal host (minio) to public host if needed
    try {
      const u = new URL(raw);
      if (PUBLIC_HOST && PUBLIC_HOST !== u.hostname) {
        u.hostname = PUBLIC_HOST;
      }
      if (PUBLIC_PORT && PUBLIC_PORT !== u.port) {
        u.port = PUBLIC_PORT;
      }
      if (PUBLIC_PROTOCOL && PUBLIC_PROTOCOL !== u.protocol.replace(':','')) {
        u.protocol = PUBLIC_PROTOCOL + ':';
      }
      return u.toString();
    } catch { return raw; }
  } catch (e) {
    console.error('[storage] presigned url error', bucket, objectName, e.message);
    return null;
  }
}

export async function getObjectStream(bucket, objectName) {
  try {
    return await client.getObject(bucket, objectName);
  } catch (e) {
    console.error('[storage] get object error', bucket, objectName, e.message);
    throw e;
  }
}
