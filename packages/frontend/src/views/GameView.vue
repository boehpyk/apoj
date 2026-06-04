<template>
  <TheStage :hide-feedback="isJudging">
    <div class="game-root">

      <!-- ── Game Header ─────────────────────────────────────────────── -->
      <header class="game-header">
        <a href="/" class="header-brand">
          <svg viewBox="0 0 32 32" width="28" height="28" fill="none">
            <circle cx="16" cy="16" r="15" stroke="#FFE066" stroke-width="1.5" opacity="0.6"/>
            <circle cx="16" cy="16" r="9"  fill="#FF2F87" opacity="0.85"/>
            <circle cx="16" cy="16" r="3"  fill="#07020F"/>
            <circle cx="16" cy="16" r="13" fill="none" stroke="rgba(255,224,102,.3)" stroke-width="1"/>
            <circle cx="16" cy="16" r="11" fill="none" stroke="rgba(255,224,102,.2)" stroke-width="1"/>
          </svg>
          <span class="header-title">VERSE REVERSE</span>
        </a>
        <div class="header-right">
          <div class="phase-pill"
               :style="{
                 borderColor: pillAccent,
                 boxShadow: `rgb(24,10,46) 0 0 0 2px, ${pillGlow} 0 0 24px`,
               }">
            <span class="phase-pill-label" :style="{ background: pillAccent }">PHASE</span>
            <span class="phase-pill-name">{{ phaseLabel }}</span>
          </div>
          <div class="room-info">
            <span class="room-label">Room</span>
            <span class="room-code">{{ roomCode }}</span>
          </div>
        </div>
      </header>

      <!-- ── Phase content ──────────────────────────────────────────── -->
      <div class="game-body">

        <div v-if="loading" class="state-center">
          <span class="loading-text">Loading round…</span>
        </div>

        <div v-else-if="error" class="state-center">
          <span class="error-text">{{ error }}</span>
        </div>

        <template v-else>

          <!-- Original Recording -->
          <OriginalRecording
            v-if="phase === phases.ORIGINALS_RECORDING"
            :song="mySong"
            :round-id="roundId"
            :uploaded-count="progress.uploaded"
            :total-players="progress.total"
            :players="players"
            :statuses="statuses"
            :song-map="songMap"
            :player-id="playerId"
            @uploaded="handleOriginalUploaded"
          />

          <!-- Reverse Recording -->
          <ReverseRecording
            v-if="phase === phases.REVERSED_RECORDING"
            :round-id="roundId"
            :reverse-assignment="myReverseAssignment"
            :original-owner-name="myReverseAssignment ? nameById(myReverseAssignment) : ''"
            :uploaded-count="progress.uploaded"
            :total-players="progress.total"
            :players="players"
            :player-id="playerId"
            :reverse-map="reverseMap || {}"
            :reverse-statuses="reverseStatuses"
            @uploaded="handleReverseUploaded"
          />

          <!-- Guessing -->
          <GuessingPhase
            v-if="phase === phases.GUESSING"
            :round-id="roundId"
            :mode="gameMode"
            :is-host="isHost"
            :socket="socket"
            :submitted-count="progress.uploaded"
            :total-players="progress.total"
            :host-clue-index="guessingSync.clueIndex"
            :host-total-clues="guessingSync.totalClues"
            :host-audio-sync="guessingSync.audioSync"
            :submit-now="guessingSync.submitNow"
            :players="players"
            :player-id="playerId"
            @submitted="handleGuessSubmitted"
          />

          <!-- Scoring — Judge screen (waiting) or Score reveal (once scored) -->
          <template v-if="phase === phases.SCORES_FETCHING">
            <ScoreReveal
              v-if="liveScores && liveScores.length"
              :scores="liveScores"
              :my-player-id="playerId"
              :is-host="isHost"
              :round-id="roundId"
              :room-code="roomCode"
              :players="players"
              :reverse-map="reverseMap || {}"
            />
            <JudgePhase
              v-else
              :scores="liveScores || []"
            />
          </template>

          <!-- Round results -->
          <RoundResults
            v-if="phase === phases.ROUND_ENDED"
            :round-id="roundId"
            :room-code="roomCode"
            :is-host="false"
            @next-round="handleNextRound"
          />

        </template>
      </div>

    </div>
  </TheStage>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSocket } from '../composables/useSocket.js';
import TheStage from '../components/ui/TheStage.vue';
import OriginalRecording from '../components/game/OriginalRecording.vue';
import ReverseRecording from '../components/game/ReverseRecording.vue';
import GuessingPhase from '../components/game/GuessingPhase.vue';
import RoundResults from '../components/game/RoundResults.vue';
import ScoreReveal from '../components/game/ScoreReveal.vue';
import JudgePhase from '../components/game/JudgePhase.vue';
import { ROUND_PHASES } from 'shared/constants/index.js';

