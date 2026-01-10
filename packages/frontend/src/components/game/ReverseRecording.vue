<template>
  <div class="space-y-3">
    <!-- Active Reverse Singer -->
    <div v-if="isReverseSinger" class="p-3 border rounded bg-blue-50 space-y-3">
      <h4 class="font-medium text-sm">Reverse Recording Phase</h4>
      <p class="text-xs text-gray-600">
        You are assigned to reverse the recording of:
        <span class="font-semibold">{{ originalOwnerName }}</span>
      </p>

      <!-- Step 1: Play reversed audio -->
      <div class="space-y-1">
        <p class="text-xs font-medium">Step 1: Listen to the reversed audio</p>
        <div>
          <audio ref="reversedAudioPlayer" controls class="w-full"></audio>
        </div>
        <p class="text-xs text-gray-500">Play this as many times as you need</p>
      </div>

      <!-- Step 2: Record reverse -->
      <div class="space-y-2">
        <p class="text-xs font-medium">Step 2: Try to reproduce what you hear</p>
        <div class="flex items-center space-x-2 flex-wrap gap-2">
          <button
            @click="handleStartRecording"
            :disabled="isRecording || uploaded"
            class="px-3 py-1 rounded text-white text-sm"
            :class="isRecording || uploaded ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'">
            {{ isRecording ? 'Recording...' : uploaded ? 'Uploaded' : 'Start Recording' }}
          </button>

          <button
            v-if="isRecording && !isPaused"
            @click="handlePause"
            class="px-3 py-1 rounded bg-yellow-600 text-white hover:bg-yellow-700 text-sm">
            Pause
          </button>

          <button
            v-if="isRecording && isPaused"
            @click="handleResume"
            class="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 text-sm">
            Resume
          </button>

          <button
            v-if="isRecording"
            @click="handleStopRecording"
            class="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700 text-sm">
            Stop
          </button>

          <button
            v-if="recordBlob && !uploaded"
            @click="handleUpload"
            :disabled="uploading"
            class="px-3 py-1 rounded text-white text-sm"
            :class="uploading ? 'bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'">
            {{ uploading ? 'Uploading...' : 'Upload' }}
          </button>
        </div>
        <p class="text-xs text-gray-500">You can pause and resume recording. Try to match the reversed audio!</p>
        <audio v-if="recordBlob" :src="recordUrl" controls class="w-full"></audio>
      </div>
    </div>

    <!-- Waiting for others -->
    <div v-else class="p-3 border rounded bg-gray-50">
      <p class="text-sm text-gray-600">Waiting for reverse singers to complete their recordings...</p>
    </div>

    <!-- Progress -->
    <div class="text-sm" v-if="totalPlayers > 0">
      Uploaded: {{ uploadedCount }} / {{ totalPlayers }}
    </div>
  </div>
</template>

<script setup>
import {ref, computed, onMounted} from 'vue';
import { useAudioRecorder } from '../../composables/useAudioRecorder.js';

const props = defineProps({
  roundId: String,
  reverseAssignment: String, // Original owner player ID
  originalOwnerName: String,
  uploadedCount: Number,
  totalPlayers: Number
});

const emit = defineEmits(['uploaded']);

const { isRecording, isPaused, start, stop, pause, resume } = useAudioRecorder();
const recordBlob = ref(null);
const recordUrl = ref('');
const uploading = ref(false);
const uploaded = ref(false);
const reversedAudioPlayer = ref(null);
const playerToken = sessionStorage.getItem('playerToken');

const isReverseSinger = computed(() => !!props.reverseAssignment);
const reversedAudioUrl = computed(() =>
  props.reverseAssignment
    ? `/api/audio/reversed/${props.roundId}/${props.reverseAssignment}`
    : null
);

async function handlePlayReversed() {
  if (!reversedAudioUrl.value || !playerToken || !reversedAudioPlayer.value) {
    return;
  }

  try {
    const res = await fetch(reversedAudioUrl.value, {
      headers: { 'x-player-token': playerToken }
    });
    if (!res.ok) {
      return;
    }

    const blob = await res.blob();
    reversedAudioPlayer.value.src = URL.createObjectURL(blob);
    reversedAudioPlayer.value.load();
  } catch (e) {
    console.warn('Failed to load reversed audio:', e);
  }
}

async function handleStartRecording() {
  await start();
}

async function handleStopRecording() {
  recordBlob.value = await stop();
  recordUrl.value = URL.createObjectURL(recordBlob.value);
}

function handlePause() {
  pause();
}

function handleResume() {
  resume();
}

async function handleUpload() {
  if (!recordBlob.value || uploaded.value || !props.roundId || !playerToken) {
    return;
  }
  uploading.value = true;
  try {
    const form = new FormData();
    form.append('file', recordBlob.value, 'reverse.webm');
    const res = await fetch(`/api/rounds/${props.roundId}/reverse-recording`, {
      method: 'POST',
      headers: { 'x-player-token': playerToken },
      body: form
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Upload failed');
    }
    uploaded.value = true;
    emit('uploaded');
  } catch (e) {
    console.warn('Upload failed:', e.message);
  } finally {
    uploading.value = false;
  }
}

onMounted(() => {
  console.log('ReverseRecording mounted with assignment:', props.reverseAssignment);
  if (props.reverseAssignment) {
    handlePlayReversed();
  }
});

</script>

