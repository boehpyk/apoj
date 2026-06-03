<template>
  <div class="rec-layout">

    <!-- ── LEFT: Song + Recording ───────────────────────────────────── -->
    <div class="col-left">

      <h2 class="phase-heading">Sing your song.</h2>
      <p class="phase-subtext">You got a clip. Belt out 10–30 seconds, clean and clear. We'll flip it for someone else.</p>

      <!-- Song card -->
      <div v-if="song" class="song-card">
        <span class="song-badge">YOUR SONG</span>
        <div class="song-inner">

          <!-- Spinning vinyl -->
          <div class="vinyl-col">
            <div class="vinyl-spin-wrap">
              <svg viewBox="0 0 100 100" width="130" height="130" class="vinyl-disc">
                <defs>
                  <radialGradient id="rec-vinyl-bg" cx="40%" cy="35%" r="60%">
                    <stop offset="0%"   stop-color="#8B5CF6"/>
                    <stop offset="50%"  stop-color="#3B1F6B"/>
                    <stop offset="100%" stop-color="#1A0930"/>
                  </radialGradient>
                </defs>
                <circle cx="50" cy="50" r="48" fill="url(#rec-vinyl-bg)"/>
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,245,220,.07)" stroke-width="1.5"/>
                <circle cx="50" cy="50" r="34" fill="none" stroke="rgba(255,245,220,.07)" stroke-width="1.5"/>
                <circle cx="50" cy="50" r="26" fill="none" stroke="rgba(255,245,220,.07)" stroke-width="1.5"/>
                <circle cx="50" cy="50" r="18" fill="none" stroke="rgba(255,245,220,.07)" stroke-width="1.5"/>
                <circle cx="50" cy="50" r="12" fill="#FF2F87" opacity="0.9"/>
                <circle cx="50" cy="50" r="3"  fill="#07020F"/>
              </svg>
              <span class="duration-pill">{{ songDurationLabel }}</span>
            </div>
          </div>

          <!-- Song info + lyrics -->
          <div class="song-info">
            <div class="song-title">{{ song.title }}</div>
            <div v-if="song.artist" class="song-artist">{{ song.artist }}</div>
            <!-- Hidden native audio for playback -->
            <audio
              v-if="songAudioUrl"
              ref="songAudioEl"
              :src="songAudioUrl"
              preload="auto"
              style="display:none"
              @loadedmetadata="onSongLoaded"
              @ended="isPlaying = false"
            />
            <!-- Playback controls -->
            <div v-if="songAudioUrl" class="playback-row">
              <button class="play-btn" :class="{ 'is-playing': isPlaying }" @click="togglePlay">
                <svg v-if="!isPlaying" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <polygon points="5,3 19,12 5,21"/>
                </svg>
                <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                </svg>
              </button>
              <span class="play-label">{{ isPlaying ? 'Playing…' : 'Listen to your clip' }}</span>
            </div>
            <div class="lyrics-panel">
              <div class="lyrics-label">{{ song.title }}</div>
              <pre class="lyrics-text">{{ song.lyrics }}</pre>
            </div>
          </div>
        </div>
      </div>

      <!-- No song yet -->
      <div v-else class="song-loading">Loading your song…</div>

      <!-- ── Recording card ──────────────────────────────────────────── -->
      <div class="rec-card">

        <!-- Left side: mic button or uploaded badge -->
        <div class="rec-btn-col">
          <!-- IDLE / RECORDING state -->
          <template v-if="!uploaded">
            <button
              class="mic-btn"
              :class="{ 'is-recording': isRecording }"
              :title="isRecording ? 'Stop' : 'Record'"
              @click="isRecording ? handleStop() : handleRecord()"
            >
              <!-- Mic icon (idle) -->
              <svg v-if="!isRecording" viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="2" width="6" height="12" rx="3"/>
                <path d="M5 10a7 7 0 0 0 14 0"/>
                <line x1="12" y1="19" x2="12" y2="22"/>
                <line x1="8"  y1="22" x2="16" y2="22"/>
              </svg>
              <!-- Stop icon (recording) -->
              <svg v-else viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
              </svg>
            </button>
            <div class="mic-hint">{{ isRecording ? 'Tap to stop' : recordBlob ? 'Re-record?' : 'Tap to record' }}</div>
          </template>

          <!-- UPLOADED state -->
          <template v-else>
            <div class="uploaded-circle">
              <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div class="uploaded-label">UPLOADED</div>
            <div class="uploaded-sub">{{ recTimeLabel }} clip uploaded</div>
          </template>
        </div>

        <!-- Right side: waveform + controls -->
        <div class="rec-vis-col">
          <div class="waveform-bars">
            <div
              v-for="(h, i) in waveHeights"
              :key="i"
              class="wbar"
              :class="{ 'wbar--live': isRecording }"
              :style="{
                height: isRecording ? undefined : h + '%',
                animationDelay: isRecording ? (i * 0.04) + 's' : '0s'
              }"
            ></div>
          </div>

          <div class="rec-meta">
            <span class="rec-timer">{{ recTimeLabel }}</span>
            <div class="rec-actions">
              <button
                v-if="recordBlob && !uploaded"
                @click="handleUpload"
                :disabled="uploading"
                class="action-btn"
              >{{ uploading ? '…' : '▶ Upload' }}</button>
              <button
                v-if="(recordBlob || uploaded) && !isRecording"
                @click="retake"
                class="action-btn-ghost"
              >↻ Re-take</button>
            </div>
          </div>
        </div>

      </div>

    </div>

    <!-- ── RIGHT: Roster ─────────────────────────────────────────────── -->
    <div class="col-right">
      <div class="roster-panel">

        <div class="roster-hdr">
          <span class="roster-title">WHO'S RECORDED?</span>
          <span class="roster-count">{{ uploadedCount }} / {{ totalPlayers }}</span>
        </div>

        <div class="roster-progress-track">
          <div class="roster-progress-fill" :style="{ width: progressPct + '%' }"></div>
        </div>

        <div class="roster-list">
          <div
            v-for="(p, idx) in players"
            :key="p.id"
            class="roster-row"
            :class="{ 'roster-row--done': isDone(p.id) }"
          >
            <div class="avatar" :style="{ background: avatarBg(idx), boxShadow: `${avatarBg(idx)} 0 8px 0` }">
              {{ initial(p.name) }}
            </div>
            <div class="pinfo">
              <div class="pname-row">
                <span class="pname">{{ p.name }}</span>
                <span v-if="p.id === playerId" class="you-tag">YOU</span>
                <span class="song-ref">Song {{ shortId(songMap[p.id]) }}</span>
              </div>
              <span v-if="isDone(p.id)" class="done-pill">✓ Uploaded</span>
            </div>
          </div>
        </div>

      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useAudioRecorder } from '../../composables/useAudioRecorder.js';

