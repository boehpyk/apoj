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

// Separate client for pre-signed URLs using the public endpoint.
// The minio-js SDK computes signatures locally based on endPoint, so the
// signed URL will contain the public host the browser can actually reach.
// Passing region explicitly avoids a network call for region auto-detection,
// which would fail since the public host isn't reachable from inside Docker.
const PUBLIC_HOST = process.env.MINIO_PUBLIC_HOST || 'localhost';
const PUBLIC_PORT = parseInt(process.env.MINIO_PUBLIC_PORT || process.env.MINIO_PORT || '9000', 10);
const PUBLIC_PROTOCOL = process.env.MINIO_PUBLIC_PROTOCOL || 'http';
const publicClient = new Client({
    endPoint: PUBLIC_HOST,
    port: PUBLIC_PORT,
    useSSL: PUBLIC_PROTOCOL === 'https',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    region: 'us-east-1',
});

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
    return await publicClient.presignedGetObject(bucket, objectName, expirySeconds);
  } catch (e) {
    console.error('[storage] presigned url error', bucket, objectName, e);
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

export async function deleteObject(bucket, objectName) {
  return client.removeObject(bucket, objectName);
}

/**
 * Delete all objects in a bucket whose names start with the given prefix.
 * @param {string} bucket
 * @param {string} prefix
 * @returns {Promise<number>} number of objects deleted
 */
export async function deleteObjectsByPrefix(bucket, prefix) {
  const names = await new Promise((resolve, reject) => {
    const list = [];
    const stream = client.listObjects(bucket, prefix, true);
    stream.on('data', obj => list.push(obj.name));
    stream.on('end', () => resolve(list));
    stream.on('error', reject);
  });
  if (names.length > 0) {
    await client.removeObjects(bucket, names);
  }
  return names.length;
}
