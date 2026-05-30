<template>
  <div class="rply-backdrop" @click.self="$emit('close')">
    <div class="rply-panel">

      <div class="rply-head">
        <span class="rply-title">◄◄ EVIDENCE LOCKER</span>
        <button class="rply-close-btn" @click="$emit('close')">✕</button>
      </div>
      <p class="rply-subtitle">Here's the full carnage, in glorious detail. You're welcome.</p>

      <div v-if="!enrichedClues.length" class="rply-empty">Loading clues…</div>

      <div v-else class="rply-list">
        <div
          v-for="clue in enrichedClues"
          :key="clue.clueIndex"
          class="rcard"
          :class="{ 'rcard--playing': playingIdx === clue.clueIndex }"
        >

          <div class="rcard-num">{{ clue.clueIndex + 1 }}</div>

          <div class="rcard-info">
            <div class="rcard-song">
              <span class="rcard-song-title">{{ clue.songTitle || `Clue #${clue.clueIndex + 1}` }}</span>
              <span v-if="clue.songArtist" class="rcard-song-artist">{{ clue.songArtist }}</span>
            </div>
            <div class="rcard-attr">
              <span class="rcard-name rcard-name-orange">{{ clue.originalName }}</span>
              <span class="rcard-dim"> sang it first · </span>
              <span class="rcard-name rcard-name-teal">{{ clue.imitatorName }}</span>
              <span class="rcard-dim"> made it weird</span>
            </div>
            <div class="rcard-bar-row">
              <span class="rcard-time">{{ fmtTime(currentTimes[clue.clueIndex] ?? 0) }}</span>
              <div class="rcard-bar" @click="seek(clue, $event)">
                <div class="rcard-bar-fill" :style="{ width: barPct(clue.clueIndex) + '%' }"/>
              </div>
              <span class="rcard-time">{{ fmtTime(durations[clue.clueIndex] ?? 0) }}</span>
            </div>
          </div>

          <button
            class="rcard-play-btn"
            :class="{ 'rcard-play-btn--active': playingIdx === clue.clueIndex }"
            @click="togglePlay(clue)"
          >
            <svg v-if="playingIdx === clue.clueIndex" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <rect x="5" y="3" width="4" height="18" rx="1"/>
              <rect x="15" y="3" width="4" height="18" rx="1"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <polygon points="5,3 19,12 5,21"/>
            </svg>
          </button>

          <audio
            :ref="el => { if (el) audioEls[clue.clueIndex] = el; else delete audioEls[clue.clueIndex]; }"
            :src="clue.audioUrl"
            preload="none"
            @ended="onEnded(clue.clueIndex)"
            @timeupdate="onTimeUpdate(clue.clueIndex, $event)"
            @durationchange="onDurationChange(clue.clueIndex, $event)"
          />

        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps({
  apiClues:   { type: Array,  required: true },
  reverseMap: { type: Object, default: () => ({}) },
  players:    { type: Array,  default: () => [] },
  roundId:    { type: String, required: true },
});

const emit = defineEmits(['close']);

const token      = sessionStorage.getItem('playerToken') ?? '';
const playingIdx = ref(null);
const audioEls   = reactive({});
const currentTimes = reactive({});
const durations    = reactive({});

const invertedMap = computed(() => {
  const m = {};
  for (const [orig, imit] of Object.entries(props.reverseMap)) m[imit] = orig;
  return m;
});

const enrichedClues = computed(() =>
  (props.apiClues ?? [])
    .map(c => {
      const originalId     = invertedMap.value[c.singerPlayerId];
      const originalPlayer = props.players.find(p => p.id === originalId);
      return {
        clueIndex:    c.clueIndex,
        songTitle:    c.correctTitle  ?? '',
        songArtist:   c.correctArtist ?? '',
        originalName: originalPlayer?.name  ?? '?',
        imitatorName: c.singerPlayerName    ?? '?',
        audioUrl:     `/api/audio/final/${props.roundId}/${originalId}?token=${encodeURIComponent(token)}`,
      };
    })
    .sort((a, b) => a.clueIndex - b.clueIndex)
);

function barPct(idx) {
  const t = currentTimes[idx] ?? 0;
  const d = durations[idx]    ?? 0;
  return d ? (t / d) * 100 : 0;
}

