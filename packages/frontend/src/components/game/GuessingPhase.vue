<template>
  <!-- Loading / Error -->
  <div v-if="loading" class="guess-state-center">
    <span class="guess-loading">Loading clues…</span>
  </div>
  <div v-else-if="error && !clues.length" class="guess-state-center">
    <span class="guess-error">{{ error }}</span>
  </div>

  <!-- Main layout -->
  <div v-else class="guess-layout">

    <!-- ── LEFT column ─────────────────────────────────────────── -->
    <div class="col-left">

      <!-- Phase heading -->
      <div class="phase-heading-row">
        <h2 class="guess-title">Name. That. Song.</h2>
        <div class="clue-counter-pill">CLUE {{ displayIdx + 1 }} / {{ clues.length }}</div>
      </div>
      <p class="guess-subtext">The host's playing the un-reversed take. It should sound… haunted. Type what you hear.</p>

      <!-- Clue card -->
      <div class="clue-card" v-if="currentClue">
        <span class="clue-badge">★ SONG #{{ displayIdx + 1 }}</span>

        <div class="clue-inner">
          <!-- Gold vinyl -->
          <div class="clue-vinyl-col">
            <svg viewBox="0 0 100 100" width="86" height="86"
              class="clue-vinyl" :class="{ 'clue-vinyl--spinning': isPlaying }">
              <defs>
                <radialGradient id="g-vinyl-gold" cx="50%" cy="50%" r="50%">
                  <stop offset="0%"   stop-color="#000"/>
                  <stop offset="55%"  stop-color="#111"/>
                  <stop offset="56%"  stop-color="#2a2a2a"/>
                  <stop offset="60%"  stop-color="#111"/>
                  <stop offset="64%"  stop-color="#2a2a2a"/>
                  <stop offset="68%"  stop-color="#111"/>
                  <stop offset="72%"  stop-color="#2a2a2a"/>
                  <stop offset="100%" stop-color="#0a0a0a"/>
                </radialGradient>
              </defs>
              <circle cx="50" cy="50" r="49" fill="url(#g-vinyl-gold)" stroke="#000" stroke-width="0.5"/>
              <circle cx="50" cy="50" r="18" fill="#FFE066" stroke="#0E0420" stroke-width="1"/>
              <circle cx="50" cy="50" r="2"  fill="#0E0420"/>
              <text x="50" y="54" text-anchor="middle" fill="#0E0420"
                font-family="'Bowlby One SC', Impact, sans-serif" font-size="11" font-weight="bold">?</text>
              <ellipse cx="36" cy="32" rx="14" ry="3" fill="#fff" opacity="0.08"/>
            </svg>
          </div>

          <!-- Audio meta -->
          <div class="clue-audio-meta">
            <div class="mystery-title">"_ _ _ _ _ _ _ _ _ _"</div>
            <div class="clue-attribution">
              Originally sung by <strong>{{ currentClue.originalPlayerName }}</strong>
              · reversed by <strong>{{ currentClue.imitationPlayerName }}</strong>
            </div>

            <!-- Waveform -->
            <div class="clue-waveform">
              <span
                v-for="(h, i) in clueWaveHeights"
                :key="i"
                class="wave-bar"
                :class="{ 'wave-bar--playing': isPlaying }"
                :style="{ height: h + '%', animationDelay: (i * 0.04) + 's' }"
              />
            </div>

            <!-- Progress bar -->
            <div class="audio-time-row">
              <span class="audio-time">{{ formatTime(currentTime) }}</span>
              <div class="audio-progress-track" @click="seekAudio">
                <div class="audio-progress-fill" :style="{ width: audioPct + '%' }"/>
              </div>
              <span class="audio-time">{{ formatTime(duration) }}</span>
            </div>
          </div>
        </div>

        <!-- Controls row -->
        <div class="clue-controls-row">
          <button
            class="ctrl-play"
            :class="{ 'ctrl-play--active': isPlaying }"
            :disabled="!canControlAudio"
            @click="handlePlayToggle"
          >
            <svg v-if="!isPlaying" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8z"/></svg>
            <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            {{ isPlaying ? 'Pause' : 'Play' }}
          </button>
          <button
            class="ctrl-nav"
            :disabled="!canNavigate || displayIdx <= 0"
            @click="handlePrev"
          >◀ Prev</button>
          <button
            class="ctrl-nav"
            :disabled="!canNavigate || displayIdx >= clues.length - 1"
            @click="handleNext"
          >Next ▶</button>

          <!-- Clue breadcrumbs -->
          <div class="clue-crumbs">
            <div
              v-for="(c, i) in clues"
              :key="i"
              class="clue-crumb"
              :class="{
                'clue-crumb--active': i === displayIdx,
                'clue-crumb--saved':  isClueSaved(i) && i !== displayIdx,
              }"
            >{{ isClueSaved(i) ? '✓' : (i + 1) }}</div>
          </div>
        </div>
      </div>

      <!-- Autoplay blocked banner -->
      <div v-if="autoplayBlocked" class="autoplay-banner" @click="unblockAutoplay">
        👆 Tap to hear the audio
      </div>

      <!-- Guess section -->
      <div class="guess-section" v-if="currentClue && !submitted">
        <div class="guess-section-hdr">
          <span class="guess-hdr-label">
            YOUR GUESS
            <span class="guess-lock-dot" :class="{ 'guess-lock-dot--locked': isClueSaved(displayIdx) }">
              · {{ isClueSaved(displayIdx) ? 'LOCKED' : 'EDITING' }}
            </span>
          </span>
        </div>

        <div class="guess-fields-grid">
          <div>
            <label class="guess-label">SONG TITLE <span class="req-star">*</span></label>
            <input
              class="guess-input"
              type="text"
              placeholder="What did it sound like?"
              v-model="currentGuess.title"
              :disabled="isClueSaved(displayIdx)"
            />
          </div>
          <div>
            <label class="guess-label">ARTIST <span class="optional-tag">(optional)</span></label>
            <input
              class="guess-input guess-input--artist"
              type="text"
              placeholder="who sang it?"
              v-model="currentGuess.artist"
              :disabled="isClueSaved(displayIdx)"
            />
          </div>
        </div>

        <div class="guess-actions-row">
          <!-- Classic (private) mode: Save + No idea → then Edit + Next clue -->
          <template v-if="mode !== 'public'">
            <template v-if="!isClueSaved(displayIdx)">
              <button class="btn-save-guess" @click="saveClueAndAdvance">Save guess</button>
              <button class="btn-give-up" @click="noIdeaAndAdvance">No idea</button>
            </template>
            <template v-else>
              <button class="btn-edit" @click="unsaveClue(displayIdx)">✎ Edit</button>
              <button
                v-if="displayIdx < clues.length - 1"
                class="btn-next-clue"
                @click="handleNext"
              >Next clue ▶</button>
            </template>
          </template>
          <!-- Party mode: explicit save or give up -->
          <template v-else>
            <template v-if="!isClueSaved(displayIdx)">
              <button class="btn-save-guess" @click="saveClue(displayIdx)">Save guess</button>
              <button class="btn-give-up" @click="giveUpClue(displayIdx)">I give up</button>
            </template>
            <span v-else class="saved-waiting-note">✓ Saved — waiting for next song</span>
          </template>
          <span v-if="error" class="guess-error-inline">{{ error }}</span>
        </div>
      </div>

      <!-- Submitted state -->
      <div v-if="submitted" class="submitted-confirm">
        <span class="submitted-check">✓</span>
        <span>All guesses submitted!</span>
      </div>

    </div>

    <!-- ── RIGHT column ─────────────────────────────────────────── -->
    <div class="col-right">

      <!-- SUBMITTED panel -->
      <div class="panel-card">
        <div class="panel-hdr-row">
          <span class="panel-title panel-title--teal">SUBMITTED</span>
          <span class="panel-count">{{ submittedCount }} / {{ totalPlayers }}</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: submittedPct + '%' }"/>
        </div>
        <div class="players-list">
          <div
            v-for="(player, i) in players"
            :key="player.id"
            class="player-row"
            :class="{ 'player-row--you': player.id === playerId }"
          >
            <div class="avatar" :style="{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }">
              {{ initials(player.name) }}
            </div>
            <span class="player-name">
              {{ player.name }}
              <span v-if="player.id === playerId" class="you-tag">YOU</span>
            </span>
            <span v-if="submitted && player.id === playerId" class="locked-pill">✓ LOCKED</span>
            <span v-else class="pending-dash">—</span>
          </div>
        </div>
      </div>

      <!-- CLUES TONIGHT panel -->
      <div class="panel-card">
        <div class="panel-hdr-row">
          <span class="panel-title panel-title--gold">CLUES TONIGHT</span>
        </div>
        <div class="clues-tonight-list">
          <div
            v-for="(clue, i) in clues"
            :key="clue.clueIndex"
            class="tonight-row"
            :class="{
              'tonight-row--active': i === displayIdx,
              'tonight-row--done':   i < displayIdx,
            }"
            @click="handleJumpToClue(i)"
          >
            <div class="tonight-num"
              :class="{
                'tonight-num--done':   i < displayIdx,
                'tonight-num--active': i === displayIdx,
              }">
              {{ i < displayIdx ? '✓' : (i + 1) }}
            </div>
            <div class="tonight-info">
              <div class="tonight-label-row">
                <span class="tonight-name">Clue {{ i + 1 }}</span>
                <span v-if="i === displayIdx" class="now-badge">● NOW</span>
              </div>
              <div class="tonight-singers">
                <span class="singer-dot singer-dot--orig"/>
                {{ clue.originalPlayerName }}
                <span class="singer-arrow">→</span>
                <span class="singer-dot singer-dot--rev"/>
                {{ clue.imitationPlayerName }}
              </div>
            </div>
          </div>
        </div>

        <!-- Public mode host: end guessing for all players -->
        <div v-if="isHost && !submitted && mode === 'public'" class="end-guessing-area">
          <div v-if="!allGuessesLocked" class="lock-warning">
            Lock all {{ clues.length }} guesses first
          </div>
          <button
            v-else
            class="btn-end-guessing"
            :disabled="ending"
            @click="hostEndGuessing"
          >{{ ending ? 'Ending…' : '⏹ End Guessing' }}</button>
        </div>
      </div>

    </div>

    <!-- Hidden audio element -->
    <audio
      ref="audioEl"
      :src="currentClue?.finalAudioUrl || undefined"
      preload="auto"
      style="display:none"
      @loadedmetadata="onAudioLoaded"
      @timeupdate="onAudioTimeUpdate"
      @ended="onAudioEnded"
      @play="isPlaying = true"
      @pause="isPlaying = false"
    />

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { EVENTS } from 'shared/constants/index.js';

