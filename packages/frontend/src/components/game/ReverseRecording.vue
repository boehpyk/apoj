<template>
  <div class="rev-layout">

    <!-- ── LEFT: Steps ─────────────────────────────────────────────────── -->
    <div class="col-left">

      <h2 class="phase-heading">Now sing it <span class="heading-accent">BACKWARDS.</span></h2>
      <p class="phase-subtext">
        You're reversing <strong class="original-name">{{ originalOwnerName || 'someone' }}'s</strong> clip.
        It'll sound like nonsense — that's the point. Mimic phoneme-for-phoneme.
      </p>

      <!-- ── Step 1: Listen ─────────────────────────────────────────── -->
      <div class="listen-card">
        <span class="step-badge step-badge--teal">STEP 1 · LISTEN</span>

        <div class="listen-inner">
          <!-- Teal vinyl spinning backwards -->
          <div class="vinyl-col">
            <div class="vinyl-spin-wrap">
              <svg viewBox="0 0 100 100" width="110" height="110" class="vinyl-disc vinyl-disc--rev">
                <defs>
                  <radialGradient id="rev-vinyl-bg" cx="40%" cy="35%" r="60%">
                    <stop offset="0%"   stop-color="#3FD0C9"/>
                    <stop offset="50%"  stop-color="#1A6E6B"/>
                    <stop offset="100%" stop-color="#071E1D"/>
                  </radialGradient>
                </defs>
                <circle cx="50" cy="50" r="48" fill="url(#rev-vinyl-bg)"/>
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,245,220,.07)" stroke-width="1.5"/>
                <circle cx="50" cy="50" r="34" fill="none" stroke="rgba(255,245,220,.07)" stroke-width="1.5"/>
                <circle cx="50" cy="50" r="26" fill="none" stroke="rgba(255,245,220,.07)" stroke-width="1.5"/>
                <circle cx="50" cy="50" r="18" fill="none" stroke="rgba(255,245,220,.07)" stroke-width="1.5"/>
                <circle cx="50" cy="50" r="12" fill="#3FD0C9" opacity="0.9"/>
                <circle cx="50" cy="50" r="3"  fill="#07020F"/>
              </svg>
              <span class="reversed-badge">REVERSED</span>
            </div>
          </div>

          <!-- Audio info -->
          <div class="audio-meta">
            <div class="mystery-title">{{ originalOwnerName || '???' }}'s mystery clip</div>
            <div class="mystery-sub">Original recording · played backwards</div>

            <!-- Hidden native audio element -->
            <audio
              ref="audioEl"
              :src="audioSrc || undefined"
              preload="auto"
              style="display:none"
              @loadedmetadata="onLoaded"
              @timeupdate="onTimeUpdate"
              @ended="onEnded"
            />

            <!-- Progress bar -->
            <div class="audio-progress-row">
              <span class="audio-time">{{ formatTime(currentTime) }}</span>
              <div
                class="audio-progress-track"
                @click="seek($event)"
                role="progressbar"
              >
                <div class="audio-progress-fill" :style="{ width: audioPct + '%' }"></div>
              </div>
              <span class="audio-duration">{{ formatTime(duration) }}</span>
            </div>

            <div v-if="playCount > 0" class="play-count">Plays: {{ playCount }}</div>
          </div>
        </div>

        <!-- Playback controls -->
        <div class="audio-controls">
          <button
            class="ctrl-btn ctrl-btn--play"
            :class="{ 'is-playing': isPlaying }"
            :disabled="!audioSrc && !audioLoading"
            @click="togglePlay"
          >
            <!-- Play icon -->
            <svg v-if="!isPlaying" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <polygon points="5,3 19,12 5,21"/>
            </svg>
            <!-- Pause icon -->
            <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1"/>
              <rect x="14" y="4" width="4" height="16" rx="1"/>
            </svg>
            {{ audioLoading ? 'Loading…' : isPlaying ? 'Pause' : 'Play' }}
          </button>

          <button
            class="ctrl-btn ctrl-btn--toggle"
            :class="{ 'is-active': halfSpeed }"
            @click="toggleHalfSpeed"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            ½ Speed
          </button>
        </div>
      </div>

      <!-- ── Step 2: Record ─────────────────────────────────────────── -->
      <div class="rec-card">
        <span class="step-badge step-badge--pink">STEP 2 · MIRROR</span>

        <!-- Left side: mic button or uploaded badge -->
        <div class="rec-btn-col">
          <template v-if="!uploaded">
            <button
              class="mic-btn"
              :class="{ 'is-recording': isRecording }"
              :title="isRecording ? 'Stop' : 'Record'"
              @click="isRecording ? handleStop() : handleRecord()"
            >
              <svg v-if="!isRecording" viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="2" width="6" height="12" rx="3"/>
                <path d="M5 10a7 7 0 0 0 14 0"/>
                <line x1="12" y1="19" x2="12" y2="22"/>
                <line x1="8"  y1="22" x2="16" y2="22"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
              </svg>
            </button>
            <div class="mic-hint">{{ isRecording ? (isPaused ? 'Paused' : 'Tap to stop') : recordBlob ? 'Re-record?' : 'Tap to record' }}</div>
          </template>

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
              :class="{ 'wbar--live': isRecording && !isPaused }"
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
                v-if="isRecording"
                @click="handlePause"
                class="action-btn action-btn--pause"
              >{{ isPaused ? '▶ Resume' : '⏸ Pause' }}</button>
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

      <!-- Pro tip -->
      <div class="tip-card">
        <span class="tip-icon">💡</span>
        <span>Lean into the weird vowels. The judge listens for <em>syllable shape</em>, not pitch.</span>
      </div>

    </div>

    <!-- ── RIGHT: Reverse Pairs ─────────────────────────────────────── -->
    <div class="col-right">
      <div class="pairs-panel">

        <div class="pairs-hdr">
          <span class="pairs-title">REVERSE PAIRS</span>
          <span class="pairs-count">{{ uploadedCount }} / {{ totalPlayers }}</span>
        </div>

        <div class="pairs-progress-track">
          <div class="pairs-progress-fill" :style="{ width: progressPct + '%' }"></div>
        </div>

        <div class="pairs-list">
          <div
            v-for="(singerId, ownerId) in reverseMap"
            :key="ownerId"
            class="pair-row"
            :class="{ 'pair-row--done': isDone(singerId) }"
          >
            <div
              class="avatar"
              :style="{
                background: avatarBg(playerIndex(ownerId)),
                boxShadow: `${avatarBg(playerIndex(ownerId))} 0 6px 0`
              }"
            >{{ initial(playerName(ownerId)) }}</div>

            <div class="pair-names">
              <div class="pair-from-to">
                <span class="pair-from">{{ playerName(ownerId) }}</span>
                <span class="pair-arrow">→</span>
                <span class="pair-to" :class="{ 'pair-to--you': singerId === playerId }">
                  {{ playerName(singerId) }}
                </span>
                <span v-if="singerId === playerId" class="you-tag">YOU</span>
              </div>
              <span v-if="isDone(singerId)" class="done-pill">✓ Mirrored</span>
            </div>
          </div>
        </div>

        <div v-if="!Object.keys(reverseMap).length" class="pairs-waiting">
          Preparing assignments…
        </div>

      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useAudioRecorder } from '../../composables/useAudioRecorder.js';

