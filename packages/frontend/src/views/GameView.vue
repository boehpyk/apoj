<template>
  <div class="max-w-3xl mx-auto p-6 bg-white rounded shadow space-y-4">
    <h2 class="text-xl font-semibold">Game - Room {{ roomCode }}</h2>
    <div class="text-sm text-gray-600">Phase: {{ phase }}</div>

    <div v-if="loading" class="text-sm">Loading round...</div>
    <div v-else-if="error" class="text-sm text-red-600">{{ error }}</div>
    <div v-else>
      <!-- Original Recording Phase -->
      <OriginalRecording
        v-if="phase === phases.ORIGINALS_RECORDING"
        :song="mySong"
        :round-id="roundId"
        :uploaded-count="progress.uploaded"
        :total-players="progress.total"
        @uploaded="handleOriginalUploaded"
      />

      <!-- Reverse Recording Phase -->
      <ReverseRecording
        v-if="phase === phases.REVERSED_RECORDING"
        :round-id="roundId"
        :reverse-assignment="myReverseAssignment"
        :original-owner-name="myReverseAssignment ? nameById(myReverseAssignment) : ''"
        :uploaded-count="progress.uploaded"
        :total-players="progress.total"
        @uploaded="handleReverseUploaded"
      />

      <!-- Guessing Phase -->
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
        @submitted="handleGuessSubmitted"
      />

      <!-- Scores Fetching Phase: show live scores immediately from socket payload -->
      <div v-if="phase === phases.SCORES_FETCHING">
        <ScoreReveal
          v-if="liveScores && liveScores.length"
          :scores="liveScores"
          :my-player-id="playerId"
          :is-host="isHost"
          :round-id="roundId"
        />
        <div v-else class="flex flex-col items-center gap-4 py-12 text-center">
          <svg class="animate-spin h-10 w-10 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
          </svg>
          <div>
            <p class="text-lg font-semibold text-gray-800">Asking the AI judge...</p>
            <p class="text-sm text-gray-500 mt-1">Hang tight while your guesses are being assessed</p>
          </div>
        </div>
      </div>

      <!-- Round Results Phase -->
      <RoundResults
        v-if="phase === phases.ROUND_ENDED"
        :round-id="roundId"
        :room-code="roomCode"
        :is-host="false"
        @next-round="handleNextRound"
      />

      <!-- Player list with status -->
      <h3 class="font-medium">Assignments</h3>
      <ul class="list-disc ml-5 space-y-1">
        <li v-for="p in players" :key="p.id">
          <span class="font-medium">{{ p.name }}</span>
          <span class="text-xs text-gray-500" v-if="p.id === playerId"> (you)</span>
          <span class="ml-2 text-xs px-2 py-0.5 rounded" :class="statusBadgeClass(p.id)">
            {{ statusText(p.id) }}
          </span>
          <span class="ml-2 text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700" v-if="songMap[p.id]">
            {{ p.id === playerId ? 'SongID: ' + songMap[p.id].slice(0, 8) : 'Assigned' }}
          </span>
        </li>
      </ul>

      <div v-if="reverseMap && Object.keys(reverseMap).length" class="mt-4 p-3 border rounded bg-indigo-50">
        <h4 class="text-sm font-semibold mb-1">Reverse Assignments</h4>
        <ul class="text-xs space-y-1">
          <li v-for="(rev, orig) in reverseMap" :key="orig">
            <span class="font-medium">Original by:</span> {{ nameById(orig) }} → <span class="font-medium">Reversed by:</span> {{ nameById(rev) }}
            <span v-if="rev === playerId" class="ml-2 text-green-700">(you will record reversed)</span>
          </li>
        </ul>
      </div>
    </div>
    <div class="text-xs text-gray-400">Player ID: {{ playerId }} · Connection: {{ socketStatus }}</div>
    <button class="text-xs underline" @click="toLobby">Back to Lobby</button>
  </div>
</template>
<script setup>
import { ref, onMounted, onBeforeUnmount, computed, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSocket } from '../composables/useSocket.js';
import OriginalRecording from '../components/game/OriginalRecording.vue';
import ReverseRecording from '../components/game/ReverseRecording.vue';
import GuessingPhase from '../components/game/GuessingPhase.vue';
import RoundResults from '../components/game/RoundResults.vue';
import ScoreReveal from '../components/game/ScoreReveal.vue';
import {ROUND_PHASES} from "shared/constants/index.js";

const route = useRoute();
const router = useRouter();
const roomCode = route.params.code;
const playerId = sessionStorage.getItem('playerId');
const playerToken = sessionStorage.getItem('playerToken');