const props = defineProps({
  song:          Object,
  roundId:       String,
  uploadedCount: Number,
  totalPlayers:  Number,
  players:       { type: Array,  default: () => [] },
  statuses:      { type: Object, default: () => ({}) },
  songMap:       { type: Object, default: () => ({}) },
  playerId:      { type: String, default: '' },
});

const emit = defineEmits(['uploaded']);

// ── Audio recorder ────────────────────────────────────────────────────
const { isRecording, start, stop } = useAudioRecorder();
const recordBlob = ref(null);
const recordUrl  = ref('');
const uploading  = ref(false);
const uploaded   = ref(false);

// ── Song audio ────────────────────────────────────────────────────────
const songAudioEl    = ref(null);
const songAudioUrl   = ref('');
const songDurationS  = ref(props.song?.duration ?? 0);
const isPlaying      = ref(false);
const playerToken    = sessionStorage.getItem('playerToken');

const songDurationLabel = computed(() => {
  const s = songDurationS.value;
  if (!s) return '';
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
});

function onSongLoaded() {
  if (songAudioEl.value) songDurationS.value = Math.round(songAudioEl.value.duration);
}

function togglePlay() {
  const el = songAudioEl.value;
  if (!el) return;
  if (isPlaying.value) {
    el.pause();
    isPlaying.value = false;
  } else {
    el.play();
    isPlaying.value = true;
  }
}