const props = defineProps({
  roundId:        { type: String,  required: true },
  mode:           { type: String,  default: 'private' },
  isHost:         { type: Boolean, default: false },
  socket:         { default: null },
  submittedCount: { type: Number,  default: 0 },
  totalPlayers:   { type: Number,  default: 0 },
  hostClueIndex:  { type: Number,  default: 0 },
  hostTotalClues: { type: Number,  default: 0 },
  hostAudioSync:  { type: Object,  default: null },
  submitNow:      { type: Boolean, default: false },
  players:        { type: Array,   default: () => [] },
  playerId:       { type: String,  default: '' },
});

const emit = defineEmits(['submitted']);

// ── Core state ────────────────────────────────────────────────
const clues            = ref([]);
const loading          = ref(true);
const error            = ref(null);
const submitted        = ref(false);
const submitting       = ref(false);
const savedClueIndices = ref(new Set());
const localClueIndex   = ref(0);    // private mode navigation
const localGuesses     = ref({});
const ending           = ref(false);

// ── Display index (public = host-driven, private = local) ──────
const displayIdx = computed(() =>
  props.mode === 'public' ? props.hostClueIndex : localClueIndex.value
);

const currentClue = computed(() =>
  clues.value.find(c => c.clueIndex === displayIdx.value) ?? null
);

