<template>
  <div class="sr-root">

    <!-- ── Top row ─────────────────────────────────────────────────────── -->
    <div class="sr-header">
      <span class="sr-heading">★ THE RESULTS ARE IN ★</span>
      <div class="sr-sep"></div>
      <div class="sr-actions">
        <button class="btn-share" @click="shareRecap">
          {{ copied ? 'Copied!' : 'Share Recap' }}
        </button>
        <button v-if="apiClues" class="btn-replay" @click="showReplay = true">
          Rewind &amp; Cringe
        </button>
        <template v-if="isHost">
          <button class="btn-again" @click="anotherRound">Another Round</button>
          <button class="btn-end"   @click="endAndNew">End &amp; New Room</button>
        </template>
      </div>
    </div>

    <!-- ── Main grid ───────────────────────────────────────────────────── -->
    <div class="sr-grid">

      <!-- LEFT — Leaderboard ─────────────────────────────────────────── -->
      <div class="lb-card">

        <span class="lb-badge">LEADERBOARD</span>

        <!-- Podium -->
        <div class="podium" v-if="leaderboard.length">
          <!-- 2nd place -->
          <div class="podium-col" v-if="leaderboard[1]">
            <div class="podium-avatar pa-sm" :style="{ background: avatarBg(leaderboard[1].playerId) }">
              {{ initials(leaderboard[1].playerName) }}
            </div>
            <span class="podium-name pn-sm">{{ leaderboard[1].playerName }}</span>
            <div class="podium-bar pb-silver">
              <span class="bar-score">{{ leaderboard[1].total }}</span>
              <span class="bar-medal">SILVER</span>
            </div>
          </div>

          <!-- 1st place -->
          <div class="podium-col" v-if="leaderboard[0]">
            <div class="podium-avatar pa-lg pa-float" :style="{ background: avatarBg(leaderboard[0].playerId) }">
              {{ initials(leaderboard[0].playerName) }}
            </div>
            <span class="podium-name pn-lg pn-gold">{{ leaderboard[0].playerName }}</span>
            <div class="podium-bar pb-gold">
              <span class="bar-score">{{ leaderboard[0].total }}</span>
              <span class="bar-medal">CHAMP</span>
            </div>
          </div>

          <!-- 3rd place -->
          <div class="podium-col" v-if="leaderboard[2]">
            <div class="podium-avatar pa-sm" :style="{ background: avatarBg(leaderboard[2].playerId) }">
              {{ initials(leaderboard[2].playerName) }}
            </div>
            <span class="podium-name pn-sm">{{ leaderboard[2].playerName }}</span>
            <div class="podium-bar pb-bronze">
              <span class="bar-score">{{ leaderboard[2].total }}</span>
              <span class="bar-medal">BRONZE</span>
            </div>
          </div>
        </div>

        <!-- Player list -->
        <div class="lb-list">
          <div
            v-for="(entry, idx) in leaderboard"
            :key="entry.playerId"
            class="lb-row"
            :class="{ 'lb-row-you': entry.playerId === myPlayerId }"
          >
            <span class="lb-rank" :class="{ 'lb-rank-first': idx === 0 }">{{ idx + 1 }}</span>
            <span class="lb-dot" :style="{ background: dotColor(idx), boxShadow: `0 0 8px ${dotColor(idx)}` }"></span>
            <span class="lb-name">{{ entry.playerName }}</span>
            <span v-if="entry.playerId === myPlayerId" class="lb-you">YOU</span>
            <span class="lb-score">
              {{ entry.total }}<span class="lb-pts"> pts</span>
            </span>
          </div>
        </div>

      </div><!-- /lb-card -->

      <!-- RIGHT — Breakdown ──────────────────────────────────────────── -->
      <div class="bd-panel">

        <div class="bd-header">
          <span class="bd-title">BREAKDOWN BY SONG</span>
          <div class="bd-chips">
            <button
              v-for="(_, idx) in clueGroups"
              :key="idx"
              class="bd-chip"
              :class="{ 'bd-chip-active': activeSong === idx }"
              @click="goToSong(idx)"
            >{{ idx + 1 }}</button>
          </div>
        </div>

        <div class="bd-scroll" ref="scrollEl">
          <div
            v-for="(group, idx) in clueGroups"
            :key="group.clueIndex"
            class="song-card"
            :ref="el => { if (el) songRefs[idx] = el }"
          >
            <!-- Song header -->
            <div class="song-hdr">
              <span class="song-title">{{ group.songTitle || `Clue #${group.clueIndex + 1}` }}</span>
              <span v-if="group.songArtist" class="song-artist">{{ group.songArtist }}</span>
            </div>

            <!-- Attribution -->
            <div class="song-attr" v-if="group.singerName">
              <span class="attr-dot attr-dot-orange"></span>
              <span class="attr-text">sung by</span>
              <strong class="attr-name">{{ group.singerName }}</strong>
              <span class="attr-arrow">→</span>
              <span class="attr-dot attr-dot-gold"></span>
              <span class="attr-text">reversed by</span>
              <strong class="attr-name">{{ group.reverserName || '?' }}</strong>
            </div>

            <!-- Guess rows -->
            <div class="guess-list">
              <div
                v-for="score in group.playerScores"
                :key="score.playerId"
                class="guess-row"
                :class="{ 'guess-row-you': score.playerId === myPlayerId }"
              >
                <!-- Avatar -->
                <div class="guess-avatar" :style="{ background: avatarBg(score.playerId) }">
                  {{ initials(score.playerName) }}
                </div>

                <!-- Name + guess -->
                <div class="guess-info">
                  <div class="guess-nameline">
                    <span class="guess-player">{{ score.playerName }}</span>
                    <span v-if="score.playerId === myPlayerId" class="guess-you">· you</span>
                    <span v-if="score.total >= 100" class="guess-exact">EXACT</span>
                  </div>
                  <div class="guess-text">{{ score.guessTitle || '(no guess)' }}</div>
                </div>

                <!-- Score -->
                <span class="guess-score" :class="score.total >= 30 ? 'gs-teal' : 'gs-orange'">
                  {{ score.total }}
                </span>
              </div>
            </div>

          </div><!-- /song-card -->
        </div><!-- /bd-scroll -->

      </div><!-- /bd-panel -->

    </div><!-- /sr-grid -->

  </div>

  <ClueReplayOverlay
    v-if="showReplay && apiClues"
    :api-clues="apiClues"
    :reverse-map="props.reverseMap"
    :players="props.players"
    :round-id="props.roundId"
    @close="showReplay = false"
  />