const phase = ref('originals_recording');
const players = ref([]);
const songMap = ref({});
const loading = ref(true);
const error = ref(null);
const roundId = ref(null);
const mySong = ref(null);
const statuses = ref({});
const progress = reactive({ uploaded: 0, total: 0 });
const reverseMap = ref(null);
const liveScores = ref(null);
const hostId = ref(null);
const isHost = computed(() => !!hostId.value && playerId === hostId.value);
const gameMode = ref('private');

// State bridge for the guessing phase (public mode only)
const guessingSync = reactive({
  clueIndex: 0,
  totalClues: 0,
  audioSync: null,
  submitNow: false,
});

const { socket, connected, events, phases } = useSocket(roomCode, playerId);
const socketStatus = computed(() => connected.value ? 'ws ok' : 'ws...');

// Store handler references for cleanup
const handlers = {};

const myReverseAssignment = computed(() => {
  if (!reverseMap.value || !playerId) return null;
  for (const [originalOwner, reversePlayer] of Object.entries(reverseMap.value)) {
    if (reversePlayer === playerId) return originalOwner;
  }
  return null;
});

function toLobby() {
  router.push(`/room/${roomCode}`);
}

function nameById(id) {
  const p = players.value.find(x => x.id === id);
  return p ? p.name.slice(0, 20) : id.slice(0, 8);
}

function statusText(pid) {
  const st = statuses.value[pid];
  if (st === 'original_uploaded') return 'Uploaded';
  return 'Pending';
}

function statusBadgeClass(pid) {
  const st = statuses.value[pid];
  return st === 'original_uploaded' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700';
}

function handleOriginalUploaded() {
  console.log('Original recording uploaded');
}

function handleReverseUploaded() {
  console.log('Reverse recording uploaded');
}

function handleGuessSubmitted() {
  guessingSync.submitNow = false;
  progress.uploaded++;
}

async function triggerScoring() {
  try {
    const playerToken = sessionStorage.getItem('playerToken');
    const res = await fetch(`/api/rounds/${roundId.value}/score`, {
      method: 'POST',
      headers: {
        'x-player-token': playerToken
      }
    });

    if (!res.ok) {
      console.error('Failed to trigger scoring');
    }
  } catch (e) {
    console.error('Error triggering scoring:', e);
  }
}

function handleNextRound() {
  // TODO: Implement next round logic
  console.log('Start next round');
}