function fmtTime(secs) {
  const s = Math.floor(secs);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function togglePlay(clue) {
  const el = audioEls[clue.clueIndex];
  if (!el) return;

  if (playingIdx.value === clue.clueIndex) {
    el.pause();
    playingIdx.value = null;
    return;
  }

  if (playingIdx.value !== null) {
    audioEls[playingIdx.value]?.pause();
  }

  playingIdx.value = clue.clueIndex;
  el.play().catch(() => {});
}

function onEnded(idx) {
  if (playingIdx.value === idx) playingIdx.value = null;
}

function onTimeUpdate(idx, e) {
  currentTimes[idx] = e.target.currentTime;
}

function onDurationChange(idx, e) {
  durations[idx] = e.target.duration;
}

function seek(clue, event) {
  const el = audioEls[clue.clueIndex];
  const d  = durations[clue.clueIndex] ?? 0;
  if (!el || !d) return;
  const rect = event.currentTarget.getBoundingClientRect();
  el.currentTime = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * d;
}

function onKeyDown(e) {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => window.addEventListener('keydown', onKeyDown));
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  for (const el of Object.values(audioEls)) el?.pause();
});
</script>

<style scoped>
.rply-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(7, 2, 15, 0.85);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.rply-panel {
  background: rgb(14, 4, 32);
  border: 2px solid rgb(63, 208, 201);
  border-radius: 20px;
  box-shadow:
    rgb(24, 10, 46) 0 0 0 3px,
    rgba(63, 208, 201, 0.2) 0 0 40px;
  width: 100%;
  max-width: 680px;
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.rply-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px 12px;
  flex-shrink: 0;
  border-bottom: 1px solid rgb(58, 27, 92);
}

.rply-title {
  font-family: var(--vr-font-ui);
  font-size: 15px;
  letter-spacing: 3px;
  color: var(--vr-teal);
}

.rply-close-btn {
  background: none;
  border: 1.5px solid rgb(58, 27, 92);
  border-radius: 8px;
  color: rgba(255, 245, 220, 0.5);
  font-size: 13px;
  padding: 4px 10px;
  cursor: pointer;
  font-family: var(--vr-font-ui);
  transition: border-color 0.15s, color 0.15s;
}
.rply-close-btn:hover {
  border-color: var(--vr-pink);
  color: var(--vr-cream);
}

.rply-subtitle {
  font-size: 12px;
  color: rgba(255, 245, 220, 0.35);
  padding: 8px 22px 0;
  margin: 0;
  flex-shrink: 0;
  font-style: italic;
}

.rply-empty {
  padding: 40px;
  text-align: center;
  font-family: var(--vr-font-ui);
  font-size: 13px;
  color: rgba(255, 245, 220, 0.4);
}

.rply-list {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

/* ── Card ────────────────────────────────────────────────── */
.rcard {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgb(24, 10, 46);
  border: 1.5px solid rgb(58, 27, 92);
  transition: border-color 0.2s, box-shadow 0.2s;
}
.rcard--playing {
  border-color: rgb(63, 208, 201);
  box-shadow: rgba(63, 208, 201, 0.12) 0 0 18px;
}

.rcard-num {
  font-family: var(--vr-font-ui);
  font-size: 22px;
  color: rgba(255, 245, 220, 0.18);
  min-width: 26px;
  text-align: center;
  flex-shrink: 0;
  transition: color 0.2s;
}
.rcard--playing .rcard-num {
  color: var(--vr-teal);
}

/* Info area */
.rcard-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.rcard-song {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.rcard-song-title {
  font-family: var(--vr-font-ui);
  font-size: 17px;
  color: var(--vr-gold);
  text-shadow: var(--vr-gold) 0 0 6px, rgb(255, 196, 0) 0 0 14px;
  line-height: 1.2;
}

.rcard-song-artist {
  font-size: 12px;
  color: rgba(255, 245, 220, 0.45);
  font-style: italic;
}

.rcard-attr {
  font-size: 11px;
}

.rcard-name { font-weight: 700; }
.rcard-name-orange { color: var(--vr-orange); }
.rcard-name-teal   { color: var(--vr-teal); }
.rcard-dim { color: rgba(255, 245, 220, 0.35); }

/* Progress row */
.rcard-bar-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.rcard-time {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  color: rgba(255, 245, 220, 0.35);
  flex-shrink: 0;
  min-width: 28px;
}

.rcard-bar {
  flex: 1;
  height: 4px;
  background: rgb(58, 27, 92);
  border-radius: 2px;
  cursor: pointer;
}

.rcard-bar-fill {
  height: 100%;
  background: var(--vr-teal);
  border-radius: 2px;
  transition: width 0.1s linear;
}

/* Play button */
.rcard-play-btn {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: rgb(40, 18, 72);
  border: 2px solid rgb(70, 35, 110);
  color: rgba(255, 245, 220, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.1s;
}
.rcard-play-btn:hover {
  background: rgb(63, 208, 201);
  border-color: rgb(63, 208, 201);
  color: rgb(14, 4, 32);
  transform: scale(1.06);
}
.rcard-play-btn--active {
  background: rgb(63, 208, 201);
  border-color: rgb(63, 208, 201);
  color: rgb(14, 4, 32);
}
</style>
