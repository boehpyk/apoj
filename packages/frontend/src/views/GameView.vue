<template>
  <div class="max-w-3xl mx-auto p-6 bg-white rounded shadow space-y-4">
    <h2 class="text-xl font-semibold">Game - Room {{ roomCode }}</h2>
    <div class="text-sm text-gray-600">Phase: {{ phase }}</div>
    <div v-if="loading" class="text-sm">Loading round...</div>
    <div v-else-if="error" class="text-sm text-red-600">{{ error }}</div>
    <div v-else>
      <div v-if="mySong" class="p-3 border rounded bg-gray-50 space-y-2">
        <h4 class="font-semibold text-sm">Your Song</h4>
        <p class="text-sm font-medium">{{ mySong.title }}</p>
        <div v-if="mySongBlobUrl" class="space-y-1">
          <audio :src="mySongBlobUrl" controls preload="none" class="w-full"></audio>
        </div>
        <div v-else-if="mySong && mySong.audioProxyUrl" class="text-xs text-gray-500">Loading audio...</div>
        <div v-else class="text-xs text-red-600">Audio file not available.</div>
        <pre class="text-xs whitespace-pre-wrap leading-snug max-h-64 overflow-auto">{{ mySong.lyrics }}</pre>
      </div>

      <div v-if="phase==='originals_recording'" class="space-y-2">
        <h4 class="font-medium text-sm">Original Recording</h4>
        <div class="flex items-center space-x-2">
          <button @click="onRecord" :disabled="isRecording || uploaded" class="px-3 py-1 rounded text-white"
                  :class="isRecording||uploaded? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'">
            {{ isRecording ? 'Recording...' : uploaded ? 'Uploaded' : 'Record' }}
          </button>
          <button v-if="isRecording" @click="onStop" class="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700">
            Stop
          </button>
          <button v-if="recordBlob && !uploaded" @click="onUpload" :disabled="uploading"
                  class="px-3 py-1 rounded text-white"
                  :class="uploading? 'bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'">
            {{ uploading ? 'Uploading...' : 'Upload' }}
          </button>
        </div>
        <p class="text-xs text-gray-500">Record a short clear vocal (10–30s). Then upload.</p>
        <audio v-if="recordBlob" :src="recordUrl" controls class="w-full"></audio>
      </div>

      <div class="text-sm" v-if="progress.total>0">Uploaded: {{ progress.uploaded }} / {{ progress.total }}</div>

      <!-- Reverse Recording Phase -->
      <div v-if="phase==='reversed_recording' && myReverseAssignment" class="space-y-3 p-3 border rounded bg-blue-50">
        <h4 class="font-medium text-sm">Reverse Recording Phase</h4>
        <p class="text-xs text-gray-600">You are assigned to reverse the recording of: <span class="font-semibold">{{ nameById(myReverseAssignment) }}</span></p>

        <!-- Play reversed original -->
        <div class="space-y-1">
          <p class="text-xs font-medium">Step 1: Listen to the reversed audio</p>
          <div v-if="myReverseAssignment">
            <button @click="playReversedOriginal" class="px-3 py-1 rounded bg-purple-600 text-white hover:bg-purple-700 text-sm mb-2">
              Play Reversed Audio
            </button>
            <audio ref="reversedAudioPlayer" controls class="w-full"></audio>
          </div>
          <p class="text-xs text-gray-500">Play this as many times as you need</p>
        </div>

        <!-- Record reverse -->
        <div class="space-y-2">
          <p class="text-xs font-medium">Step 2: Try to reproduce what you hear</p>
          <div class="flex items-center space-x-2 flex-wrap gap-2">
            <button @click="onReverseRecord" :disabled="isReverseRecording || reverseUploaded"
                    class="px-3 py-1 rounded text-white text-sm"
                    :class="isReverseRecording||reverseUploaded? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'">
              {{ isReverseRecording ? 'Recording...' : reverseUploaded ? 'Uploaded' : 'Start Recording' }}
            </button>

            <button v-if="isReverseRecording && !isReversePaused" @click="onReversePause"
                    class="px-3 py-1 rounded bg-yellow-600 text-white hover:bg-yellow-700 text-sm">
              Pause
            </button>

            <button v-if="isReverseRecording && isReversePaused" @click="onReverseResume"
                    class="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 text-sm">
              Resume
            </button>

            <button v-if="isReverseRecording" @click="onReverseStop"
                    class="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700 text-sm">
              Stop
            </button>

            <button v-if="reverseRecordBlob && !reverseUploaded" @click="onReverseUpload" :disabled="reverseUploading"
                    class="px-3 py-1 rounded text-white text-sm"
                    :class="reverseUploading? 'bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'">
              {{ reverseUploading ? 'Uploading...' : 'Upload' }}
            </button>
          </div>
          <p class="text-xs text-gray-500">You can pause and resume recording. Try to match the reversed audio!</p>
          <audio v-if="reverseRecordBlob" :src="reverseRecordUrl" controls class="w-full"></audio>
        </div>
      </div>

      <!-- Waiting for others during reverse recording -->
      <div v-if="phase==='reversed_recording' && !myReverseAssignment" class="p-3 border rounded bg-gray-50">
        <p class="text-sm text-gray-600">Waiting for reverse singers to complete their recordings...</p>
      </div>

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
import {ref, onMounted, computed, reactive} from 'vue';
import {useRoute, useRouter} from 'vue-router';
import {useSocket} from '../composables/useSocket.js';
import {useAudioRecorder} from '../composables/useAudioRecorder.js';