</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import ClueReplayOverlay from './ClueReplayOverlay.vue';
import { useRouter } from 'vue-router';

const props = defineProps({
  scores:     { type: Array,   required: true },
  myPlayerId: { type: String,  required: true },
  isHost:     { type: Boolean, default: false },
  roundId:    { type: String,  default: null  },
  roomCode:   { type: String,  default: null  },
  players:    { type: Array,   default: () => [] },
  reverseMap: { type: Object,  default: () => ({}) },
});

const router     = useRouter();
const copied     = ref(false);
const apiClues   = ref(null);
const showReplay = ref(false);
const activeSong = ref(0);
const scrollEl  = ref(null);
const songRefs  = ref([]);

// ── Avatar palette ──────────────────────────────────────────────────────
const AVATAR_PALETTE = ['#FF2F87', '#3FD0C9', '#FFE066', '#FF6B4A'];

function avatarColor(playerId) {
  const idx = props.players.findIndex(p => p.id === playerId);
  return AVATAR_PALETTE[idx < 0 ? 0 : idx % AVATAR_PALETTE.length];
}

function avatarBg(playerId) {
  const color = avatarColor(playerId);
  return `radial-gradient(circle at 30% 25%, rgba(255,255,255,0.533) 0%, transparent 45%), ${color}`;
}

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// Dot colors for leaderboard rows
const DOT_COLORS = ['#FFE066', '#3FD0C9', '#FF6B4A'];
function dotColor(idx) {
  return idx < 3 ? DOT_COLORS[idx] : '#FF2F87';
}