const currentGuess = computed(() =>
  localGuesses.value[displayIdx.value] ?? { title: '', artist: '' }
);

// Init guess slot when clue index changes
watch(displayIdx, (idx) => {
  if (!localGuesses.value[idx]) localGuesses.value[idx] = { title: '', artist: '' };
}, { immediate: true });

// ── Saved / locked ────────────────────────────────────────────
function saveClue(idx) {
  savedClueIndices.value = new Set([...savedClueIndices.value, idx]);
}

function unsaveClue(idx) {
  const s = new Set(savedClueIndices.value);
  s.delete(idx);
  savedClueIndices.value = s;
}

function isClueSaved(idx) { return savedClueIndices.value.has(idx); }


function giveUpClue(idx) {
  localGuesses.value[idx] = { title: '', artist: '' };
  saveClue(idx);
}

const allGuessesLocked = computed(() =>
  clues.value.length > 0 && clues.value.every(c => isClueSaved(c.clueIndex))
);

const hasAnyGuess = computed(() =>
  Object.values(localGuesses.value).some(g => g.title?.trim())
);

// ── Audio player ──────────────────────────────────────────────
const audioEl         = ref(null);
const autoplayBlocked = ref(false);
const isPlaying       = ref(false);
const currentTime     = ref(0);
const duration        = ref(0);

const audioPct = computed(() =>
  duration.value ? Math.min(100, (currentTime.value / duration.value) * 100) : 0
);

const submittedPct = computed(() =>
  props.totalPlayers ? Math.round((props.submittedCount / props.totalPlayers) * 100) : 0
);

