import { query } from '../src/database.js';

async function migrate() {
  // Enable uuid generation
  await query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  // Songs
  await query(`CREATE TABLE IF NOT EXISTS songs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    artist VARCHAR(255) NOT NULL,
    midi_file_path VARCHAR(512) NOT NULL,
    lyrics TEXT NOT NULL,
    duration INTEGER NOT NULL,
    difficulty VARCHAR(20) DEFAULT 'basic',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // Game sessions
  await query(`CREATE TABLE IF NOT EXISTS game_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code VARCHAR(6) UNIQUE NOT NULL,
    host_id UUID,
    status VARCHAR(20) DEFAULT 'waiting',
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP
  )`);

  // Players
  await query(`CREATE TABLE IF NOT EXISTS players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    team VARCHAR(1),
    socket_id VARCHAR(100),
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // Rounds
  await query(`CREATE TABLE IF NOT EXISTS rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    song_id UUID REFERENCES songs(id),
    performing_team VARCHAR(1) NOT NULL,
    guessing_team VARCHAR(1) NOT NULL,
    original_singer_id UUID,
    reverse_singer_id UUID,
    original_audio_url VARCHAR(512),
    reversed_original_url VARCHAR(512),
    reverse_singer_audio_url VARCHAR(512),
    final_audio_url VARCHAR(512),
    answers JSONB DEFAULT '{}'::jsonb,
    scores JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMP,
    ended_at TIMESTAMP
  )`);

  console.log('[migrate] completed');
}

migrate().then(() => process.exit(0)).catch(err => {
  console.error('[migrate] failed', err);
  process.exit(1);
});