// ── Computed data ───────────────────────────────────────────────────────
const leaderboard = computed(() => {
  const totals = {};
  for (const s of props.scores) {
    if (!totals[s.playerId]) {
      totals[s.playerId] = { playerId: s.playerId, playerName: s.playerName, total: 0 };
    }
    totals[s.playerId].total += s.total;
  }
  return Object.values(totals).sort((a, b) => b.total - a.total);
});

const clueGroups = computed(() => {
  const map = {};
  for (const s of props.scores) {
    if (!map[s.clueIndex]) {
      map[s.clueIndex] = {
        clueIndex:    s.clueIndex,
        songTitle:    s.songTitle,
        songArtist:   s.songArtist,
        singerName:   null,
        reverserName: null,
        playerScores: [],
      };
    }
    map[s.clueIndex].playerScores.push(s);
  }
  // Enrich with API data
  if (apiClues.value) {
    for (const c of apiClues.value) {
      if (map[c.clueIndex]) {
        map[c.clueIndex].singerName = c.singerPlayerName ?? null;
        const reverserId = props.reverseMap[c.singerPlayerId];
        if (reverserId) {
          const reverser = props.players.find(p => p.id === reverserId);
          map[c.clueIndex].reverserName = reverser?.name ?? null;
        }
      }
    }
  }
  return Object.values(map).sort((a, b) => a.clueIndex - b.clueIndex);
});

