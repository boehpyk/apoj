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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP
  )`);

  // Players
  await query(`CREATE TABLE IF NOT EXISTS players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    team VARCHAR(1),
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // Rounds
  await query(`CREATE TABLE IF NOT EXISTS rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    answers JSONB DEFAULT '{}'::jsonb,
    scores JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    phase VARCHAR(128)
  )`);

  // Round player tracks (Iteration 4 + Iteration 6 addition reverse_player_id + Iteration 7 additions)
  await query(`CREATE TABLE IF NOT EXISTS round_player_tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID REFERENCES rounds(id) ON DELETE CASCADE,
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    song_id UUID REFERENCES songs(id) ON DELETE SET NULL,
    original_path TEXT,
    reversed_path TEXT,
    reverse_recording_path TEXT,
    final_path TEXT,
    reverse_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
    status VARCHAR(40)
  )`);
  // Add columns if table pre-existed without them
  await query('ALTER TABLE round_player_tracks ADD COLUMN IF NOT EXISTS reverse_player_id UUID REFERENCES players(id) ON DELETE SET NULL');
  await query('ALTER TABLE round_player_tracks ADD COLUMN IF NOT EXISTS reverse_recording_path TEXT');
  await query('ALTER TABLE round_player_tracks ADD COLUMN IF NOT EXISTS final_path TEXT');

  // Player guesses (Iteration 8)
  await query(`CREATE TABLE IF NOT EXISTS player_guesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID REFERENCES rounds(id) ON DELETE CASCADE,
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    guesses JSONB NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(round_id, player_id)
  )`);

  // Add guessing_started_at to rounds if it doesn't exist
  await query('ALTER TABLE rounds ADD COLUMN IF NOT EXISTS guessing_started_at TIMESTAMP');

  // Add mode to rounds if it doesn't exist (public = host-controlled guessing, private = self-paced)
  await query("ALTER TABLE rounds ADD COLUMN IF NOT EXISTS mode VARCHAR(20) DEFAULT 'private'");

  // Round scores (Iteration 9)
  await query(`CREATE TABLE IF NOT EXISTS round_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID REFERENCES rounds(id) ON DELETE CASCADE,
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    clue_index INTEGER NOT NULL,
    ai_score DECIMAL(4,2) DEFAULT 0,
    base_points INTEGER DEFAULT 0,
    speed_bonus INTEGER DEFAULT 0,
    artist_bonus INTEGER DEFAULT 0,
    total_points INTEGER DEFAULT 0,
    reasoning TEXT,
    used_fallback BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  console.log('[migrate] completed');
}

migrate().then(() => process.exit(0)).catch(err => {
  console.error('[migrate] failed', err);
  process.exit(1);
});
