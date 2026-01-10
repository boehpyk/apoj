<template>
  <div class="space-y-4">
    <h3 class="text-lg font-semibold">Guessing Phase</h3>
    <p class="text-sm text-gray-600">
      Listen to each final audio and guess the song. You have 60 seconds per song.
    </p>

    <div v-if="loading" class="text-sm text-gray-500">Loading clues...</div>
    <div v-else-if="error" class="text-sm text-red-600">{{ error }}</div>
    <div v-else-if="clues.length === 0" class="text-sm text-gray-500">
      No clues available yet. Waiting for all players to finish recording...
    </div>
    <div v-else class="space-y-6">
      <!-- List of clues -->
      <div
        v-for="(clue, index) in clues"
        :key="clue.clueIndex"
        class="p-4 border rounded-lg bg-gray-50"
      >
        <div class="flex items-center justify-between mb-3">
          <h4 class="font-medium">Clue #{{ clue.clueIndex + 1 }}</h4>
          <span class="text-xs text-gray-500">
            Performed by: {{ clue.imitationPlayerName }}
          </span>
        </div>

        <!-- Audio player -->
        <div class="mb-3">
          <audio
            :ref="el => audioRefs[index] = el"
            controls
            class="w-full"
            :src="clue.finalAudioUrl"
            @play="onAudioPlay(index)"
          >
            Your browser does not support audio playback.
          </audio>
        </div>

        <!-- Timer for this clue -->
        <div v-if="!submitted && activeClueIndex === index" class="mb-3">
          <div class="text-sm text-gray-700">
            Time remaining: <span class="font-semibold">{{ formatTime(timeRemaining) }}</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2 mt-1">
            <div
              class="bg-blue-600 h-2 rounded-full transition-all"
              :style="{ width: `${(timeRemaining / TIME_PER_CLUE) * 100}%` }"
            ></div>
          </div>
        </div>

        <!-- Guess input form -->
        <div class="space-y-2">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Song Title <span class="text-red-500">*</span>
            </label>
            <input
              v-model="guesses[index].title"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter song title"
              :disabled="submitted"
              :class="{ 'bg-gray-100': submitted }"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Artist (optional)
            </label>
            <input
              v-model="guesses[index].artist"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter artist name"
              :disabled="submitted"
              :class="{ 'bg-gray-100': submitted }"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Notes (optional)
            </label>
            <textarea
              v-model="guesses[index].notes"
              rows="2"
              class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Additional context or description"
              :disabled="submitted"
              :class="{ 'bg-gray-100': submitted }"
            ></textarea>
          </div>
        </div>
      </div>

      <!-- Submit button -->
      <div class="flex justify-end space-x-3">
        <button
          v-if="!submitted"
          @click="submitGuesses"
          class="px-6 py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="submitting || !hasAnyGuess"
        >
          {{ submitting ? 'Submitting...' : 'Submit All Guesses' }}
        </button>
        <div v-else class="text-sm text-green-600 font-medium">
          ✓ Guesses submitted! Waiting for other players...
        </div>
      </div>

      <!-- Progress indicator -->
      <div class="text-xs text-gray-500 text-center">
        {{ uploadedCount }} / {{ totalPlayers }} players submitted
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps({
  roundId: {
    type: String,
    required: true
  },
  uploadedCount: {
    type: Number,
    default: 0
  },
  totalPlayers: {
    type: Number,
    default: 0
  }
});

const emit = defineEmits(['submitted']);

const TIME_PER_CLUE = 60; // 60 seconds per clue

const clues = ref([]);
const guesses = ref([]);
const loading = ref(true);
const error = ref(null);
const submitted = ref(false);
const submitting = ref(false);
const activeClueIndex = ref(-1);
const timeRemaining = ref(TIME_PER_CLUE);
const audioRefs = ref([]);
let timerId = null;

const hasAnyGuess = computed(() => {
  return guesses.value.some(g => g.title && g.title.trim().length > 0);
});

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function onAudioPlay(index) {
  // Start timer for this clue when audio is played
  if (activeClueIndex.value === -1 && !submitted.value) {
    activeClueIndex.value = index;
    startTimer();
  }
}

function startTimer() {
  if (timerId) clearInterval(timerId);

  timeRemaining.value = TIME_PER_CLUE;

  timerId = setInterval(() => {
    timeRemaining.value--;

    if (timeRemaining.value <= 0) {
      clearInterval(timerId);
      timerId = null;

      // Move to next clue or auto-submit
      if (activeClueIndex.value < clues.value.length - 1) {
        activeClueIndex.value++;
        startTimer();
      } else {
        // Auto-submit when all timers expire
        if (!submitted.value) {
          submitGuesses();
        }
      }
    }
  }, 1000);
}

async function fetchClues() {
  loading.value = true;
  error.value = null;

  try {
    const playerToken = sessionStorage.getItem('playerToken');
    const res = await fetch(`/api/rounds/${props.roundId}/clues`, {
      headers: {
        'x-player-token': playerToken
      }
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to fetch clues');
    }

    const data = await res.json();
    clues.value = data.clues || [];

    // Initialize guesses array and add token to audio URLs
    guesses.value = clues.value.map((clue) => {
      // Add token to audio URL
      clue.finalAudioUrl = `${clue.finalAudioUrl}?token=${encodeURIComponent(playerToken)}`;

      return {
        clueIndex: clue.clueIndex,
        title: '',
        artist: '',
        notes: ''
      };
    });
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function submitGuesses() {
  if (submitted.value || submitting.value) return;

  // Filter out empty guesses
  const validGuesses = guesses.value.filter(g => g.title && g.title.trim().length > 0);

  if (validGuesses.length === 0) {
    error.value = 'Please enter at least one guess';
    return;
  }

  submitting.value = true;
  error.value = null;

  try {
    const playerToken = sessionStorage.getItem('playerToken');
    const res = await fetch(`/api/rounds/${props.roundId}/guess`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-player-token': playerToken
      },
      body: JSON.stringify({
        guesses: validGuesses
      })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to submit guesses');
    }

    submitted.value = true;

    // Stop timer
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }

    emit('submitted');
  } catch (e) {
    error.value = e.message;
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  fetchClues();
});

onBeforeUnmount(() => {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
});
</script>

<style scoped>
/* Custom styles if needed */
</style>

