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

async function fetchRoom() {
  try {
    const res = await fetch(`/api/rooms/${roomCode}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'fail');
    players.value = data.players || [];
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
    songMap.value = data.assignments || {};
    integrateRound(data);
    if (!mySong.value) await fetchAssignedSong();
  } catch {
    // Silently fail
  }
}

function registerEvents() {
  handlers.originalUploaded = (payload) => {
    console.log('ORIGINAL_UPLOADED', payload);
    if (payload.roundId !== roundId.value) return;
    statuses.value[payload.playerId] = 'original_uploaded';
    progress.uploaded = payload.uploadedCount;
    progress.total = payload.totalPlayers;
  };

  handlers.gameStarted = (payload) => {
    console.log('GAME_STARTED', payload);
    phase.value = payload.phase || 'originals_recording';
    roundId.value = payload.roundId;
    fetchRound();
  };

  // handlers.songsAssigned = (payload) => {
  //   console.log('SONGS_ASSIGNED', payload);
  //   if (payload.songId && !mySong.value) fetchAssignedSong();
  // };

  handlers.reversedRecordingStarted = (payload) => {
    console.log('REVERSED_RECORDING_STARTED', payload);
    if (payload.roundId !== roundId.value) return;
    reverseMap.value = payload.reverseMap || {};
    phase.value = 'reversed_recording';
  };

  handlers.reverseRecordingUploaded = (payload) => {
    console.log('REVERSE_RECORDING_UPLOADED', payload);
    if (payload.roundId !== roundId.value) return;
    progress.uploaded = payload.uploadedCount;
    progress.total = payload.totalPlayers;
  };

  handlers.finalAudioReady = (payload) => {
    console.log('FINAL_AUDIO_READY', payload);
    if (payload.roundId !== roundId.value) return;
    phase.value = payload.phase || 'guessing';
  };

  handlers.roomUpdated = (state) => {
    console.log('ROOM_UPDATED', state);
    players.value = state.players || [];
  };

  socket.value?.on?.(events.ORIGINAL_UPLOADED, handlers.originalUploaded);
  socket.value?.on?.(events.GAME_STARTED, handlers.gameStarted);
  // socket.value?.on?.(events.SONGS_ASSIGNED, handlers.songsAssigned);
  socket.value?.on?.(events.REVERSED_RECORDING_STARTED, handlers.reversedRecordingStarted);
  socket.value?.on?.(events.REVERSE_RECORDING_UPLOADED, handlers.reverseRecordingUploaded);
  socket.value?.on?.(events.FINAL_AUDIO_READY, handlers.finalAudioReady);
  socket.value?.on?.(events.ROOM_UPDATED, handlers.roomUpdated);
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
    socket.value.off(events.FINAL_AUDIO_READY, handlers.finalAudioReady);
    socket.value.off(events.ROOM_UPDATED, handlers.roomUpdated);
  }
});
</script>
<style scoped>
</style>
