<template>
  <div class="space-y-3">
    <!-- Song Display -->
    <div v-if="song" class="p-3 border rounded bg-gray-50 space-y-2">
      <h4 class="font-semibold text-sm">Your Song</h4>
      <p class="text-sm font-medium">{{ song.title }}</p>
      <div v-if="songAudioUrl" class="space-y-1">
        <audio :src="songAudioUrl" controls preload="none" class="w-full"></audio>
      </div>
      <div v-else-if="song && song.audioProxyUrl" class="text-xs text-gray-500">Loading audio...</div>
      <div v-else class="text-xs text-red-600">Audio file not available.</div>
      <pre class="text-xs whitespace-pre-wrap leading-snug max-h-64 overflow-auto">{{ song.lyrics }}</pre>
    </div>

    <!-- Recording Controls -->
    <div class="space-y-2">
      <h4 class="font-medium text-sm">Original Recording</h4>
      <div class="flex items-center space-x-2">
        <button
          @click="handleRecord"
          :disabled="isRecording || uploaded"
          class="px-3 py-1 rounded text-white"
          :class="isRecording || uploaded ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'">
          {{ isRecording ? 'Recording...' : uploaded ? 'Uploaded' : 'Record' }}
        </button>
        <button
          v-if="isRecording"
          @click="handleStop"
          class="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700">
          Stop
        </button>
        <button
          v-if="recordBlob && !uploaded"
          @click="handleUpload"
          :disabled="uploading"
          class="px-3 py-1 rounded text-white"
          :class="uploading ? 'bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'">
          {{ uploading ? 'Uploading...' : 'Upload' }}
        </button>
      </div>
      <p class="text-xs text-gray-500">Record a short clear vocal (10–30s). Then upload.</p>
      <audio v-if="recordBlob" :src="recordUrl" controls class="w-full"></audio>
    </div>

    <!-- Progress -->
    <div class="text-sm" v-if="totalPlayers > 0">
      Uploaded: {{ uploadedCount }} / {{ totalPlayers }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useAudioRecorder } from '../../composables/useAudioRecorder.js';

const props = defineProps({
  song: Object,
  roundId: String,
  uploadedCount: Number,
  totalPlayers: Number
});

const emit = defineEmits(['uploaded']);

const { isRecording, start, stop } = useAudioRecorder();
const recordBlob = ref(null);
const recordUrl = ref('');
const uploading = ref(false);
const uploaded = ref(false);
const songAudioUrl = ref('');
const playerToken = sessionStorage.getItem('playerToken');

async function handleRecord() {
  await start();
}

async function handleStop() {
  recordBlob.value = await stop();
  recordUrl.value = URL.createObjectURL(recordBlob.value);
}

async function handleUpload() {
  if (!recordBlob.value || uploaded.value || !props.roundId || !playerToken) return;
  uploading.value = true;
  try {
    const form = new FormData();
    form.append('file', recordBlob.value, 'original.webm');
    const res = await fetch(`/api/rounds/${props.roundId}/original-recording`, {
      method: 'POST',
      headers: { 'x-player-token': playerToken },
      body: form
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    uploaded.value = true;
    emit('uploaded');
  } catch (e) {
    console.warn('Upload failed:', e.message);
  } finally {
    uploading.value = false;
  }
}

async function fetchSongAudio() {
  if (!props.song?.audioProxyUrl || !playerToken) return;
  try {
    const res = await fetch(props.song.audioProxyUrl, {
      headers: { 'x-player-token': playerToken }
    });
    if (!res.ok) return;
    const blob = await res.blob();
    if (songAudioUrl.value) URL.revokeObjectURL(songAudioUrl.value);
    songAudioUrl.value = URL.createObjectURL(blob);
  } catch (e) {
    console.warn('Failed to load song audio:', e);
  }
}

watch(() => props.song, (newSong) => {
  if (newSong) fetchSongAudio();
}, { immediate: true });
</script>

