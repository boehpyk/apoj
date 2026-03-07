import { query } from '../database.js';
import { putObject, deleteObject, getPresignedUrl } from '../storage.js';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

function verifyAdminAuth(req, reply) {
    const authHeader = req.headers['authorization'] || '';
    if (!authHeader.startsWith('Basic ')) {
        reply.header('WWW-Authenticate', 'Basic realm="admin"');
        reply.code(401).send({ error: 'Unauthorized' });
        return false;
    }
    const base64 = authHeader.slice(6);
    const decoded = Buffer.from(base64, 'base64').toString('utf8');
    const colonIdx = decoded.indexOf(':');
    const username = decoded.slice(0, colonIdx);
    const password = decoded.slice(colonIdx + 1);
    const expectedPassword = process.env.ADMIN_PASSWORD || '';
    if (!expectedPassword || username !== 'admin' || password !== expectedPassword) {
        reply.code(403).send({ error: 'Forbidden' });
        return false;
    }
    return true;
}

async function detectAudioDuration(filePath) {
    return new Promise((resolve, reject) => {
        const proc = spawn('ffprobe', [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            filePath
        ]);
        let output = '';
        proc.stdout.on('data', d => { output += d.toString(); });
        proc.stderr.on('data', () => {});
        proc.on('error', reject);
        proc.on('close', code => {
            if (code !== 0) return reject(new Error('ffprobe failed'));
            const seconds = parseFloat(output.trim());
            if (isNaN(seconds)) return reject(new Error('Could not parse duration'));
            resolve(Math.round(seconds));
        });
    });
}

async function upsertTags(tagNames) {
    const ids = [];
    for (const name of tagNames) {
        const trimmed = name.trim().toLowerCase();
        if (!trimmed) continue;
        const res = await query(
            `INSERT INTO tags (name) VALUES ($1)
             ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
             RETURNING id`,
            [trimmed]
        );
        ids.push(res.rows[0].id);
    }
    return ids;
}

export function registerAdminRoutes(fastify) {
    fastify.get('/api/admin/songs', async (req, reply) => {
        if (!verifyAdminAuth(req, reply)) return;
        const res = await query(`
            SELECT s.id, s.title, s.artist, s.description, s.lyrics, s.audio_file_path,
                   s.duration, s.difficulty, s.created_at,
                   COALESCE(
                     json_agg(json_build_object('id', t.id, 'name', t.name))
                     FILTER (WHERE t.id IS NOT NULL),
                     '[]'
                   ) AS tags
            FROM songs s
            LEFT JOIN song_tags st ON st.song_id = s.id
            LEFT JOIN tags t ON t.id = st.tag_id
            GROUP BY s.id
            ORDER BY s.title ASC
        `);
        reply.send(res.rows);
    });

    fastify.get('/api/admin/songs/:id/audio-url', async (req, reply) => {
        if (!verifyAdminAuth(req, reply)) return;
        const { id } = req.params;
        const res = await query('SELECT audio_file_path FROM songs WHERE id = $1', [id]);
        if (!res.rows.length) return reply.code(404).send({ error: 'Not found' });
        const url = await getPresignedUrl('audio-recordings', res.rows[0].audio_file_path);
        if (!url) return reply.code(500).send({ error: 'Could not generate audio URL' });
        reply.send({ url });
    });

    fastify.get('/api/admin/tags', async (req, reply) => {
        if (!verifyAdminAuth(req, reply)) return;
        const res = await query('SELECT id, name FROM tags ORDER BY name ASC');
        reply.send(res.rows);
    });

    fastify.post('/api/admin/songs', async (req, reply) => {
        if (!verifyAdminAuth(req, reply)) return;

        const fields = {};
        let fileBuffer = null;
        let fileMimetype = null;

        for await (const part of req.parts({ limits: { fileSize: 50 * 1024 * 1024 } })) {
            if (part.type === 'field') {
                fields[part.fieldname] = part.value;
            } else if (part.type === 'file' && part.fieldname === 'audio') {
                const chunks = [];
                for await (const chunk of part.file) {
                    chunks.push(chunk);
                }
                if (part.file.truncated) {
                    return reply.code(400).send({ error: 'File exceeds 50MB limit' });
                }
                fileBuffer = Buffer.concat(chunks);
                fileMimetype = part.mimetype;
            }
        }

        const { title, artist, description, lyrics, tags: tagsRaw, difficulty } = fields;
        if (!title || !artist) {
            return reply.code(400).send({ error: 'title and artist are required' });
        }
        if (!fileBuffer || fileBuffer.length === 0) {
            return reply.code(400).send({ error: 'audio file is required' });
        }
        if (fileMimetype !== 'audio/mpeg' && fileMimetype !== 'audio/mp3') {
            return reply.code(400).send({ error: 'Only MP3 files are accepted' });
        }

        const insertRes = await query(
            `INSERT INTO songs (title, artist, description, lyrics, duration, difficulty, audio_file_path)
             VALUES ($1, $2, $3, $4, 0, $5, '')
             RETURNING id`,
            [title, artist, description || null, lyrics || null, difficulty || 'basic']
        );
        const songId = insertRes.rows[0].id;

        const tmpPath = path.join(os.tmpdir(), `song_upload_${songId}.mp3`);
        fs.writeFileSync(tmpPath, fileBuffer);

        let duration = 0;
        try {
            duration = await detectAudioDuration(tmpPath);
        } catch (e) {
            req.log.error({ err: e }, '[admin] ffprobe failed');
        } finally {
            fs.unlink(tmpPath, () => {});
        }

        const objectName = `songs/${songId}.mp3`;
        await putObject('audio-recordings', objectName, fileBuffer, { 'Content-Type': 'audio/mpeg' });

        await query(
            'UPDATE songs SET audio_file_path = $1, duration = $2 WHERE id = $3',
            [objectName, duration, songId]
        );

        const tagNames = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
        if (tagNames.length > 0) {
            const tagIds = await upsertTags(tagNames);
            for (const tagId of tagIds) {
                await query(
                    'INSERT INTO song_tags (song_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                    [songId, tagId]
                );
            }
        }

        const songRes = await query(`
            SELECT s.*, COALESCE(
              json_agg(json_build_object('id', t.id, 'name', t.name))
              FILTER (WHERE t.id IS NOT NULL), '[]'
            ) AS tags
            FROM songs s
            LEFT JOIN song_tags st ON st.song_id = s.id
            LEFT JOIN tags t ON t.id = st.tag_id
            WHERE s.id = $1
            GROUP BY s.id
        `, [songId]);
        reply.code(201).send(songRes.rows[0]);
    });

    fastify.delete('/api/admin/songs/:id', async (req, reply) => {
        if (!verifyAdminAuth(req, reply)) return;

        const { id } = req.params;
        const songRes = await query('SELECT audio_file_path FROM songs WHERE id = $1', [id]);
        if (!songRes.rows.length) {
            return reply.code(404).send({ error: 'Not found' });
        }

        const audioPath = songRes.rows[0].audio_file_path;
        await query('DELETE FROM songs WHERE id = $1', [id]);

        if (audioPath) {
            try {
                await deleteObject('audio-recordings', audioPath);
            } catch (e) {
                req.log.error({ err: e }, '[admin] MinIO delete error');
            }
        }

        reply.send({ ok: true });
    });
}
