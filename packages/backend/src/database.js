import { Pool } from 'pg';

// KISS: hard-coded dev credentials matching docker-compose.dev.yml
const pool = new Pool({
  host: 'postgres',
  port: 5432,
  user: 'reverse_user',
  password: 'reverse_pass',
  database: 'reverse_song'
});

export async function query(sql, params) {
  return pool.query(sql, params);
}

export async function testConnection() {
  const res = await pool.query('SELECT 1 AS ok');
  return res.rows[0].ok === 1;
}

export async function close() {
  await pool.end();
}