const route = useRoute();
const router = useRouter();
const roomCode = route.params.code;
const playerId = sessionStorage.getItem('playerId');

const phase = ref('originals_recording');
const players = ref([]);
const songMap = ref({}); // playerId -> songId
const loading = ref(true);
const error = ref(null);
const roundId = ref(null);
const mySong = ref(null);
const {isRecording, isPaused, start, stop, pause, resume} = useAudioRecorder();
const recordBlob = ref(null);
const recordUrl = ref('');
const uploading = ref(false);
const uploaded = ref(false);
const statuses = ref({});
const progress = reactive({uploaded: 0, total: 0});
const reverseMap = ref(null);

// Reverse recording state
const reverseRecordBlob = ref(null);
const reverseRecordUrl = ref('');
const reverseUploading = ref(false);
const reverseUploaded = ref(false);
const reversedOriginalUrl = ref('');
const reversedAudioPlayer = ref(null);
const {isRecording: isReverseRecording, isPaused: isReversePaused, start: startReverse, stop: stopReverse, pause: pauseReverse, resume: resumeReverse} = useAudioRecorder();

const {socket, connected, events} = useSocket(roomCode, playerId);
const socketStatus = computed(() => connected.value ? 'ws ok' : 'ws...');

// Check if current player is assigned to reverse any original
const myReverseAssignment = computed(() => {
  if (!reverseMap.value || !playerId) return null;
  for (const [originalOwner, reversePlayer] of Object.entries(reverseMap.value)) {
    if (reversePlayer === playerId) return originalOwner;
  }
  return null;
});

const registerEvents = () => {
  // Extend existing socket listeners
  socket.value?.on?.(events.ORIGINAL_UPLOADED, (payload) => {
    console.log('events.ORIGINAL_UPLOADED', payload);
    if (payload.roundId !== roundId.value) return;
    statuses.value[payload.playerId] = events.ORIGINAL_UPLOADED;
    progress.uploaded = payload.uploadedCount;
    progress.total = payload.totalPlayers;
  });
// Update GAME_STARTED handler to store roundId and fetch song
  socket.value?.on?.(events.GAME_STARTED, (payload) => {
    console.log('events.GAME_STARTED', payload);
    phase.value = payload.phase || 'originals_recording';
    roundId.value = payload.roundId;
    fetchRound();
    fetchAssignedSong();
  });

// SONGS_ASSIGNED update to trigger song fetch for self
  socket.value?.on?.(events.SONGS_ASSIGNED, (payload) => {
    console.log('events.SONGS_ASSIGNED', payload);
    if (payload.songId && !mySong.value) fetchAssignedSong();
  });

// Handle REVERSED_RECORDING_STARTED event
  socket.value?.on?.(events.REVERSED_RECORDING_STARTED, (payload) => {
    console.log('events.REVERSED_RECORDING_STARTED', payload);
    if (payload.roundId !== roundId.value) {
      return
    }

    reverseMap.value = payload.reverseMap || {};
    phase.value = 'reversed_recording';
    setTimeout(fetchReversedOriginal, 100);
  });

// Handle REVERSE_RECORDING_UPLOADED event
  socket.value?.on?.(events.REVERSE_RECORDING_UPLOADED, (payload) => {
    console.log('events.REVERSE_RECORDING_UPLOADED', payload);
    if (payload.roundId !== roundId.value) return;
    progress.uploaded = payload.uploadedCount;
    progress.total = payload.totalPlayers;
  });

// Handle FINAL_AUDIO_READY event
  socket.value?.on?.(events.FINAL_AUDIO_READY, (payload) => {
    console.log('events.FINAL_AUDIO_READY', payload);
    if (payload.roundId !== roundId.value) return;
    phase.value = payload.phase || 'guessing';
  });

  socket.value?.on?.(events.ROOM_UPDATED, (state) => {
    console.log('events.ROOM_UPDATED', state);
    players.value = state.players || [];
  });
}