const route       = useRoute();
const router      = useRouter();
const roomCode    = route.params.code;
const playerId    = sessionStorage.getItem('playerId');
const playerToken = sessionStorage.getItem('playerToken');

const phase    = ref('originals_recording');
const players  = ref([]);
const songMap  = ref({});
const loading  = ref(true);
const error    = ref(null);
const roundId  = ref(null);
const mySong   = ref(null);
const statuses = ref({});
const progress = reactive({ uploaded: 0, total: 0 });
const reverseMap      = ref(null);
const reverseStatuses = ref({});   // { reverseSingerId: 'done' }
const liveScores      = ref(null);
const hostId      = ref(null);
const isHost      = computed(() => !!hostId.value && playerId === hostId.value);
const gameMode    = ref('private');

const guessingSync = reactive({
  clueIndex: 0,
  totalClues: 0,
  audioSync: null,
  submitNow: false,
});

const { socket, connected, events, phases } = useSocket(roomCode, playerId);

const PHASE_LABELS = {
  [ROUND_PHASES.ORIGINALS_RECORDING]:  'RECORD ORIGINAL',
  [ROUND_PHASES.REVERSED_RECORDING]:   'REVERSE',
  [ROUND_PHASES.GUESSING]:             'GUESSING',
  [ROUND_PHASES.SCORES_FETCHING]:      "JURY'S OUT",
  [ROUND_PHASES.ROUND_ENDED]:          'RESULTS',
};
// Phase pill accent: orange during judging, gold on results, pink otherwise
const isJudging  = computed(() => phase.value === ROUND_PHASES.SCORES_FETCHING && !(liveScores.value && liveScores.value.length));
const isResults  = computed(() => phase.value === ROUND_PHASES.SCORES_FETCHING &&  !!(liveScores.value && liveScores.value.length));

const phaseLabel = computed(() => {
  if (isResults.value) return 'THE NUMBERS';
  return PHASE_LABELS[phase.value] ?? phase.value.replace(/_/g, ' ');
});
const pillAccent = computed(() => {
  if (isJudging.value) return 'var(--vr-orange)';
  if (isResults.value) return 'var(--vr-gold)';
  return 'var(--vr-pink)';
});
const pillGlow = computed(() => {
  if (isJudging.value) return 'rgba(255,107,74,0.333)';
  if (isResults.value) return 'rgba(255,224,102,0.333)';
  return 'rgba(255,47,135,0.333)';
});

const handlers = {};

const myReverseAssignment = computed(() => {
  if (!reverseMap.value || !playerId) return null;
  for (const [orig, rev] of Object.entries(reverseMap.value)) {
    if (rev === playerId) return orig;
  }
  return null;
});

function nameById(id) {
  const p = players.value.find(x => x.id === id);
  return p ? p.name.slice(0, 20) : id.slice(0, 8);
}

function handleOriginalUploaded() {}
function handleReverseUploaded()  {}

function handleGuessSubmitted() {
  guessingSync.submitNow = false;
  progress.uploaded++;
}

async function triggerScoring() {
  try {
    const res = await fetch(`/api/rounds/${roundId.value}/score`, {
      method: 'POST',
      headers: { 'x-player-token': playerToken },
    });
    if (!res.ok) console.error('Failed to trigger scoring');
  } catch (e) {
    console.error('Error triggering scoring:', e);
  }
}

function handleNextRound() {
  console.log('Start next round');
}

