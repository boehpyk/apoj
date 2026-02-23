<template>
  <div class="max-w-2xl mx-auto p-6 bg-white rounded shadow space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold">Room {{ roomCode }}</h2>
      <button @click="copyCode" class="text-sm px-2 py-1 border rounded">Copy Code</button>
    </div>
    <div v-if="loading" class="text-sm">Loading room...</div>
    <div v-else-if="error" class="text-sm text-red-600">{{ error }}</div>
    <div v-else>
      <h3 class="font-medium">Players ({{ players.length }})</h3>
      <ul class="list-disc ml-5 space-y-1">
        <li v-for="p in players" :key="p.id" :class="{'font-semibold': p.id === hostId}">{{ p.name }}<span v-if="p.id===hostId" class="text-xs text-gray-500"> (host)</span></li>
      </ul>
      <div class="pt-4" v-if="isHost">
        <button @click="startGame" :disabled="players.length < 2 || starting" class="px-4 py-2 rounded text-white"
                :class="players.length < 2 || starting ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'">
          {{ starting ? 'Starting...' : 'Start Game' }}
        </button>
        <p class="text-xs text-gray-500 mt-1">Requires ≥2 players (≥3 recommended). Only host can start.</p>
      </div>
      <div class="pt-4" v-else>
        <p class="text-xs text-gray-500">Waiting for host to start the game (needs ≥3 players).</p>
      </div>
    </div>
    <div class="text-xs text-gray-400">Connection: {{ socketStatus }} · Player ID: {{ playerId }}</div>
  </div>
</template>
<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSocket } from '../composables/useSocket.js';

const route = useRoute();
const router = useRouter();
const roomCode = route.params.code;
const playerId = sessionStorage.getItem('playerId');
const playerToken = sessionStorage.getItem('playerToken');

const loading = ref(true);
const error = ref(null);
const players = ref([]);
const hostId = ref(null);
const starting = ref(false);
const isHost = computed(() => hostId.value && playerId === hostId.value);
const { socket, connected, events, off } = useSocket(roomCode, playerId);
const socketStatus = computed(() => connected.value ? 'ws ok' : 'ws...');

// Store handler references for cleanup
const handlers = {};

async function fetchState(){
  try {
    const res = await fetch(`/api/rooms/${roomCode}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    players.value = data.players || [];
    hostId.value = data.hostId;
    error.value = null;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function copyCode(){
  navigator.clipboard.writeText(roomCode).catch(()=>{});
}

function startGame(){
  if (players.value.length < 2){
    return;
  }

  if (!isHost.value){
    return;
  }

  starting.value = true;
  fetch(`/api/rooms/${roomCode}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-player-token': playerToken
    }
  }).then(r => r.json()).then(data => {
    if (data.error) {
      console.warn('[room] start error', data.error);
    }
  }).catch(err => console.error(err)).finally(() => {
    starting.value = false;
  });
}

function applyRoomState(state){
  if (!state) return;
  players.value = state.players || [];
  hostId.value = state.hostId;
}

onMounted(() => {
  if (!playerId) {
    router.replace('/');
    return;
  }
  fetchState();

  // Socket events - store references for cleanup
  handlers.roomUpdated = (state) => {
    applyRoomState(state);
  };
  handlers.playerJoined = () => {
    // Will get full state shortly via ROOM_UPDATED
  };
  handlers.playerLeft = () => {
    // Could trigger state refresh later
  };
  handlers.gameStarted = (payload) => {
    router.push(`/game/${roomCode}`);
  };

  socket.value?.on?.(events.ROOM_UPDATED, handlers.roomUpdated);
  socket.value?.on?.(events.PLAYER_JOINED, handlers.playerJoined);
  socket.value?.on?.(events.PLAYER_LEFT, handlers.playerLeft);
  socket.value?.on?.(events.GAME_STARTED, handlers.gameStarted);
});

onBeforeUnmount(() => {
  // Clean up event listeners to prevent memory leaks
  if (socket.value) {
    socket.value.off(events.ROOM_UPDATED, handlers.roomUpdated);
    socket.value.off(events.PLAYER_JOINED, handlers.playerJoined);
    socket.value.off(events.PLAYER_LEFT, handlers.playerLeft);
    socket.value.off(events.GAME_STARTED, handlers.gameStarted);
  }
});
</script>
<style scoped>
</style>
