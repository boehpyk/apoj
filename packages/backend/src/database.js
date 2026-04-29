import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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

