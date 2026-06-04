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
          :class="{ 'rcard--playing': isPlayingClue(clue.clueIndex) }"
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

            <div class="rtrack-list">
              <div v-for="track in clue.tracks" :key="track.type" class="rtrack">
                <button
                  class="rtrack-play-btn"
                  :class="{ 'rtrack-play-btn--active': playingKey === track.key }"
                  @click="togglePlay(track)"
                >
                  <svg v-if="playingKey === track.key" viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                    <rect x="5" y="3" width="4" height="18" rx="1"/>
                    <rect x="15" y="3" width="4" height="18" rx="1"/>
                  </svg>
                  <svg v-else viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                    <polygon points="5,3 19,12 5,21"/>
                  </svg>
                </button>
                <span class="rtrack-label" :class="track.type === 'original' ? 'rtrack-label--original' : 'rtrack-label--garbled'">
                  {{ track.type === 'original' ? 'SAMPLE' : 'GARBLED' }}
                </span>
                <span class="rtrack-time">{{ fmtTime(currentTimes[track.key] ?? 0) }}</span>
                <div class="rtrack-bar" @click="seek(track, $event)">
                  <div class="rtrack-bar-fill" :style="{ width: barPct(track.key) + '%' }" :class="track.type === 'original' ? 'rtrack-bar-fill--original' : 'rtrack-bar-fill--garbled'"/>
                </div>
                <span class="rtrack-time rtrack-time--dur">{{ fmtTime(durations[track.key] ?? 0) }}</span>

                <audio
                  :ref="el => { if (el) audioEls[track.key] = el; else delete audioEls[track.key]; }"
                  :src="track.url"
                  preload="none"
                  @ended="onEnded(track.key)"
                  @timeupdate="onTimeUpdate(track.key, $event)"
                  @durationchange="onDurationChange(track.key, $event)"
                />
              </div>
            </div>
          </div>

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
const playingKey = ref(null); // composite key e.g. "0-original" or "1-garbled"
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
      const tok            = encodeURIComponent(token);
      return {
        clueIndex:    c.clueIndex,
        songTitle:    c.correctTitle  ?? '',
        songArtist:   c.correctArtist ?? '',
        originalName: originalPlayer?.name  ?? '?',
        imitatorName: c.singerPlayerName    ?? '?',
        tracks: [
          {
            type: 'original',
            key:  `${c.clueIndex}-original`,
            url:  `/api/audio/sample/${props.roundId}/${originalId}?token=${tok}`,
          },
          {
            type: 'garbled',
            key:  `${c.clueIndex}-garbled`,
            url:  `/api/audio/final/${props.roundId}/${originalId}?token=${tok}`,
          },
        ],
      };
    })
    .sort((a, b) => a.clueIndex - b.clueIndex)
);

function isPlayingClue(idx) {
  return playingKey.value !== null && playingKey.value.startsWith(`${idx}-`);
}

function barPct(key) {
  const t = currentTimes[key] ?? 0;
  const d = durations[key]    ?? 0;
  return d ? (t / d) * 100 : 0;
}

function fmtTime(secs) {
  const s = Math.floor(secs);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function togglePlay(track) {
  const el = audioEls[track.key];
  if (!el) return;

  if (playingKey.value === track.key) {
    el.pause();
    playingKey.value = null;
    return;
  }

  if (playingKey.value !== null) {
    audioEls[playingKey.value]?.pause();
  }

  playingKey.value = track.key;
  el.play().catch(() => {});
}

function onEnded(key) {
  if (playingKey.value === key) playingKey.value = null;
}

function onTimeUpdate(key, e) {
  currentTimes[key] = e.target.currentTime;
}

function onDurationChange(key, e) {
  durations[key] = e.target.duration;
}

function seek(track, event) {
  const el = audioEls[track.key];
  const d  = durations[track.key] ?? 0;
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
  align-items: flex-start;
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
  padding-top: 2px;
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
  gap: 4px;
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

/* ── Track rows ──────────────────────────────────────────── */
.rtrack-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 6px;
}

.rtrack {
  display: flex;
  align-items: center;
  gap: 7px;
}

.rtrack-play-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgb(40, 18, 72);
  border: 1.5px solid rgb(70, 35, 110);
  color: rgba(255, 245, 220, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.1s;
}
.rtrack-play-btn:hover {
  background: rgb(63, 208, 201);
  border-color: rgb(63, 208, 201);
  color: rgb(14, 4, 32);
  transform: scale(1.08);
}
.rtrack-play-btn--active {
  background: rgb(63, 208, 201);
  border-color: rgb(63, 208, 201);
  color: rgb(14, 4, 32);
}

.rtrack-label {
  font-family: var(--vr-font-ui);
  font-size: 9px;
  letter-spacing: 1.5px;
  flex-shrink: 0;
  min-width: 52px;
}
.rtrack-label--original { color: var(--vr-orange); }
.rtrack-label--garbled  { color: var(--vr-teal); }

.rtrack-time {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  color: rgba(255, 245, 220, 0.35);
  flex-shrink: 0;
  min-width: 26px;
}
.rtrack-time--dur {
  text-align: right;
  min-width: 28px;
}

.rtrack-bar {
  flex: 1;
  height: 4px;
  background: rgb(58, 27, 92);
  border-radius: 2px;
  cursor: pointer;
}

.rtrack-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.1s linear;
}
.rtrack-bar-fill--original { background: var(--vr-orange); }
.rtrack-bar-fill--garbled  { background: var(--vr-teal); }
</style>