const props = defineProps({
  roundId:          String,
  reverseAssignment: String,   // Original owner player ID
  originalOwnerName: String,   // Display name of original owner
  uploadedCount:    Number,
  totalPlayers:     Number,
  players:          { type: Array,  default: () => [] },
  playerId:         { type: String, default: '' },
  reverseMap:       { type: Object, default: () => ({}) },   // { originalOwnerId: reverseSingerId }
  reverseStatuses:  { type: Object, default: () => ({}) },   // { reverseSingerId: 'done' }
});

const emit = defineEmits(['uploaded']);

// ── Audio recorder ────────────────────────────────────────────────────
const { isRecording, isPaused, start, pause, resume, stop } = useAudioRecorder();
const recordBlob = ref(null);
const recordUrl  = ref('');
const uploading  = ref(false);
const uploaded   = ref(false);
const playerToken = sessionStorage.getItem('playerToken');

// ── Reversed audio player ─────────────────────────────────────────────
const audioEl       = ref(null);
const audioSrc      = ref('');
const audioLoading  = ref(false);
const isPlaying     = ref(false);
const currentTime   = ref(0);
const duration      = ref(0);
const halfSpeed     = ref(false);
const playCount     = ref(0);

const audioPct = computed(() => {
  if (!duration.value) return 0;
  return Math.min(100, (currentTime.value / duration.value) * 100);
});