async function fetchSongAudio() {
  if (!props.song?.audioProxyUrl || !playerToken) return;
  try {
    const res = await fetch(props.song.audioProxyUrl, {
      headers: { 'x-player-token': playerToken },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    if (songAudioUrl.value) URL.revokeObjectURL(songAudioUrl.value);
    songAudioUrl.value = URL.createObjectURL(blob);
  } catch {
    // silent
  }
}

watch(() => props.song, (s) => { if (s) fetchSongAudio(); }, { immediate: true });

// ── Recording timer ───────────────────────────────────────────────────
const recSeconds  = ref(0);
let timerInterval = null;

function startTimer() {
  recSeconds.value = 0;
  timerInterval = setInterval(() => recSeconds.value++, 1000);
}
function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

const recTimeLabel = computed(() => {
  const s = recSeconds.value;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
});

// ── Waveform heights (60 bars, static seed — animated via CSS when recording) ──
const waveHeights = [
  21, 20, 24, 31, 21, 28, 37, 55, 52, 29, 65, 60,
  46, 71, 49, 61, 46, 71, 62, 69, 56, 40, 53, 64,
  34, 45, 62, 99, 82, 53, 62, 47, 70, 94, 89, 61,
  77, 65, 83, 54, 40, 64, 67, 40, 49, 37, 30, 28,
  34, 25, 49, 37, 30, 42, 27, 19, 19, 34, 41, 27,
];

// ── Recording handlers ────────────────────────────────────────────────
async function handleRecord() {
  await start();
  startTimer();
}

async function handleStop() {
  stopTimer();
  recordBlob.value = await stop();
  recordUrl.value  = URL.createObjectURL(recordBlob.value);
}

async function handleUpload() {
  if (!recordBlob.value || uploaded.value || !props.roundId || !playerToken) return;
  uploading.value = true;
  try {
    const form = new FormData();
    form.append('file', recordBlob.value, 'original.webm');
    const res  = await fetch(`/api/rounds/${props.roundId}/original-recording`, {
      method:  'POST',
      headers: { 'x-player-token': playerToken },
      body:    form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    uploaded.value = true;
    emit('uploaded');
  } catch (e) {
    console.warn('Upload failed:', e.message);
  } finally {
    uploading.value = false;
  }
}

function retake() {
  if (isRecording.value) return;
  if (recordUrl.value)   URL.revokeObjectURL(recordUrl.value);
  recordBlob.value = null;
  recordUrl.value  = '';
  uploaded.value   = false;
  recSeconds.value = 0;
}

onBeforeUnmount(() => stopTimer());

// ── Roster helpers ────────────────────────────────────────────────────
const AVATAR_COLORS = ['#FF2F87', '#3FD0C9', '#FFE066', '#FF6B4A'];

const progressPct = computed(() =>
  props.totalPlayers ? Math.round((props.uploadedCount / props.totalPlayers) * 100) : 0
);

const isDone    = (id) => props.statuses[id] === 'original_uploaded';
const initial   = (name) => (name ?? '?')[0].toUpperCase();
const avatarBg  = (idx) => AVATAR_COLORS[idx % AVATAR_COLORS.length];
const shortId   = (id) => id ? id.slice(0, 7) : '…';
</script>

<style scoped>
/* ── Root two-column grid ────────────────────────────────────────────── */
.rec-layout {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 28px;
  padding: 22px 36px;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
}

/* ── LEFT column ─────────────────────────────────────────────────────── */
.col-left {
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: hidden;
}

.phase-heading {
  font-family: "Bowlby One SC", "Bowlby One", Impact, sans-serif;
  font-size: 34px;
  color: var(--vr-cream);
  letter-spacing: 0.5px;
  line-height: 1;
  margin: 0;
}

.phase-subtext {
  font-size: 13px;
  color: rgba(255, 245, 220, 0.667);
  margin: 0;
}

/* ── Song card ───────────────────────────────────────────────────────── */
.song-card {
  position: relative;
  background: rgb(14, 4, 32);
  border: 3px solid var(--vr-pink);
  border-radius: 20px;
  box-shadow: rgb(24, 10, 46) 0 0 0 2px, rgba(255, 47, 135, 0.267) 0 0 26px;
  padding: 22px;
  display: flex;
  gap: 22px;
  align-items: flex-start;
  flex-shrink: 0;
}

.song-badge {
  position: absolute;
  top: -12px;
  left: 22px;
  transform: rotate(-2deg);
  font-family: "Bowlby One SC", Impact, sans-serif;
  font-size: 13px;
  letter-spacing: 1.5px;
  padding: 5px 14px;
  background: var(--vr-pink);
  color: var(--vr-cream);
  border-radius: 4px;
  border: 2px solid rgb(14, 4, 32);
}

.song-inner {
  display: flex;
  gap: 22px;
  align-items: flex-start;
  width: 100%;
}

/* vinyl */
.vinyl-col {
  flex: 0 0 auto;
  padding-top: 6px;
}

.vinyl-spin-wrap {
  position: relative;
  width: 130px;
  height: 130px;
}

.vinyl-disc {
  animation: vr-spin 8s linear infinite;
}

.duration-pill {
  position: absolute;
  top: -6px;
  right: -8px;
  padding: 3px 8px;
  background: var(--vr-gold);
  color: rgb(14, 4, 32);
  font-family: "Bowlby One SC", Impact, sans-serif;
  font-size: 10px;
  letter-spacing: 1px;
  border-radius: 6px;
  border: 2px solid rgb(14, 4, 32);
}

/* song info */
.song-info {
  flex: 1 1 0;
  min-width: 0;
}

.song-title {
  font-family: "Bowlby One SC", Impact, sans-serif;
  font-size: 28px;
  color: var(--vr-gold);
  letter-spacing: 0.5px;
  text-shadow: var(--vr-gold) 0 0 4px, #FFC400 0 0 14px, #FF8A00 0 0 28px, rgba(255, 196, 0, 0.55) 0 0 60px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.song-artist {
  font-size: 13px;
  color: rgba(255, 245, 220, 0.667);
  margin-top: 2px;
  font-style: italic;
}

.lyrics-panel {
  position: relative;
  margin-top: 12px;
  padding: 10px 14px;
  background: rgb(24, 10, 46);
  border-radius: 10px;
  border: 1.5px solid rgb(58, 27, 92);
  max-height: 220px;
  overflow-y: auto;
}

.lyrics-label {
  color: var(--vr-teal);
  margin-bottom: 4px;
  font-weight: 600;
  font-size: 12px;
}

.lyrics-text {
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 11.5px;
  color: var(--vr-cream);
  line-height: 1.7;
  white-space: pre-wrap;
  margin: 0;
}


/* playback */
.playback-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}

.play-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid var(--vr-teal);
  background: rgba(63, 208, 201, 0.12);
  color: var(--vr-teal);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s, box-shadow 0.15s;
}

.play-btn:hover {
  background: rgba(63, 208, 201, 0.25);
  box-shadow: 0 0 10px rgba(63, 208, 201, 0.4);
}

.play-btn.is-playing {
  background: rgba(63, 208, 201, 0.2);
  box-shadow: 0 0 12px rgba(63, 208, 201, 0.5);
}

.play-label {
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  color: rgba(255, 245, 220, 0.6);
  letter-spacing: 0.5px;
}

.song-loading {
  font-family: "JetBrains Mono", monospace;
  font-size: 14px;
  color: rgba(255, 245, 220, 0.5);
  animation: vr-pulse 2s ease infinite;
}

/* ── Recording card ──────────────────────────────────────────────────── */
.rec-card {
  position: relative;
  background: rgb(36, 18, 71);
  border: 3px solid rgb(58, 27, 92);
  border-radius: 20px;
  padding: 20px 22px;
  display: flex;
  align-items: center;
  gap: 22px;
  flex-shrink: 0;
  transition: border-color 0.2s, box-shadow 0.2s;
}

/* mic button */
.rec-btn-col {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.mic-btn {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  border: 4px solid var(--vr-cream);
  background: radial-gradient(circle at 35% 30%, rgba(255,255,255,0.533) 0%, transparent 45%), var(--vr-teal);
  box-shadow: rgb(31, 168, 161) 0 8px 0, rgba(0, 0, 0, 0.35) 0 12px 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgb(14, 4, 32);
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}

.mic-btn:hover {
  transform: translateY(-2px);
  box-shadow: rgb(31, 168, 161) 0 10px 0, rgba(0, 0, 0, 0.4) 0 14px 30px;
}

.mic-btn:active {
  transform: translateY(2px);
  box-shadow: rgb(31, 168, 161) 0 4px 0, rgba(0, 0, 0, 0.3) 0 6px 16px;
}

.mic-btn.is-recording {
  background: radial-gradient(circle at 35% 30%, rgba(255,255,255,0.4) 0%, transparent 45%), var(--vr-pink);
  box-shadow: var(--vr-pink-dark) 0 8px 0, rgba(255, 47, 135, 0.4) 0 0 24px;
  animation: vr-pulse 1.2s ease infinite;
}

.mic-hint {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  color: rgba(255, 245, 220, 0.5);
  text-transform: uppercase;
  letter-spacing: 1px;
  text-align: center;
}

/* uploaded badge */
.uploaded-circle {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  border: 4px solid var(--vr-cream);
  background: radial-gradient(circle at 35% 30%, rgba(255,255,255,0.3) 0%, transparent 45%), var(--vr-teal);
  box-shadow: rgb(31, 168, 161) 0 8px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgb(14, 4, 32);
}

.uploaded-label {
  font-family: "Bowlby One SC", Impact, sans-serif;
  font-size: 13px;
  letter-spacing: 2px;
  color: var(--vr-cream);
}

.uploaded-sub {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  color: rgba(255, 245, 220, 0.6);
  letter-spacing: 0.5px;
}

/* waveform */
.rec-vis-col {
  flex: 1 1 0;
  min-width: 0;
}

.waveform-bars {
  height: 44px;
  display: flex;
  align-items: center;
  gap: 3px;
  width: 100%;
}

.wbar {
  flex: 1 1 0;
  background: var(--vr-teal);
  border-radius: 4px;
  box-shadow: rgba(63, 208, 201, 0.667) 0 0 6px;
  transform-origin: 50% 50%;
  min-height: 4px;
}

.wbar--live {
  animation: vr-wave-pulse 0.6s ease infinite;
}

.rec-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.rec-timer {
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
  color: rgba(255, 245, 220, 0.8);
}

.rec-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  font-family: "Bowlby One SC", Impact, sans-serif;
  font-size: 12px;
  letter-spacing: 1px;
  color: rgb(14, 4, 32);
  padding: 8px 14px;
  background: var(--vr-teal);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: transform 0.12s, filter 0.12s;
}

.action-btn:hover   { transform: translateY(-1px); filter: brightness(1.1); }
.action-btn:active  { transform: translateY(1px); }
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.action-btn-ghost {
  font-family: "Bowlby One SC", Impact, sans-serif;
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--vr-cream);
  padding: 8px 12px;
  background: transparent;
  border: 1.5px solid rgba(255, 245, 220, 0.333);
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}

.action-btn-ghost:hover {
  background: rgba(255, 245, 220, 0.08);
  border-color: rgba(255, 245, 220, 0.6);
}


/* ── RIGHT column ────────────────────────────────────────────────────── */
.col-right {
  display: flex;
  flex-direction: column;
}

.roster-panel {
  background: rgb(14, 4, 32);
  border: 3px solid rgb(58, 27, 92);
  border-radius: 20px;
  padding: 20px 20px 18px;
  display: flex;
  flex-direction: column;
  height: 88%;
  box-sizing: border-box;
}

.roster-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.roster-title {
  font-family: "Bowlby One SC", Impact, sans-serif;
  font-size: 16px;
  color: var(--vr-teal);
  letter-spacing: 2px;
}

.roster-count {
  font-family: "Bowlby One SC", Impact, sans-serif;
  font-size: 12px;
  color: var(--vr-gold);
  padding: 3px 10px;
  background: rgba(255, 224, 102, 0.133);
  border: 1.5px solid rgba(255, 224, 102, 0.4);
  border-radius: 999px;
  letter-spacing: 1.5px;
}

.roster-progress-track {
  height: 10px;
  background: rgb(24, 10, 46);
  border: 1.5px solid rgb(58, 27, 92);
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 16px;
}

.roster-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--vr-teal), var(--vr-gold));
  box-shadow: var(--vr-teal) 0 0 12px;
  transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.roster-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}