async function fetchRoom() {
  try {
    const res = await fetch(`/api/rooms/${roomCode}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'fail');
    players.value = data.players || [];
    hostId.value = data.hostId || null;
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
      headers: { 'x-player-token': playerToken }
    });
    if (!res.ok) return;
    mySong.value = await res.json();
  } catch {
    // Silently fail
  }
}

function integrateRound(round) {
  if (!round) {
    return;
  }

  if (round.roundId) {
    roundId.value = round.roundId;
  }
  if (round.statuses){
    statuses.value = round.statuses;
  }
  progress.total = Object.keys(round.assignments || {}).length;
  progress.uploaded = Object.values(statuses.value).filter(s => s === events.ORIGINAL_UPLOADED).length;
}

/**
 * Fetch the current round state from the server and assign songs if needed.
 * @returns {Promise<void>}
 */
async function fetchRound() {
  try {
    const res = await fetch(`/api/rooms/${roomCode}/round`);
    if (res.status === 404){
      return;
    }

    const data = await res.json();
    if (!res.ok){
      return;
    }

    phase.value = data.phase || phase.value;
    gameMode.value = data.mode || gameMode.value;
    songMap.value = data.assignments || {};
    integrateRound(data);
    if (!mySong.value) await fetchAssignedSong();
  } catch {
    // Silently fail
  }
}

function registerEvents() {
  handlers.originalUploaded = (payload) => {
    if (payload.roundId !== roundId.value) return;
    statuses.value[payload.playerId] = 'original_uploaded';
    progress.uploaded = payload.uploadedCount;
    progress.total = payload.totalPlayers;
  };

  handlers.gameStarted = (payload) => {
    phase.value = payload.phase || 'originals_recording';
    roundId.value = payload.roundId;
    gameMode.value = payload.mode || 'private';
    fetchRound();
  };

  // handlers.songsAssigned = (payload) => {
  //   console.log('SONGS_ASSIGNED', payload);
  //   if (payload.songId && !mySong.value) fetchAssignedSong();
  // };

  handlers.reversedRecordingStarted = (payload) => {
    if (payload.roundId !== roundId.value) return;
    reverseMap.value = payload.reverseMap || {};
    phase.value = 'reversed_recording';
  };

  handlers.reverseRecordingUploaded = (payload) => {
    if (payload.roundId !== roundId.value) return;
    progress.uploaded = payload.uploadedCount;
    progress.total = payload.totalPlayers;
  };

  handlers.guessingStarted = (payload) => {
    console.log('GUESSING_STARTED', payload);
    if (payload.roundId !== roundId.value) return;
    phase.value = ROUND_PHASES.GUESSING;
    progress.uploaded = payload.submittedCount || 0;
    progress.total = payload.totalPlayers || 0;
  };

  handlers.guessSubmitted = (payload) => {
    console.log('GUESS_SUBMITTED', payload);
    if (payload.roundId !== roundId.value) return;
    progress.uploaded = payload.submittedCount || 0;
    progress.total = payload.totalPlayers || 0;
  };

  handlers.guessingEnded = (payload) => {
    console.log('GUESSING_ENDED', payload);
    if (payload.roundId !== roundId.value) return;
    phase.value = ROUND_PHASES.SCORES_FETCHING;
    triggerScoring();
  };

  handlers.hostSongChanged = (payload) => {
    if (payload.roundId !== roundId.value) return;
    guessingSync.clueIndex = payload.clueIndex;
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
    console.log('SCORES_FETCHING_ENDED', payload);
    if (payload.roundId !== roundId.value) return;
    if (liveScores.value && liveScores.value.length > 0) return; // Already processed — ignore duplicates
    liveScores.value = payload.scores || [];
    phase.value = ROUND_PHASES.SCORES_FETCHING;
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

  socket.value?.on?.(events.ORIGINAL_UPLOADED, handlers.originalUploaded);
  socket.value?.on?.(events.GAME_STARTED, handlers.gameStarted);
  // socket.value?.on?.(events.SONGS_ASSIGNED, handlers.songsAssigned);
  socket.value?.on?.(events.REVERSED_RECORDING_STARTED, handlers.reversedRecordingStarted);
  socket.value?.on?.(events.REVERSE_RECORDING_UPLOADED, handlers.reverseRecordingUploaded);
  socket.value?.on?.(events.GUESSING_STARTED, handlers.guessingStarted);
  socket.value?.on?.(events.GUESS_SUBMITTED, handlers.guessSubmitted);
  socket.value?.on?.(events.GUESSING_ENDED, handlers.guessingEnded);
  socket.value?.on?.(events.SCORES_FETCHING_ENDED, handlers.scoresFetched);
  socket.value?.on?.(events.ROUND_PHASE_CHANGED, handlers.roundPhaseChanged);
  socket.value?.on?.(events.ROOM_UPDATED, handlers.roomUpdated);
  socket.value?.on?.(events.HOST_SONG_CHANGED, handlers.hostSongChanged);
  socket.value?.on?.(events.HOST_AUDIO_SYNC, handlers.hostAudioSync);
  socket.value?.on?.(events.GUESSING_SUBMIT_NOW, handlers.guessingSubmitNow);
}

onMounted(() => {
  console.log('GameView mounted', { playerId, roomCode });
  if (!playerId) {
    router.replace('/');
    return;
  }
  fetchRoom();
  registerEvents();
});

onBeforeUnmount(() => {
  // Clean up event listeners to prevent memory leaks
  if (socket.value) {
    socket.value.off(events.ORIGINAL_UPLOADED, handlers.originalUploaded);
    socket.value.off(events.GAME_STARTED, handlers.gameStarted);
    // socket.value.off(events.SONGS_ASSIGNED, handlers.songsAssigned);
    socket.value.off(events.REVERSED_RECORDING_STARTED, handlers.reversedRecordingStarted);
    socket.value.off(events.REVERSE_RECORDING_UPLOADED, handlers.reverseRecordingUploaded);
    socket.value.off(events.GUESSING_STARTED, handlers.guessingStarted);
    socket.value.off(events.GUESS_SUBMITTED, handlers.guessSubmitted);
    socket.value.off(events.GUESSING_ENDED, handlers.guessingEnded);
    socket.value.off(events.SCORES_FETCHING_ENDED, handlers.scoresFetched);
    socket.value.off(events.ROUND_PHASE_CHANGED, handlers.roundPhaseChanged);
    socket.value.off(events.ROOM_UPDATED, handlers.roomUpdated);
    socket.value.off(events.HOST_SONG_CHANGED, handlers.hostSongChanged);
    socket.value.off(events.HOST_AUDIO_SYNC, handlers.hostAudioSync);
    socket.value.off(events.GUESSING_SUBMIT_NOW, handlers.guessingSubmitNow);
  }
});
</script>
<style scoped>
</style>