const progressPct = computed(() =>
  props.totalPlayers ? Math.round((props.uploadedCount / props.totalPlayers) * 100) : 0
);

function formatTime(s) {
  const secs = Math.floor(s ?? 0);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

async function loadAudio() {
  if (!props.reverseAssignment || !props.roundId || !playerToken) return;
  audioLoading.value = true;
  try {
    const url = `/api/audio/reversed/${props.roundId}/${props.reverseAssignment}`;
    const res = await fetch(url, { headers: { 'x-player-token': playerToken } });
    if (!res.ok) return;
    const blob = await res.blob();
    if (audioSrc.value) URL.revokeObjectURL(audioSrc.value);
    audioSrc.value = URL.createObjectURL(blob);
  } catch {
    // silent
  } finally {
    audioLoading.value = false;
  }
}

function onLoaded() {
  if (audioEl.value) duration.value = audioEl.value.duration || 0;
}

function onTimeUpdate() {
  if (audioEl.value) currentTime.value = audioEl.value.currentTime;
}

function onEnded() {
  isPlaying.value = false;
  playCount.value++;
}

function togglePlay() {
  if (!audioEl.value || !audioSrc.value) return;
  if (isPlaying.value) {
    audioEl.value.pause();
    isPlaying.value = false;
  } else {
    audioEl.value.play()
      .then(() => { isPlaying.value = true; })
      .catch(() => {});
  }
}

function toggleHalfSpeed() {
  halfSpeed.value = !halfSpeed.value;
  if (audioEl.value) audioEl.value.playbackRate = halfSpeed.value ? 0.5 : 1.0;
}

function seek(e) {
  if (!audioEl.value || !duration.value) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  audioEl.value.currentTime = pct * duration.value;
}

watch(() => props.reverseAssignment, (v) => { if (v) loadAudio(); }, { immediate: true });

// ── Recording timer ───────────────────────────────────────────────────
const recSeconds  = ref(0);
let timerInterval = null;

function startTimer() { recSeconds.value = 0; timerInterval = setInterval(() => recSeconds.value++, 1000); }
function stopTimer()  { clearInterval(timerInterval); timerInterval = null; }

const recTimeLabel = computed(() => {
  const s = recSeconds.value;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
});

// ── Waveform heights (60 bars) ────────────────────────────────────────
const waveHeights = [
  27, 34, 42, 55, 38, 62, 48, 71, 55, 39, 77, 64,
  52, 83, 61, 74, 58, 82, 69, 91, 64, 45, 58, 76,
  42, 53, 68, 94, 78, 59, 67, 49, 75, 99, 85, 63,
  72, 61, 87, 52, 44, 68, 71, 47, 55, 41, 33, 28,
  37, 26, 52, 41, 34, 45, 29, 22, 18, 37, 44, 31,
];

// ── Recording handlers ────────────────────────────────────────────────
async function handleRecord() { await start(); startTimer(); }

function handlePause() {
  if (isPaused.value) {
    resume();
    timerInterval = setInterval(() => recSeconds.value++, 1000);
  } else {
    pause();
    clearInterval(timerInterval);
    timerInterval = null;
  }
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
    form.append('file', recordBlob.value, 'reverse.webm');
    const res  = await fetch(`/api/rounds/${props.roundId}/reverse-recording`, {
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

onBeforeUnmount(() => {
  stopTimer();
  if (audioEl.value) audioEl.value.pause();
  if (audioSrc.value) URL.revokeObjectURL(audioSrc.value);
});

// ── Pairs roster helpers ──────────────────────────────────────────────
const AVATAR_COLORS = ['#FF2F87', '#3FD0C9', '#FFE066', '#FF6B4A'];

const isDone       = (singerId) => props.reverseStatuses[singerId] === 'done';
const initial      = (name)    => (name ?? '?')[0].toUpperCase();
const avatarBg     = (idx)     => AVATAR_COLORS[idx % AVATAR_COLORS.length];
const playerIndex  = (id)      => props.players.findIndex(p => p.id === id);
const playerName   = (id)      => {
  const p = props.players.find(x => x.id === id);
  return p ? p.name : (id ?? '').slice(0, 8);
};

</script>

<style scoped>
/* ── Root two-column grid ────────────────────────────────────────────── */
.rev-layout {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 28px;
  padding: 18px 36px 22px;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
}

/* ── LEFT column ─────────────────────────────────────────────────────── */
.col-left {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.phase-heading {
  font-family: "Bowlby One SC", "Bowlby One", Impact, sans-serif;
  font-size: 30px;
  color: var(--vr-cream);
  letter-spacing: 0.5px;
  line-height: 1;
  margin: 0;
}

.heading-accent {
  color: var(--vr-teal);
  text-shadow: var(--vr-teal) 0 0 4px, #2AA8A2 0 0 18px, rgba(63, 208, 201, 0.45) 0 0 40px;
}

.phase-subtext {
  font-size: 13px;
  color: rgba(255, 245, 220, 0.65);
  margin: 0;
  line-height: 1.4;
}

.original-name {
  color: var(--vr-gold);
  font-style: normal;
  font-weight: 700;
}

/* ── Step badge (shared) ─────────────────────────────────────────────── */
.step-badge {
  position: absolute;
  top: -12px;
  left: 22px;
  transform: rotate(-1.5deg);
  font-family: "Bowlby One SC", Impact, sans-serif;
  font-size: 12px;
  letter-spacing: 1.5px;
  padding: 4px 12px;
  border-radius: 4px;
  border: 2px solid rgb(14, 4, 32);
  color: rgb(14, 4, 32);
}

.step-badge--teal {
  background: var(--vr-teal);
}

.step-badge--pink {
  background: var(--vr-pink);
}

/* ── Listen card ─────────────────────────────────────────────────────── */
.listen-card {
  position: relative;
  background: rgb(14, 4, 32);
  border: 3px solid var(--vr-teal);
  border-radius: 20px;
  box-shadow: rgb(24, 10, 46) 0 0 0 2px, rgba(63, 208, 201, 0.25) 0 0 26px;
  padding: 18px 20px 16px;
  flex-shrink: 0;
}

.listen-inner {
  display: flex;
  gap: 18px;
  align-items: flex-start;
  margin-bottom: 14px;
}

/* teal vinyl */
.vinyl-col {
  flex: 0 0 auto;
  padding-top: 4px;
}

.vinyl-spin-wrap {
  position: relative;
  width: 110px;
  height: 110px;
}

.vinyl-disc {
  animation: vr-spin 8s linear infinite;
}

.vinyl-disc--rev {
  animation-direction: reverse;
}

.reversed-badge {
  position: absolute;
  top: -6px;
  right: -10px;
  padding: 3px 8px;
  background: var(--vr-teal);
  color: rgb(14, 4, 32);
  font-family: "Bowlby One SC", Impact, sans-serif;
  font-size: 9px;
  letter-spacing: 1px;
  border-radius: 6px;
  border: 2px solid rgb(14, 4, 32);
}

/* audio meta */
.audio-meta {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  justify-content: center;
}

.mystery-title {
  font-family: "Bowlby One SC", Impact, sans-serif;
  font-size: 18px;
  color: var(--vr-teal);
  letter-spacing: 0.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: var(--vr-teal) 0 0 4px, #2AA8A2 0 0 14px, rgba(63, 208, 201, 0.4) 0 0 30px;
}

.mystery-sub {
  font-size: 11px;
  color: rgba(255, 245, 220, 0.5);
  font-style: italic;
  letter-spacing: 0.3px;
}

.audio-progress-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.audio-time,
.audio-duration {
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  color: rgba(255, 245, 220, 0.7);
  flex-shrink: 0;
  min-width: 28px;
}

.audio-progress-track {
  flex: 1 1 0;
  height: 8px;
  background: rgb(36, 18, 71);
  border: 1.5px solid rgb(58, 27, 92);
  border-radius: 999px;
  overflow: hidden;
  cursor: pointer;
}

.audio-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--vr-teal), #6FFFFF);
  box-shadow: var(--vr-teal) 0 0 8px;
  transition: width 0.2s linear;
}

.play-count {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  color: rgba(255, 245, 220, 0.4);
  letter-spacing: 0.5px;
}

/* audio controls */
.audio-controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.ctrl-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: "Bowlby One SC", Impact, sans-serif;
  font-size: 12px;
  letter-spacing: 1px;
  padding: 8px 16px;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  transition: transform 0.12s, filter 0.12s, opacity 0.12s;
}

.ctrl-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ctrl-btn--play {
  background: var(--vr-teal);
  color: rgb(14, 4, 32);
  box-shadow: rgb(31, 168, 161) 0 5px 0;
}

.ctrl-btn--play:hover:not(:disabled)  { transform: translateY(-2px); filter: brightness(1.1); }
.ctrl-btn--play:active:not(:disabled) { transform: translateY(2px); box-shadow: rgb(31, 168, 161) 0 2px 0; }
.ctrl-btn--play.is-playing {
  background: var(--vr-pink);
  box-shadow: var(--vr-pink-dark) 0 5px 0;
}

.ctrl-btn--toggle {
  background: transparent;
  color: rgba(255, 245, 220, 0.7);
  border: 1.5px solid rgba(58, 27, 92, 0.8);
}

.ctrl-btn--toggle:hover { background: rgba(255, 245, 220, 0.06); border-color: rgba(255, 245, 220, 0.3); }

.ctrl-btn--toggle.is-active {
  background: rgba(63, 208, 201, 0.133);
  color: var(--vr-teal);
  border-color: rgba(63, 208, 201, 0.5);
}

/* ── Recording card ──────────────────────────────────────────────────── */
.rec-card {
  position: relative;
  background: rgb(36, 18, 71);
  border: 3px solid rgb(58, 27, 92);
  border-radius: 20px;
  padding: 18px 20px;
  display: flex;
  align-items: center;
  gap: 20px;
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
  width: 88px;
  height: 88px;
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

.mic-btn:hover  { transform: translateY(-2px); box-shadow: rgb(31, 168, 161) 0 10px 0, rgba(0, 0, 0, 0.4) 0 14px 30px; }
.mic-btn:active { transform: translateY(2px);  box-shadow: rgb(31, 168, 161) 0 4px 0,  rgba(0, 0, 0, 0.3) 0 6px 16px; }

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
  width: 88px;
  height: 88px;
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
  font-size: 12px;
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
  height: 40px;
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

.wbar--live { animation: vr-wave-pulse 0.6s ease infinite; }

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

.rec-actions { display: flex; gap: 8px; }

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

.action-btn--pause {
  background: rgba(255, 245, 220, 0.12);
  color: var(--vr-cream);
  border: 1.5px solid rgba(255, 245, 220, 0.3);
}

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

.action-btn-ghost:hover { background: rgba(255, 245, 220, 0.08); border-color: rgba(255, 245, 220, 0.6); }

/* ── Pro tip ─────────────────────────────────────────────────────────── */
.tip-card {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 14px;
  background: rgb(14, 4, 32);
  border: 1.5px solid rgb(58, 27, 92);
  border-radius: 12px;
  font-size: 12px;
  color: rgba(255, 245, 220, 0.8);
  line-height: 1.45;
  flex-shrink: 0;
}

.tip-icon { flex-shrink: 0; }

/* ── RIGHT column ────────────────────────────────────────────────────── */
.col-right {
  display: flex;
  flex-direction: column;
}

.pairs-panel {
  background: rgb(14, 4, 32);
  border: 3px solid rgb(58, 27, 92);
  border-radius: 20px;
  padding: 20px 20px 18px;
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
}

.pairs-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.pairs-title {
  font-family: "Bowlby One SC", Impact, sans-serif;
  font-size: 16px;
  color: var(--vr-teal);
  letter-spacing: 2px;
}

.pairs-count {
  font-family: "Bowlby One SC", Impact, sans-serif;
  font-size: 12px;
  color: var(--vr-gold);
  padding: 3px 10px;
  background: rgba(255, 224, 102, 0.133);
  border: 1.5px solid rgba(255, 224, 102, 0.4);
  border-radius: 999px;
  letter-spacing: 1.5px;
}

.pairs-progress-track {
  height: 10px;
  background: rgb(24, 10, 46);
  border: 1.5px solid rgb(58, 27, 92);
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 16px;
}

.pairs-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--vr-teal), var(--vr-gold));
  box-shadow: var(--vr-teal) 0 0 12px;
  transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.pairs-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  flex: 1 1 0;
}