function formatTime(s) {
  const secs = Math.floor(s ?? 0);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

function onAudioLoaded() {
  if (audioEl.value) duration.value = audioEl.value.duration || 0;
}

function onAudioTimeUpdate() {
  if (audioEl.value) currentTime.value = audioEl.value.currentTime;
}

function onAudioEnded() { isPlaying.value = false; }

function seekAudio(e) {
  if (!audioEl.value || !duration.value) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  audioEl.value.currentTime = pct * duration.value;
}

// Reset player when clue changes
watch(displayIdx, () => {
  currentTime.value = 0;
  duration.value    = 0;
  isPlaying.value   = false;
});

// ── Host/non-host audio control ───────────────────────────────
const canControlAudio = computed(() =>
  props.mode === 'private' || props.isHost
);

const canNavigate = computed(() =>
  props.mode === 'private' || props.isHost
);

function handlePlayToggle() {
  if (props.mode === 'public' && props.isHost) {
    props.socket?.emit(EVENTS.HOST_AUDIO_SYNC, {
      roundId:         props.roundId,
      clueIndex:       props.hostClueIndex,
      action:          isPlaying.value ? 'pause' : 'play',
      positionSeconds: audioEl.value?.currentTime ?? 0,
    });
  } else if (props.mode === 'private') {
    if (!audioEl.value) return;
    if (isPlaying.value) {
      audioEl.value.pause();
    } else {
      audioEl.value.play().catch(() => {});
    }
  }
}

function handlePrev() {
  if (props.mode === 'public' && props.isHost) {
    if (props.hostClueIndex <= 0) return;
    props.socket?.emit(EVENTS.HOST_SONG_CHANGED, {
      roundId:    props.roundId,
      clueIndex:  props.hostClueIndex - 1,
    });
  } else if (props.mode === 'private') {
    if (localClueIndex.value > 0) localClueIndex.value--;
  }
}

function handleNext() {
  if (props.mode === 'public' && props.isHost) {
    if (props.hostClueIndex >= clues.value.length - 1) return;
    props.socket?.emit(EVENTS.HOST_SONG_CHANGED, {
      roundId:    props.roundId,
      clueIndex:  props.hostClueIndex + 1,
    });
  } else if (props.mode === 'private') {
    if (localClueIndex.value < clues.value.length - 1) localClueIndex.value++;
  }
}

function handleJumpToClue(idx) {
  if (props.mode === 'public' && props.isHost) {
    props.socket?.emit(EVENTS.HOST_SONG_CHANGED, { roundId: props.roundId, clueIndex: idx });
  } else if (props.mode === 'private') {
    localClueIndex.value = idx;
  }
}

// Classic mode: save current guess then advance (or auto-submit if last clue)
function saveClueAndAdvance() {
  saveClue(displayIdx.value);
  if (displayIdx.value < clues.value.length - 1) handleNext();
}

// Classic mode: mark as no-guess then advance (or auto-submit if last clue)
function noIdeaAndAdvance() {
  giveUpClue(displayIdx.value);
  if (displayIdx.value < clues.value.length - 1) handleNext();
}

async function unblockAutoplay() {
  autoplayBlocked.value = false;
  try { await audioEl.value?.play(); } catch {}
}

// React to host audio sync events (all clients)
watch(() => props.hostAudioSync, async (sync) => {
  if (!sync || !audioEl.value) return;
  if (sync.clueIndex !== props.hostClueIndex) return;
  audioEl.value.currentTime = (sync.positionSeconds ?? 0) + 0.15;
  if (sync.action === 'play') {
    try { await audioEl.value.play(); }
    catch { autoplayBlocked.value = true; }
  } else {
    audioEl.value.pause();
  }
}, { deep: true });

// Auto-submit when host ends guessing
watch(() => props.submitNow, async (val) => {
  if (val && !submitted.value) await submitPublicGuesses();
});

// Auto-submit when every clue is saved (classic and party mode)
watch(allGuessesLocked, async (locked) => {
  if (locked && !submitted.value) await submitPublicGuesses();
});

// ── Submit ────────────────────────────────────────────────────
async function submitPublicGuesses() {
  if (submitted.value || submitting.value) return;
  submitting.value = true;

  const guessArray = Object.entries(localGuesses.value)
    .map(([idx, g]) => ({ clueIndex: parseInt(idx), title: g.title?.trim() || '', artist: g.artist?.trim() || '' }))
    .filter(g => g.title.length > 0);

  try {
    const token = sessionStorage.getItem('playerToken');
    const res = await fetch(`/api/rounds/${props.roundId}/guess`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-player-token': token },
      body:    JSON.stringify({ guesses: guessArray }),
    });
    const d = await res.json();
    if (!res.ok && d.error !== 'Already submitted') {
      error.value = d.error || 'Submit failed';
    } else {
      submitted.value = true;
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    submitting.value = false;
    if (submitted.value) emit('submitted');
  }
}

async function hostEndGuessing() {
  ending.value = true;
  error.value  = null;
  try {
    const token = sessionStorage.getItem('playerToken');
    const res = await fetch(`/api/rounds/${props.roundId}/end-guessing`, {
      method:  'POST',
      headers: { 'x-player-token': token },
    });
    if (!res.ok) {
      const d = await res.json();
      error.value = d.error || 'Failed to end guessing';
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    ending.value = false;
  }
}

// ── Fetch clues ───────────────────────────────────────────────
async function fetchClues() {
  loading.value = true;
  error.value   = null;
  try {
    const token = sessionStorage.getItem('playerToken');
    const res = await fetch(`/api/rounds/${props.roundId}/clues`, {
      headers: { 'x-player-token': token },
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error || 'Failed to fetch clues');
    }
    const data = await res.json();
    clues.value = (data.clues || []).map(c => ({
      ...c,
      finalAudioUrl: `${c.finalAudioUrl}?token=${encodeURIComponent(token)}`,
    }));
    clues.value.forEach(c => {
      if (!localGuesses.value[c.clueIndex]) localGuesses.value[c.clueIndex] = { title: '', artist: '' };
    });
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(fetchClues);
onBeforeUnmount(() => { if (audioEl.value) audioEl.value.pause(); });

// ── Roster helpers ────────────────────────────────────────────
const AVATAR_COLORS = ['#FF2F87', '#3FD0C9', '#FFE066', '#FF6B4A'];

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

// ── Waveform ──────────────────────────────────────────────────
const clueWaveHeights = [
  34, 45, 62, 55, 42, 71, 58, 83, 65, 41,
  77, 62, 48, 91, 55, 74, 66, 88, 72, 95,
  80, 58, 67, 84, 46, 61, 78, 99, 86, 63,
  74, 55, 89, 72, 46, 59, 35, 28, 42, 31,
];
</script>

<style scoped>
/* ── Root layout ─────────────────────────────────────────────── */
.guess-layout {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 28px;
  padding: 22px 36px;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
}

/* centered states */
.guess-state-center {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.guess-loading {
  font-family: var(--vr-font-mono);
  font-size: 16px;
  color: var(--vr-cream-dim);
  animation: vr-pulse 2s ease infinite;
}

.guess-error {
  font-family: var(--vr-font-mono);
  font-size: 13px;
  color: var(--vr-pink);
}

/* ── LEFT column ─────────────────────────────────────────────── */
.col-left {
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: hidden;
}

/* Heading */
.phase-heading-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.guess-title {
  font-family: var(--vr-font-ui);
  font-size: 34px;
  color: var(--vr-cream);
  letter-spacing: 0.5px;
  margin: 0;
  line-height: 1;
}

.clue-counter-pill {
  font-family: var(--vr-font-ui);
  font-size: 13px;
  color: var(--vr-gold);
  background: rgba(255, 224, 102, 0.133);
  border: 1.5px solid rgba(255, 224, 102, 0.4);
  border-radius: 999px;
  padding: 4px 12px;
  letter-spacing: 2px;
  white-space: nowrap;
}

.guess-subtext {
  font-size: 13px;
  color: var(--vr-cream-dim);
  margin: 0;
  line-height: 1.4;
}

/* ── Clue card ───────────────────────────────────────────────── */
.clue-card {
  position: relative;
  background: rgb(36, 18, 71);
  border: 3px solid var(--vr-gold);
  border-radius: 20px;
  box-shadow: rgb(24, 10, 46) 0 0 0 2px, rgba(255, 224, 102, 0.267) 0 0 30px;
  padding: 20px 22px 16px;
  flex-shrink: 0;
}

.clue-badge {
  position: absolute;
  top: -13px;
  left: 18px;
  transform: rotate(-3deg);
  font-family: var(--vr-font-ui);
  font-size: 13px;
  letter-spacing: 1px;
  padding: 5px 13px;
  background: var(--vr-gold);
  color: var(--vr-panel);
  border-radius: 4px;
  border: 2px solid var(--vr-panel);
  box-shadow: var(--vr-panel) 3px 3px 0;
  white-space: nowrap;
}

.clue-inner {
  display: flex;
  align-items: flex-start;
  gap: 18px;
  margin-bottom: 14px;
}

/* Vinyl */
.clue-vinyl-col { flex-shrink: 0; }

.clue-vinyl { display: block; }

.clue-vinyl--spinning {
  animation: vr-spin 8s linear infinite;
}

/* Audio meta */
.clue-audio-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mystery-title {
  font-family: var(--vr-font-ui);
  font-size: 16px;
  color: var(--vr-cream);
  letter-spacing: 3px;
}

.clue-attribution {
  font-size: 12px;
  color: var(--vr-cream-dim);
  line-height: 1.4;
}

.clue-attribution strong {
  color: var(--vr-cream);
  font-weight: 600;
}

/* Waveform */
.clue-waveform {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 38px;
}

.wave-bar {
  flex: 1;
  background: var(--vr-gold);
  border-radius: 3px;
  box-shadow: rgba(255, 224, 102, 0.5) 0 0 4px;
  transform-origin: bottom center;
  min-height: 3px;
}

.wave-bar--playing {
  animation: vr-wave-pulse 0.9s ease-in-out infinite;
}

/* Audio progress */
.audio-time-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.audio-time {
  font-family: var(--vr-font-mono);
  font-size: 11px;
  color: var(--vr-cream-dim);
  white-space: nowrap;
}

.audio-progress-track {
  flex: 1;
  height: 3px;
  background: rgb(24, 10, 46);
  border-radius: 2px;
  cursor: pointer;
}

.audio-progress-fill {
  height: 100%;
  background: var(--vr-gold);
  border-radius: 2px;
  transition: width 0.1s linear;
}

/* Controls row */
.clue-controls-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ctrl-play {
  font-family: var(--vr-font-ui);
  font-size: 15px;
  letter-spacing: 0.6px;
  padding: 11px 20px;
  background: var(--vr-gold);
  color: var(--vr-panel);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  box-shadow: #B58800 0 4px 0, rgba(0,0,0,.25) 0 8px 20px;
  transition: transform 0.1s, box-shadow 0.1s, filter 0.1s;
}

.ctrl-play:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: #B58800 0 6px 0, rgba(0,0,0,.3) 0 12px 24px;
  filter: brightness(1.05);
}

.ctrl-play:active:not(:disabled) {
  transform: translateY(3px);
  box-shadow: #B58800 0 1px 0, rgba(0,0,0,.2) 0 3px 10px;
}

.ctrl-play:disabled { opacity: 0.45; cursor: not-allowed; }

.ctrl-nav {
  font-family: var(--vr-font-ui);
  font-size: 11px;
  letter-spacing: 1px;
  padding: 8px 12px;
  background: transparent;
  color: var(--vr-cream);
  border: 1.5px solid rgba(255, 245, 220, 0.333);
  border-radius: 9px;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}

.ctrl-nav:hover:not(:disabled) {
  background: rgba(255,245,220,.06);
  border-color: rgba(255,245,220,.55);
}

.ctrl-nav:disabled { opacity: 0.35; cursor: not-allowed; }

/* Clue breadcrumbs */
.clue-crumbs {
  display: flex;
  gap: 6px;
  margin-left: auto;
}

.clue-crumb {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--vr-font-ui);
  font-size: 11px;
  background: rgba(255,245,220,.08);
  color: var(--vr-cream-dim);
  border: 1.5px solid rgba(255,245,220,.15);
  transition: 0.15s;
}

.clue-crumb--active {
  background: var(--vr-gold);
  color: var(--vr-panel);
  border-color: var(--vr-gold);
}

.clue-crumb--saved {
  background: rgba(63, 208, 201, 0.15);
  color: var(--vr-teal);
  border-color: rgba(63, 208, 201, 0.4);
}

/* Autoplay banner */
.autoplay-banner {
  background: rgba(255, 224, 102, 0.12);
  border: 1.5px solid rgba(255, 224, 102, 0.4);
  border-radius: 10px;
  padding: 10px 16px;
  font-family: var(--vr-font-mono);
  font-size: 12px;
  color: var(--vr-gold);
  text-align: center;
  cursor: pointer;
  flex-shrink: 0;
}

/* ── Guess section ───────────────────────────────────────────── */
.guess-section {
  background: var(--vr-panel);
  border: 2px solid rgba(255, 224, 102, 0.2);
  border-radius: 16px;
  padding: 16px 18px 14px;
  flex-shrink: 0;
}

.guess-section-hdr {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
}

.guess-hdr-label {
  font-family: var(--vr-font-ui);
  font-size: 13px;
  color: var(--vr-cream);
  letter-spacing: 1.5px;
}

.guess-lock-dot {
  font-family: var(--vr-font-mono);
  font-size: 10px;
  color: var(--vr-cream-dim);
  letter-spacing: 1px;
}

.guess-lock-dot--locked {
  color: var(--vr-teal);
}

.autosave-hint {
  font-size: 11px;
  color: var(--vr-cream-dim);
}

.guess-fields-grid {
  display: grid;
  grid-template-columns: 2fr 1.4fr;
  gap: 12px;
  margin-bottom: 12px;
}

.guess-label {
  display: block;
  font-family: var(--vr-font-ui);
  font-size: 11px;
  color: var(--vr-gold);
  letter-spacing: 2px;
  margin-bottom: 6px;
}

.req-star   { color: var(--vr-pink); }
.optional-tag { color: var(--vr-cream-faint); font-weight: 400; }

.guess-input {
  width: 100%;
  padding: 13px 15px;
  font-family: var(--vr-font-ui);
  font-size: 16px;
  color: var(--vr-cream);
  background: var(--vr-stage-bg);
  border: 2px solid rgba(255, 224, 102, 0.333);
  border-radius: 10px;
  outline: none;
  box-sizing: border-box;
  letter-spacing: 0.4px;
  transition: border-color 0.12s, box-shadow 0.12s;
}

.guess-input::placeholder { color: rgba(255,245,220,.3); }

.guess-input:focus {
  border-color: var(--vr-gold);
  box-shadow: 0 0 0 3px rgba(255, 224, 102, 0.18);
}

.guess-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.guess-input--artist {
  font-family: var(--vr-font-body);
  font-size: 15px;
}

/* Action row */
.guess-actions-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-edit {
  font-family: var(--vr-font-ui);
  font-size: 15px;
  letter-spacing: 0.6px;
  padding: 11px 20px;
  background: var(--vr-panel);
  color: var(--vr-gold);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  box-shadow: rgb(10, 2, 24) 0 5px 0, rgba(0,0,0,.3) 0 9px 20px;
  transition: transform 0.1s, box-shadow 0.1s;
}

.btn-edit:hover {
  transform: translateY(-2px);
  box-shadow: rgb(10, 2, 24) 0 7px 0, rgba(0,0,0,.35) 0 13px 24px;
}

.btn-edit:active {
  transform: translateY(3px);
  box-shadow: rgb(10, 2, 24) 0 2px 0, rgba(0,0,0,.2) 0 3px 10px;
}

.btn-next-clue {
  font-family: var(--vr-font-ui);
  font-size: 15px;
  letter-spacing: 0.6px;
  padding: 11px 20px;
  background: var(--vr-gold);
  color: var(--vr-panel);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  box-shadow: #B58800 0 5px 0, rgba(0,0,0,.25) 0 9px 20px;
  transition: transform 0.1s, box-shadow 0.1s, filter 0.1s;
}

.btn-next-clue:hover:not(:disabled) {
  transform: translateY(-2px);
  filter: brightness(1.06);
}

.btn-next-clue:active:not(:disabled) {
  transform: translateY(3px);
  box-shadow: #B58800 0 2px 0;
}

.btn-next-clue:disabled { opacity: 0.45; cursor: not-allowed; }

.btn-save-guess {
  font-family: var(--vr-font-ui);
  font-size: 15px;
  letter-spacing: 0.6px;
  padding: 11px 22px;
  background: var(--vr-gold);
  color: var(--vr-panel);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  box-shadow: #B58800 0 5px 0, rgba(0,0,0,.25) 0 9px 20px;
  transition: transform 0.1s, box-shadow 0.1s, filter 0.1s;
}

.btn-save-guess:hover {
  transform: translateY(-2px);
  filter: brightness(1.06);
}

.btn-save-guess:active {
  transform: translateY(3px);
  box-shadow: #B58800 0 2px 0;
}

.btn-give-up {
  font-family: var(--vr-font-ui);
  font-size: 15px;
  letter-spacing: 0.6px;
  padding: 11px 22px;
  background: transparent;
  color: var(--vr-cream-dim);
  border: 1.5px solid rgba(255,245,220,.25);
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}

.btn-give-up:hover {
  background: rgba(255,245,220,.06);
  border-color: rgba(255,245,220,.45);
  color: var(--vr-cream);
}

.saved-waiting-note {
  font-family: var(--vr-font-mono);
  font-size: 11px;
  color: var(--vr-teal);
  letter-spacing: 1px;
}

.guess-error-inline {
  margin-left: auto;
  font-family: var(--vr-font-mono);
  font-size: 11px;
  color: var(--vr-pink);
}

/* Submitted confirmation */
.submitted-confirm {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  background: rgba(63, 208, 201, 0.1);
  border: 2px solid rgba(63, 208, 201, 0.35);
  border-radius: 12px;
  font-family: var(--vr-font-ui);
  font-size: 15px;
  color: var(--vr-teal);
  letter-spacing: 1px;
  flex-shrink: 0;
}

.submitted-check {
  font-size: 20px;
}

/* ── RIGHT column ────────────────────────────────────────────── */
.col-right {
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: hidden;
}

.panel-card {
  background: var(--vr-panel);
  border: 2px solid var(--vr-border);
  border-radius: 18px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow: hidden;
}

.panel-hdr-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.panel-title {
  font-family: var(--vr-font-ui);
  font-size: 13px;
  letter-spacing: 2px;
}

.panel-title--teal { color: var(--vr-teal); }
.panel-title--gold { color: var(--vr-gold); }

.panel-count {
  font-family: var(--vr-font-ui);
  font-size: 13px;
  color: var(--vr-gold);
  letter-spacing: 1px;
}

/* Progress bar */
.progress-track {
  height: 4px;
  background: rgba(255,245,220,.08);
  border-radius: 2px;
  flex-shrink: 0;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--vr-teal), var(--vr-gold));
  border-radius: 2px;
  transition: width 0.5s ease;
}

/* Players list */
.players-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}