// ── Navigation ──────────────────────────────────────────────────────────
function goToSong(idx) {
  activeSong.value = idx;
  const el = songRefs.value[idx];
  if (el && scrollEl.value) {
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// ── Actions ─────────────────────────────────────────────────────────────
function shareRecap() {
  const lines = ['★ VERSE REVERSE — RESULTS ★', ''];
  for (const [i, entry] of leaderboard.value.entries()) {
    lines.push(`${i + 1}. ${entry.playerName} — ${entry.total} pts`);
  }
  const text = lines.join('\n');
  navigator.clipboard.writeText(text).then(() => {
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  });
}

function anotherRound() {
  router.push('/');
}

async function endAndNew() {
  try {
    const token = sessionStorage.getItem('playerToken');
    if (props.roundId) {
      await fetch(`/api/rounds/${props.roundId}/end`, {
        method: 'POST',
        headers: { 'x-player-token': token },
      });
    }
  } finally {
    router.replace('/');
  }
}

// ── API fetch ───────────────────────────────────────────────────────────
onMounted(async () => {
  if (!props.roundId) return;
  try {
    const token = sessionStorage.getItem('playerToken');
    const res = await fetch(`/api/rounds/${props.roundId}/results`, {
      headers: { 'x-player-token': token },
    });
    if (res.ok) {
      const data = await res.json();
      apiClues.value = data.clues ?? null;
    }
  } catch {
    // silent — enrichment is best-effort
  }
});
</script>

<style scoped>
/* ── Root ──────────────────────────────────────────────────────────────── */
.sr-root {
  position: absolute;
  inset: 0;
  padding: 20px 36px 28px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 18px;
  overflow: hidden;
}

/* ── Top row ───────────────────────────────────────────────────────────── */
.sr-header {
  display: flex;
  align-items: baseline;
  gap: 14px;
  flex-shrink: 0;
}

.sr-heading {
  font-family: var(--vr-font-ui);
  font-size: 14px;
  color: var(--vr-gold);
  letter-spacing: 4px;
  white-space: nowrap;
}

.sr-sep {
  flex: 1;
  height: 1px;
  background: rgb(58, 27, 92);
  align-self: center;
}

.sr-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.btn-share {
  border: 1.5px solid rgba(255, 245, 220, 0.333);
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 12px;
  font-family: var(--vr-font-ui);
  color: var(--vr-cream);
  background: transparent;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.btn-share:hover {
  background: rgba(255, 245, 220, 0.06);
  border-color: rgba(255, 245, 220, 0.5);
}

.btn-replay {
  background: rgb(63, 208, 201);
  color: rgb(14, 4, 32);
  border: none;
  border-radius: 10px;
  padding: 10px 16px;
  font-size: 14px;
  font-family: var(--vr-font-ui);
  box-shadow: rgb(30, 130, 130) 0px 4px 0px;
  cursor: pointer;
  transition: filter 0.12s, transform 0.1s;
}
.btn-replay:hover  { filter: brightness(1.07); transform: translateY(-1px); }
.btn-replay:active { transform: translateY(2px); box-shadow: rgb(30,130,130) 0px 2px 0px; }

.btn-again {
  background: rgb(255, 224, 102);
  color: rgb(14, 4, 32);
  border: none;
  border-radius: 10px;
  padding: 10px 16px;
  font-size: 14px;
  font-family: var(--vr-font-ui);
  box-shadow: rgb(181, 158, 0) 0px 4px 0px;
  cursor: pointer;
  transition: filter 0.12s, transform 0.1s;
}
.btn-again:hover { filter: brightness(1.07); transform: translateY(-1px); }
.btn-again:active { transform: translateY(2px); box-shadow: rgb(181,158,0) 0px 2px 0px; }

.btn-end {
  background: rgb(255, 47, 135);
  color: white;
  border: none;
  border-radius: 10px;
  padding: 10px 16px;
  font-size: 14px;
  font-family: var(--vr-font-ui);
  box-shadow: rgb(142, 15, 74) 0px 4px 0px;
  cursor: pointer;
  transition: filter 0.12s, transform 0.1s;
}
.btn-end:hover { filter: brightness(1.1); transform: translateY(-1px); }
.btn-end:active { transform: translateY(2px); box-shadow: rgb(142,15,74) 0px 2px 0px; }

/* ── Main grid ─────────────────────────────────────────────────────────── */
.sr-grid {
  display: grid;
  grid-template-columns: 1fr 1.3fr;
  gap: 22px;
  flex: 1;
  min-height: 0;
}

/* ── Leaderboard card ──────────────────────────────────────────────────── */
.lb-card {
  position: relative;
  background: rgb(14, 4, 32);
  border: 3px solid rgb(255, 224, 102);
  border-radius: 20px;
  box-shadow:
    rgb(24, 10, 46) 0 0 0 2px,
    rgba(255, 224, 102, 0.267) 0 0 30px;
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.lb-badge {
  display: inline-block;
  transform: rotate(-3deg);
  font-family: var(--vr-font-ui);
  font-size: 14px;
  letter-spacing: 1px;
  padding: 6px 14px;
  background: rgb(255, 224, 102);
  color: rgb(14, 4, 32);
  border-radius: 4px;
  border: 2px solid rgb(14, 4, 32);
  box-shadow: rgb(14, 4, 32) 2px 2px 0px;
  align-self: flex-start;
}

/* ── Podium ────────────────────────────────────────────────────────────── */
.podium {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 14px;
  margin-top: 14px;
  height: 200px;
  flex-shrink: 0;
}

.podium-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

/* Avatars */
.podium-avatar {
  border-radius: 50%;
  border: 3px solid rgb(255, 245, 220);
  box-shadow:
    rgb(14, 4, 32) 0 0 0 3px,
    rgba(0, 0, 0, 0.45) 0 6px 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--vr-font-ui);
  font-size: 14px;
  color: rgb(14, 4, 32);
  flex-shrink: 0;
}
.pa-sm { width: 54px; height: 54px; font-size: 13px; }
.pa-lg { width: 70px; height: 70px; font-size: 16px; }
.pa-float {
  margin-bottom: -8px;
  animation: vr-float 2.8s ease-in-out infinite;
}

/* Podium names */
.podium-name {
  font-family: var(--vr-font-ui);
  line-height: 1.1;
  text-align: center;
  max-width: 84px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pn-sm   { font-size: 12px; color: var(--vr-cream); }
.pn-lg   { font-size: 14px; color: var(--vr-cream); }
.pn-gold {
  font-size: 18px;
  color: rgb(255, 224, 102);
  text-shadow:
    rgb(255, 224, 102) 0 0 6px,
    rgb(255, 196, 0) 0 0 14px,
    rgba(255, 196, 0, 0.5) 0 0 30px,
    rgba(255, 196, 0, 0.25) 0 0 60px;
}

/* Podium bars */
.podium-bar {
  border-top:   3px solid rgb(14, 4, 32);
  border-right: 3px solid rgb(14, 4, 32);
  border-left:  3px solid rgb(14, 4, 32);
  border-radius: 6px 6px 0 0;
  width: 84px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.pb-gold {
  height: 110px;
  background:
    repeating-linear-gradient(90deg, transparent 0px, transparent 8px, rgba(0,0,0,0.06) 8px, rgba(0,0,0,0.06) 9px)
    rgb(255, 224, 102);
}
.pb-silver {
  height: 80px;
  background:
    repeating-linear-gradient(90deg, transparent 0px, transparent 8px, rgba(0,0,0,0.06) 8px, rgba(0,0,0,0.06) 9px)
    rgba(255, 245, 220, 0.8);
}
.pb-bronze {
  height: 60px;
  background:
    repeating-linear-gradient(90deg, transparent 0px, transparent 8px, rgba(0,0,0,0.06) 8px, rgba(0,0,0,0.06) 9px)
    rgb(255, 107, 74);
}

.bar-score {
  font-family: var(--vr-font-ui);
  font-size: 32px;
  color: rgb(14, 4, 32);
  line-height: 1;
}
.bar-medal {
  font-family: var(--vr-font-ui);
  font-size: 10px;
  color: rgb(14, 4, 32);
  letter-spacing: 2px;
}

/* ── Player list ───────────────────────────────────────────────────────── */
.lb-list {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.lb-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 12px;
  background: rgb(24, 10, 46);
  border: 1.5px solid rgb(58, 27, 92);
}
.lb-row-you {
  background: rgba(255, 47, 135, 0.082);
  border-color: rgba(255, 47, 135, 0.533);
}

.lb-rank {
  font-family: var(--vr-font-ui);
  font-size: 16px;
  width: 22px;
  color: rgba(255, 245, 220, 0.667);
  flex-shrink: 0;
}
.lb-rank-first {
  color: rgb(255, 224, 102);
  text-shadow:
    rgb(255, 224, 102) 0 0 6px,
    rgb(255, 196, 0) 0 0 14px,
    rgba(255, 196, 0, 0.5) 0 0 30px,
    rgba(255, 196, 0, 0.25) 0 0 60px;
}

.lb-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.lb-name {
  font-family: var(--vr-font-ui);
  font-size: 14px;
  color: var(--vr-cream);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lb-you {
  color: rgb(255, 47, 135);
  margin-left: 6px;
  font-size: 10px;
  font-family: var(--vr-font-ui);
  flex-shrink: 0;
}

.lb-score {
  font-family: var(--vr-font-ui);
  font-size: 16px;
  color: var(--vr-cream);
  letter-spacing: 0.5px;
  flex-shrink: 0;
}
.lb-pts {
  font-size: 10px;
  color: rgba(255, 245, 220, 0.667);
  margin-left: 2px;
}

/* ── Breakdown panel ───────────────────────────────────────────────────── */
.bd-panel {
  background: rgb(14, 4, 32);
  border: 2px solid rgb(58, 27, 92);
  border-radius: 20px;
  padding: 18px 20px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 70px;
}

.bd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.bd-title {
  font-family: var(--vr-font-ui);
  font-size: 16px;
  color: var(--vr-teal);
  letter-spacing: 2px;
}

.bd-chips {
  display: flex;
  gap: 6px;
}

.bd-chip {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: rgb(63, 208, 201);
  color: rgb(14, 4, 32);
  font-family: var(--vr-font-ui);
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: none;
  opacity: 0.55;
  transition: opacity 0.15s;
}
.bd-chip:hover { opacity: 0.8; }
.bd-chip-active { opacity: 1; }

/* ── Scrollable song list ──────────────────────────────────────────────── */
.bd-scroll {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

/* ── Song card ─────────────────────────────────────────────────────────── */
.song-card {
  padding: 14px;
  border-radius: 14px;
  background: rgb(24, 10, 46);
  border: 2px solid rgb(58, 27, 92);
  flex-shrink: 0;
}

.song-hdr {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 4px;
}

.song-title {
  font-family: var(--vr-font-ui);
  font-size: 20px;
  color: rgb(255, 224, 102);
  text-shadow:
    rgb(255, 224, 102) 0 0 6px,
    rgb(255, 196, 0) 0 0 14px,
    rgba(255, 196, 0, 0.5) 0 0 30px,
    rgba(255, 196, 0, 0.25) 0 0 60px;
  letter-spacing: 0.3px;
}

.song-artist {
  font-size: 12px;
  color: rgba(255, 245, 220, 0.667);
  font-style: italic;
}

/* Attribution row */
.song-attr {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: rgba(255, 245, 220, 0.667);
  margin-bottom: 12px;
}

.attr-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.attr-dot-orange { background: var(--vr-orange); }
.attr-dot-gold   { background: var(--vr-gold); }

.attr-text { color: rgba(255, 245, 220, 0.667); }
.attr-name { color: var(--vr-cream); }
.attr-arrow { color: rgba(255, 245, 220, 0.267); }

/* Guess list */
.guess-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.guess-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 8px;
  background: transparent;
}
.guess-row-you {
  background: rgba(255, 47, 135, 0.07);
}

/* Guess avatar */
.guess-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid rgb(255, 245, 220);
  box-shadow:
    rgb(14, 4, 32) 0 0 0 2px,
    rgba(0, 0, 0, 0.45) 0 4px 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--vr-font-ui);
  font-size: 9px;
  color: rgb(14, 4, 32);
  flex-shrink: 0;
}

/* Guess info */
.guess-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.guess-nameline {
  font-size: 12px;
  color: rgb(255, 245, 220);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
}

.guess-player { overflow: hidden; text-overflow: ellipsis; }

.guess-you {
  color: rgb(255, 47, 135);
  margin-left: 4px;
  font-size: 10px;
  flex-shrink: 0;
}

.guess-exact {
  font-family: var(--vr-font-ui);
  font-size: 9px;
  color: rgb(255, 224, 102);
  background: rgba(255, 224, 102, 0.133);
  border: 1.5px solid rgba(255, 224, 102, 0.4);
  padding: 2px 6px;
  border-radius: 999px;
  letter-spacing: 1px;
  margin-left: 4px;
  flex-shrink: 0;
}

.guess-text {
  font-size: 10px;
  color: rgba(255, 245, 220, 0.533);
}

/* Guess score */
.guess-score {
  font-family: var(--vr-font-ui);
  font-size: 14px;
  min-width: 40px;
  text-align: right;
  flex-shrink: 0;
}
.gs-teal   { color: rgb(63, 208, 201); }
.gs-orange { color: rgb(255, 107, 74); }
</style>