async function fetchRoom() {
  try {
    const res  = await fetch(`/api/rooms/${roomCode}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'fail');
    players.value = data.players || [];
    hostId.value  = data.hostId  || null;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function fetchAssignedSong() {
  if (!roundId.value || !playerToken) return;
  try {
    const res = await fetch(`/api/rounds/${roundId.value}/song`, {
      headers: { 'x-player-token': playerToken },
    });
    if (!res.ok) return;
    mySong.value = await res.json();
  } catch {
    // silent
  }
}

function integrateRound(round) {
  if (!round) return;
  if (round.roundId)  roundId.value  = round.roundId;
  if (round.statuses) statuses.value = round.statuses;
  progress.total    = Object.keys(round.assignments || {}).length;
  progress.uploaded = Object.values(statuses.value).filter(s => s === events.ORIGINAL_UPLOADED).length;
}

async function fetchRound() {
  try {
    const res = await fetch(`/api/rooms/${roomCode}/round`);
    if (res.status === 404) return;
    const data = await res.json();
    if (!res.ok) return;
    phase.value = data.phase || phase.value;
    if (phase.value === ROUND_PHASES.ROUND_ENDED) {
      router.replace(`/room/${roomCode}`);
      return;
    }
    gameMode.value = data.mode || gameMode.value;
    songMap.value  = data.assignments || {};
    integrateRound(data);
    if (!mySong.value) await fetchAssignedSong();
  } catch {
    // silent
  }
}

function registerEvents() {
  handlers.originalUploaded = (payload) => {
    if (payload.roundId !== roundId.value) return;
    statuses.value[payload.playerId] = 'original_uploaded';
    progress.uploaded = payload.uploadedCount;
    progress.total    = payload.totalPlayers;
  };

  handlers.gameStarted = (payload) => {
    phase.value    = payload.phase || 'originals_recording';
    roundId.value  = payload.roundId;
    gameMode.value = payload.mode || 'private';
    fetchRound();
  };

  handlers.reversedRecordingStarted = (payload) => {
    if (payload.roundId !== roundId.value) return;
    reverseMap.value = payload.reverseMap || {};
    phase.value      = 'reversed_recording';
  };

  handlers.reverseRecordingUploaded = (payload) => {
    if (payload.roundId !== roundId.value) return;
    if (payload.playerId) reverseStatuses.value[payload.playerId] = 'done';
    progress.uploaded = payload.uploadedCount;
    progress.total    = payload.totalPlayers;
  };

  handlers.guessingStarted = (payload) => {
    if (payload.roundId !== roundId.value) return;
    phase.value       = ROUND_PHASES.GUESSING;
    progress.uploaded = payload.submittedCount || 0;
    progress.total    = payload.totalPlayers   || 0;
  };

  handlers.guessSubmitted = (payload) => {
    if (payload.roundId !== roundId.value) return;
    progress.uploaded = payload.submittedCount || 0;
    progress.total    = payload.totalPlayers   || 0;
  };

  handlers.guessingEnded = (payload) => {
    if (payload.roundId !== roundId.value) return;
    phase.value = ROUND_PHASES.SCORES_FETCHING;
    triggerScoring();
  };

  handlers.hostSongChanged = (payload) => {
    if (payload.roundId !== roundId.value) return;
    guessingSync.clueIndex  = payload.clueIndex;
    guessingSync.totalClues = payload.totalClues;
  };

  handlers.hostAudioSync = (payload) => {
    if (payload.roundId !== roundId.value) return;
    guessingSync.audioSync = { ...payload };
  };

  handlers.guessingSubmitNow = (payload) => {
    if (payload.roundId !== roundId.value) return;
    guessingSync.submitNow = true;
  };

  handlers.scoresFetched = (payload) => {
    if (payload.roundId !== roundId.value) return;
    if (liveScores.value && liveScores.value.length > 0) return;
    liveScores.value = payload.scores || [];
    phase.value      = ROUND_PHASES.SCORES_FETCHING;
  };

  handlers.roundPhaseChanged = (payload) => {
    if (payload.roundId !== roundId.value) return;
    if (payload.phase === ROUND_PHASES.ROUND_ENDED) {
      router.push(`/room/${roomCode}`);
    } else {
      phase.value = payload.phase;
    }
  };

  handlers.roomUpdated = (state) => {
    players.value = state.players || [];
  };

  socket.value?.on?.(events.ORIGINAL_UPLOADED,          handlers.originalUploaded);
  socket.value?.on?.(events.GAME_STARTED,               handlers.gameStarted);
  socket.value?.on?.(events.REVERSED_RECORDING_STARTED, handlers.reversedRecordingStarted);
  socket.value?.on?.(events.REVERSE_RECORDING_UPLOADED, handlers.reverseRecordingUploaded);
  socket.value?.on?.(events.GUESSING_STARTED,           handlers.guessingStarted);
  socket.value?.on?.(events.GUESS_SUBMITTED,            handlers.guessSubmitted);
  socket.value?.on?.(events.GUESSING_ENDED,             handlers.guessingEnded);
  socket.value?.on?.(events.SCORES_FETCHING_ENDED,      handlers.scoresFetched);
  socket.value?.on?.(events.ROUND_PHASE_CHANGED,        handlers.roundPhaseChanged);
  socket.value?.on?.(events.ROOM_UPDATED,               handlers.roomUpdated);
  socket.value?.on?.(events.HOST_SONG_CHANGED,          handlers.hostSongChanged);
  socket.value?.on?.(events.HOST_AUDIO_SYNC,            handlers.hostAudioSync);
  socket.value?.on?.(events.GUESSING_SUBMIT_NOW,        handlers.guessingSubmitNow);
}

onMounted(() => {
  if (!playerId) { router.replace('/'); return; }
  fetchRoom();
  fetchRound();
  registerEvents();
});

onBeforeUnmount(() => {
  if (!socket.value) return;
  socket.value.off(events.ORIGINAL_UPLOADED,          handlers.originalUploaded);
  socket.value.off(events.GAME_STARTED,               handlers.gameStarted);
  socket.value.off(events.REVERSED_RECORDING_STARTED, handlers.reversedRecordingStarted);
  socket.value.off(events.REVERSE_RECORDING_UPLOADED, handlers.reverseRecordingUploaded);
  socket.value.off(events.GUESSING_STARTED,           handlers.guessingStarted);
  socket.value.off(events.GUESS_SUBMITTED,            handlers.guessSubmitted);
  socket.value.off(events.GUESSING_ENDED,             handlers.guessingEnded);
  socket.value.off(events.SCORES_FETCHING_ENDED,      handlers.scoresFetched);
  socket.value.off(events.ROUND_PHASE_CHANGED,        handlers.roundPhaseChanged);
  socket.value.off(events.ROOM_UPDATED,               handlers.roomUpdated);
  socket.value.off(events.HOST_SONG_CHANGED,          handlers.hostSongChanged);
  socket.value.off(events.HOST_AUDIO_SYNC,            handlers.hostAudioSync);
  socket.value.off(events.GUESSING_SUBMIT_NOW,        handlers.guessingSubmitNow);
});
</script>

<style scoped>
.game-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* ── Header ─────────────────────────────────────────────────────────── */
.game-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 32px;
  border-bottom: 2px solid rgb(58, 27, 92);
  background: linear-gradient(rgb(14, 4, 32), rgb(24, 10, 46));
  position: relative;
  z-index: 2;
  flex-shrink: 0;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  cursor: pointer;
}

.header-title {
  font-family: Monoton, "Bowlby One SC", Impact, sans-serif;
  font-size: 22px;
  color: var(--vr-gold);
  text-shadow: var(--vr-gold) 0 0 4px, #FFC400 0 0 14px, #FF8A00 0 0 28px, rgba(255, 196, 0, 0.55) 0 0 60px;
  letter-spacing: 2px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 18px;
}

/* phase pill */
.phase-pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px 8px 8px;
  border-radius: 999px;
  background: rgb(14, 4, 32);
  border: 2px solid var(--vr-pink);
  box-shadow: rgb(24, 10, 46) 0 0 0 2px, rgba(255, 47, 135, 0.333) 0 0 24px;
}

.phase-pill-label {
  font-family: "Bowlby One SC", Impact, sans-serif;
  font-size: 13px;
  padding: 4px 9px;
  background: var(--vr-pink);
  color: rgb(14, 4, 32);
  border-radius: 999px;
  letter-spacing: 1px;
}

.phase-pill-name {
  font-family: "Bowlby One SC", Impact, sans-serif;
  font-size: 13px;
  color: var(--vr-cream);
  letter-spacing: 1.6px;
}

.room-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.room-label {
  font-family: "Space Grotesk", sans-serif;
  font-size: 12px;
  color: rgba(255, 245, 220, 0.667);
  text-transform: uppercase;
  letter-spacing: 2px;
}

.room-code {
  font-family: "JetBrains Mono", monospace;
  font-weight: 700;
  font-size: 16px;
  padding: 5px 12px;
  background: rgb(14, 4, 32);
  border: 2px solid var(--vr-gold);
  border-radius: 8px;
  color: var(--vr-gold);
  letter-spacing: 3px;
}

/* ── Body ───────────────────────────────────────────────────────────── */
.game-body {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
  position: relative;
}


/* center states */
.state-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.loading-text {
  font-family: "JetBrains Mono", monospace;
  font-size: 18px;
  color: rgba(255, 245, 220, 0.6);
  animation: vr-pulse 2s ease infinite;
}

.error-text {
  font-family: "JetBrains Mono", monospace;
  font-size: 14px;
  color: var(--vr-pink);
}

.spin-icon {
  width: 48px;
  height: 48px;
  color: var(--vr-pink);
  animation: vr-spin 1s linear infinite;
}

.spin-track { opacity: 0.25; }

.asking-ai {
  font-family: "Bowlby One SC", Impact, sans-serif;
  font-size: 20px;
  color: var(--vr-cream);
  margin: 0;
}

.asking-ai-sub {
  font-size: 13px;
  color: rgba(255, 245, 220, 0.6);
  margin: 0;
}
</style>