.player-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 5px 8px;
  border-radius: 9px;
  background: transparent;
  transition: background 0.15s;
}

.player-row--you {
  background: rgba(255, 47, 135, 0.067);
}

.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 25%, rgba(255,255,255,.5) 0%, transparent 45%), var(--vr-pink);
  border: 2px solid var(--vr-cream);
  box-shadow: var(--vr-panel) 0 0 0 2px, rgba(0,0,0,.4) 0 4px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--vr-font-ui);
  font-size: 10px;
  color: var(--vr-panel);
  flex-shrink: 0;
}

.player-name {
  font-family: var(--vr-font-ui);
  font-size: 13px;
  color: var(--vr-cream);
  flex: 1;
}

.you-tag {
  font-size: 10px;
  color: var(--vr-pink);
  margin-left: 5px;
}

.locked-pill {
  font-family: var(--vr-font-ui);
  font-size: 10px;
  color: var(--vr-teal);
  background: rgba(63, 208, 201, 0.133);
  border: 1.5px solid rgba(63, 208, 201, 0.4);
  border-radius: 999px;
  padding: 2px 7px;
  letter-spacing: 1px;
}

.pending-dash {
  font-family: var(--vr-font-mono);
  font-size: 13px;
  color: var(--vr-cream-faint);
}