.roster-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 12px;
  background: transparent;
  border: 1.5px solid rgba(58, 27, 92, 0.533);
  transition: background 0.3s, border-color 0.3s;
}

.roster-row--done {
  background: rgba(255, 47, 135, 0.067);
  border-color: rgba(255, 47, 135, 0.333);
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 3px solid var(--vr-cream);
  box-shadow: rgb(14, 4, 32) 0 0 0 3px, rgba(0, 0, 0, 0.45) 0 6px 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: "Bowlby One SC", Impact, sans-serif;
  font-size: 16px;
  color: rgb(14, 4, 32);
  flex-shrink: 0;
  background: radial-gradient(circle at 30% 25%, rgba(255,255,255,0.533) 0%, transparent 45%),
              currentColor;
}

.pinfo {
  flex: 1 1 0;
  min-width: 0;
}

.pname-row {
  display: flex;
  gap: 6px;
  align-items: baseline;
  flex-wrap: wrap;
}

.pname {
  font-family: "Bowlby One SC", Impact, sans-serif;
  font-size: 14px;
  color: var(--vr-cream);
}

.you-tag {
  font-family: "Bowlby One SC", Impact, sans-serif;
  font-size: 10px;
  color: var(--vr-pink);
  letter-spacing: 1px;
}

.song-ref {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  color: rgba(255, 245, 220, 0.4);
  letter-spacing: 1px;
}

.done-pill {
  font-family: "Bowlby One SC", Impact, sans-serif;
  font-size: 11px;
  padding: 3px 8px;
  background: rgba(63, 208, 201, 0.133);
  color: var(--vr-teal);
  border: 1.5px solid rgba(63, 208, 201, 0.4);
  border-radius: 999px;
  letter-spacing: 1px;
  display: inline-block;
  margin-top: 2px;
}
</style>
