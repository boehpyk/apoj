<template>
  <div class="max-w-2xl mx-auto p-6 bg-white rounded shadow space-y-4">

    <!-- Loading -->
    <div v-if="viewMode === 'loading'" class="text-sm">Loading room...</div>

    <!-- Guest join form -->
    <div v-else-if="viewMode === 'join'" class="space-y-4">
      <h2 class="text-xl font-semibold">Join Room {{ roomCode }}</h2>
      <input v-model="joinName" placeholder="Your name" maxlength="30"
             class="w-full border rounded px-3 py-2 text-sm" @keyup.enter="joinRoom" />
      <p v-if="joinError" class="text-sm text-red-600">{{ joinError }}</p>
      <button @click="joinRoom" :disabled="joinName.length < 3 || joining"
              class="px-4 py-2 rounded text-white"
              :class="joinName.length < 3 || joining ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'">
        {{ joining ? 'Joining...' : 'Join Game' }}
      </button>
    </div>

    <!-- Unavailable -->
    <div v-else-if="viewMode === 'unavailable'" class="space-y-3">
      <h2 class="text-xl font-semibold">Room Unavailable</h2>
      <p class="text-sm text-gray-600">This room is not available to join. The game may have already started or the room does not exist.</p>
      <router-link to="/" class="text-sm text-indigo-600 hover:underline">Go Home</router-link>
    </div>

    <!-- Normal room view (authenticated player) -->
    <div v-else-if="viewMode === 'room'" class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">Room {{ roomCode }}</h2>
        <button @click="copyCode" class="text-sm px-2 py-1 border rounded">Copy Room Link</button>
      </div>
      <div v-if="error" class="text-sm text-red-600">{{ error }}</div>
      <div v-else>
        <h3 class="font-medium">Players ({{ players.length }})</h3>
        <ul class="list-disc ml-5 space-y-1">
          <li v-for="p in players" :key="p.id" :class="{'font-semibold': p.id === hostId}">{{ p.name }}<span v-if="p.id===hostId" class="text-xs text-gray-500"> (host)</span></li>
        </ul>
        <div class="pt-4" v-if="isHost">
          <div class="mb-3 space-y-1">
            <p class="text-sm font-medium text-gray-700">Guessing mode</p>
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" v-model="gameMode" value="public" />
              <span><span class="font-medium">Party Mode</span> — host controls playback on shared screen</span>
            </label>
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" v-model="gameMode" value="private" />
              <span><span class="font-medium">Classic</span> — everyone guesses privately with a timer</span>
            </label>
          </div>
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

const viewMode = ref('loading'); // 'loading' | 'join' | 'unavailable' | 'room'
const joinName = ref('');
const joining = ref(false);
const joinError = ref(null);
const error = ref(null);
const players = ref([]);
const hostId = ref(null);
const roomStatus = ref(null);
const starting = ref(false);
const gameMode = ref('public');
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
    roomStatus.value = data.status;
    error.value = null;
    return data;
  } catch (e) {
    error.value = e.message;
    return null;
  }
}

function copyCode(){
  navigator.clipboard.writeText(window.location.href).catch(()=>{});
}

async function joinRoom() {
  joining.value = true;
  joinError.value = null;
  try {
    const res = await fetch(`/api/rooms/${roomCode}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName: joinName.value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to join');
    sessionStorage.setItem('playerId', data.playerId);
    sessionStorage.setItem('playerToken', data.playerToken);
    sessionStorage.setItem('roomCode', data.roomCode);
    window.location.reload();
  } catch (e) {
    joinError.value = e.message;
  } finally {
    joining.value = false;
  }
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
      'x-player-token': playerToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ mode: gameMode.value })
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

onMounted(async () => {
  const data = await fetchState();

  if (!data) {
    viewMode.value = 'unavailable';
    return;
  }

  const isInRoom = playerId && (data.players || []).some(p => p.id === playerId);
  if (isInRoom) {
    viewMode.value = 'room';
  } else if (data.status === 'waiting') {
    viewMode.value = 'join';
  } else {
    viewMode.value = 'unavailable';
    return;
  }

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