/* CLUES TONIGHT list */
.clues-tonight-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
}

.tonight-row {
  padding: 9px 11px;
  border-radius: 11px;
  background: var(--vr-stage-bg);
  border: 2px solid rgba(63, 208, 201, 0.2);
  cursor: default;
  transition: background 0.15s, border-color 0.15s;
  display: flex;
  align-items: flex-start;
  gap: 9px;
}

.tonight-row--active {
  background: rgba(255, 224, 102, 0.082);
  border-color: var(--vr-gold);
}

.tonight-row--done {
  background: var(--vr-stage-bg);
  border-color: rgba(63, 208, 201, 0.267);
}

.tonight-num {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: rgba(255,245,220,.1);
  color: var(--vr-cream-dim);
  font-family: var(--vr-font-ui);
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
}

.tonight-num--active {
  background: var(--vr-gold);
  color: var(--vr-panel);
}

.tonight-num--done {
  background: var(--vr-teal);
  color: var(--vr-panel);
}

.tonight-info { flex: 1; min-width: 0; }

.tonight-label-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.tonight-name {
  font-family: var(--vr-font-ui);
  font-size: 13px;
  color: var(--vr-cream);
}

.now-badge {
  font-family: var(--vr-font-ui);
  font-size: 10px;
  color: var(--vr-gold);
  letter-spacing: 1.5px;
  margin-left: auto;
  animation: vr-marquee-blink 1.4s ease infinite;
}