function toLobby() {
  router.push(`/room/${roomCode}`);
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

const playerToken = sessionStorage.getItem('playerToken');
const mySongBlobUrl = ref('');

async function fetchAssignedSong() {
  if (!roundId.value || !playerToken) return;
  try {
    const res = await fetch(`/api/rounds/${roundId.value}/song`, {headers: {'x-player-token': playerToken}});
    if (!res.ok) return;
    mySong.value = await res.json();
    if (mySong.value.audioProxyUrl) {
      await fetchSongAudio(mySong.value.audioProxyUrl);
    }
  } catch {
  }
}

async function fetchSongAudio(url) {
  try {
    const res = await fetch(url, {headers: {'x-player-token': playerToken}});
    if (!res.ok) return;
    const blob = await res.blob();
    if (mySongBlobUrl.value) URL.revokeObjectURL(mySongBlobUrl.value);
    mySongBlobUrl.value = URL.createObjectURL(blob);
  } catch {
  }
}

async function onUpload() {
  if (!recordBlob.value || uploaded.value || !roundId.value || !playerToken) return;
  uploading.value = true;
  try {
    const form = new FormData();
    form.append('file', recordBlob.value, 'original.webm');
    const res = await fetch(`/api/rounds/${roundId.value}/original-recording`, {
      method: 'POST',
      headers: {'x-player-token': playerToken},
      body: form
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Upload failed');
    }
    uploaded.value = true;
  } catch (e) {
    console.warn(e.message);
  } finally {
    uploading.value = false;
  }
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

function onRecord() {
  start();
}

async function onStop() {
  recordBlob.value = await stop();
  recordUrl.value = URL.createObjectURL(recordBlob.value);
}

async function onReverseRecord() {
  await startReverse();
}

async function onReverseStop() {
  reverseRecordBlob.value = await stopReverse();
  reverseRecordUrl.value = URL.createObjectURL(reverseRecordBlob.value);
}

function onReversePause() {
  pauseReverse();
}

function onReverseResume() {
  resumeReverse();
}

async function onReverseUpload() {
  if (!reverseRecordBlob.value || reverseUploaded.value || !roundId.value || !playerToken) return;
  reverseUploading.value = true;
  try {
    const form = new FormData();
    form.append('file', reverseRecordBlob.value, 'reverse.webm');
    const res = await fetch(`/api/rounds/${roundId.value}/reverse-recording`, {
      method: 'POST',
      headers: {'x-player-token': playerToken},
      body: form
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    reverseUploaded.value = true;
  } catch (e) {
    console.warn(e.message);
  } finally {
    reverseUploading.value = false;
  }
}

async function fetchReversedOriginal() {
  if (!roundId.value || !myReverseAssignment.value || !playerToken) {
    return;
  }
  const originalOwner = myReverseAssignment.value;
  reversedOriginalUrl.value = `/api/audio/reversed/${roundId.value}/${originalOwner}`;
}

async function playReversedOriginal() {
  if (!reversedOriginalUrl.value || !playerToken || !reversedAudioPlayer.value) return;
  try {
    const res = await fetch(reversedOriginalUrl.value, {
      headers: {'x-player-token': playerToken}
    });
    if (!res.ok) return;
    const blob = await res.blob();
    reversedAudioPlayer.value.src = URL.createObjectURL(blob);
    reversedAudioPlayer.value.load();
  } catch (e) {
    console.warn('Failed to load reversed audio:', e);
  }
}

function integrateRound(round) {
  if (!round) return;
  if (round.roundId) roundId.value = round.roundId;
  if (round.statuses) statuses.value = round.statuses;
  progress.total = Object.keys(round.assignments || {}).length;
  progress.uploaded = Object.values(statuses.value).filter(s => s === 'original_uploaded').length;
}

function nameById(id){
  const p = players.value.find(x=>x.id===id);return p? p.name.slice(0,20): id.slice(0,8);
}

// Replace earlier fetchRound logic
async function fetchRound() {
  try {
    const res = await fetch(`/api/rooms/${roomCode}/round`);
    if (res.status === 404) return;
    const data = await res.json();
    if (!res.ok) return;
    phase.value = data.phase || phase.value;
    songMap.value = data.assignments || {};
    integrateRound(data);
    if (!mySong.value) await fetchAssignedSong();
  } catch {
  }
}

onMounted(() => {
  if (!playerId) {
    router.replace('/');
    return;
  }
  fetchRoom();
  fetchRound();
  registerEvents();
});
</script>
<style scoped>
</style>
