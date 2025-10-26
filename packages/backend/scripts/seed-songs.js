import { query } from '../src/database.js';

const songs = [
  { title: 'Echoes of Time', artist: 'MVP Artist', midi: 'midi/basic/echoes.mid', lyrics: 'Echoes in time we sing', duration: 120 },
  { title: 'Skyline Drift', artist: 'MVP Artist', midi: 'midi/basic/skyline.mid', lyrics: 'Drifting over skyline blue', duration: 95 },
  { title: 'Neon Pulse', artist: 'MVP Artist', midi: 'midi/basic/neon.mid', lyrics: 'Neon lights and heartbeat fuse', duration: 105 },
  { title: 'Silent River', artist: 'MVP Artist', midi: 'midi/basic/river.mid', lyrics: 'River flows in silent groove', duration: 88 },
  { title: 'Glass Horizon', artist: 'MVP Artist', midi: 'midi/basic/horizon.mid', lyrics: 'Horizon made of fragile glass', duration: 102 },
  { title: 'Midnight Circuit', artist: 'MVP Artist', midi: 'midi/basic/midnight.mid', lyrics: 'Circuit sparks at midnight hour', duration: 111 },
  { title: 'Rust & Rain', artist: 'MVP Artist', midi: 'midi/basic/rust.mid', lyrics: 'Rust and rain collide in sound', duration: 97 },
  { title: 'Paper Satellites', artist: 'MVP Artist', midi: 'midi/basic/paper.mid', lyrics: 'Paper satellites drift slow', duration: 100 },
  { title: 'Low Tide Radio', artist: 'MVP Artist', midi: 'midi/basic/tide.mid', lyrics: 'Radio hum at low tide', duration: 93 },
  { title: 'Binary Lullaby', artist: 'MVP Artist', midi: 'midi/basic/lullaby.mid', lyrics: 'Binary sings you to sleep', duration: 108 }
];

async function seed() {
  const countRes = await query('SELECT COUNT(*)::int AS count FROM songs');
  if (countRes.rows[0].count > 0) {
    console.log('[seed] songs already present, skipping');
    return;
  }
  const values = [];
  const params = [];
  songs.forEach((s, i) => {
    values.push(`($${i*5+1}, $${i*5+2}, $${i*5+3}, $${i*5+4}, $${i*5+5})`);
    params.push(s.title, s.artist, s.midi, s.lyrics, s.duration);
  });
  await query(`INSERT INTO songs (title, artist, midi_file_path, lyrics, duration) VALUES ${values.join(',')}`, params);
  console.log('[seed] inserted', songs.length, 'songs');
}

seed().then(() => process.exit(0)).catch(err => { console.error('[seed] failed', err); process.exit(1); });