.tonight-singers {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--vr-cream-dim);
}

.singer-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.singer-dot--orig { background: #FF6B4A; }
.singer-dot--rev  { background: var(--vr-gold); }

.singer-arrow { color: rgba(255,245,220,.25); }

/* End guessing / submit areas */
.end-guessing-area,
.submit-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.lock-warning {
  font-family: var(--vr-font-mono);
  font-size: 11px;
  color: var(--vr-gold);
  text-align: center;
  padding: 8px;
  background: rgba(255, 224, 102, 0.07);
  border-radius: 8px;
  border: 1px solid rgba(255, 224, 102, 0.2);
}

.btn-end-guessing {
  width: 100%;
  font-family: var(--vr-font-ui);
  font-size: 14px;
  letter-spacing: 1px;
  padding: 12px;
  background: var(--vr-pink);
  color: #fff;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  box-shadow: var(--vr-pink-dark) 0 5px 0, rgba(0,0,0,.25) 0 9px 20px;
  transition: transform 0.1s, box-shadow 0.1s, filter 0.1s;
}

.btn-end-guessing:hover:not(:disabled) {
  transform: translateY(-2px);
  filter: brightness(1.08);
}

.btn-end-guessing:active:not(:disabled) {
  transform: translateY(3px);
  box-shadow: var(--vr-pink-dark) 0 2px 0;
}

.btn-end-guessing:disabled { opacity: 0.45; cursor: not-allowed; }

.btn-submit-guesses {
  width: 100%;
  font-family: var(--vr-font-ui);
  font-size: 14px;
  letter-spacing: 1px;
  padding: 12px;
  background: var(--vr-gold);
  color: var(--vr-panel);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  box-shadow: #B58800 0 5px 0, rgba(0,0,0,.25) 0 9px 20px;
  transition: transform 0.1s, box-shadow 0.1s, filter 0.1s;
}

.btn-submit-guesses:hover:not(:disabled) {
  transform: translateY(-2px);
  filter: brightness(1.06);
}

.btn-submit-guesses:active:not(:disabled) {
  transform: translateY(3px);
  box-shadow: #B58800 0 2px 0;
}

.btn-submit-guesses:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