.pair-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: transparent;
  border: 1.5px solid rgba(58, 27, 92, 0.533);
  transition: background 0.3s, border-color 0.3s;
}

.pair-row--done {
  background: rgba(63, 208, 201, 0.067);
  border-color: rgba(63, 208, 201, 0.3);
}

.avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 3px solid var(--vr-cream);
  box-shadow: rgb(14, 4, 32) 0 0 0 3px, rgba(0, 0, 0, 0.45) 0 6px 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: "Bowlby One SC", Impact, sans-serif;
  font-size: 14px;
  color: rgb(14, 4, 32);
  flex-shrink: 0;
}

.pair-names {
  flex: 1 1 0;
  min-width: 0;
}

.pair-from-to {
  display: flex;
  gap: 5px;
  align-items: baseline;
  flex-wrap: wrap;
}

.pair-from {
  font-family: "Bowlby One SC", Impact, sans-serif;
  font-size: 13px;
  color: rgba(255, 245, 220, 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 80px;
}

.pair-arrow {
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  color: rgba(255, 245, 220, 0.35);
  flex-shrink: 0;
}

.pair-to {
  font-family: "Bowlby One SC", Impact, sans-serif;
  font-size: 14px;
  color: var(--vr-cream);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 90px;
}

.pair-to--you {
  color: var(--vr-teal);
}

.you-tag {
  font-family: "Bowlby One SC", Impact, sans-serif;
  font-size: 9px;
  color: var(--vr-teal);
  letter-spacing: 1px;
}

.done-pill {
  font-family: "Bowlby One SC", Impact, sans-serif;
  font-size: 10px;
  padding: 2px 7px;
  background: rgba(63, 208, 201, 0.133);
  color: var(--vr-teal);
  border: 1.5px solid rgba(63, 208, 201, 0.4);
  border-radius: 999px;
  letter-spacing: 1px;
  display: inline-block;
  margin-top: 2px;
}

.pairs-waiting {
  font-family: "JetBrains Mono", monospace;
  font-size: 13px;
  color: rgba(255, 245, 220, 0.4);
  text-align: center;
  padding: 24px 0;
  animation: vr-pulse 2s ease infinite;
}
</style>
