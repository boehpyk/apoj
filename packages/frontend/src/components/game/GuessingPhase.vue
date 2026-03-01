<template>
  <div class="space-y-4">
    <h3 class="text-lg font-semibold">Guessing Phase</h3>

    <div v-if="loading" class="text-sm text-gray-500">Loading clues...</div>
    <div v-else-if="error" class="text-sm text-red-600">{{ error }}</div>
    <div v-else-if="clues.length === 0" class="text-sm text-gray-500">
      No clues available yet. Waiting for all players to finish recording...
    </div>
    <div v-else>

      <!-- ===== PUBLIC MODE ===== -->
      <template v-if="mode === 'public'">
        <p class="text-sm text-gray-600">
          The host controls playback. Listen and fill in your guess for each song.
        </p>

        <!-- Song progress indicator -->
        <div class="text-sm font-medium text-gray-700">
          Song {{ hostClueIndex + 1 }} of {{ hostTotalClues || clues.length }}
        </div>

        <!-- Audio player (controlled by host) -->
        <div v-if="currentClue" class="p-4 border rounded-lg bg-gray-50 space-y-3">
          <div class="flex items-center justify-between">
            <h4 class="font-medium">Clue #{{ hostClueIndex + 1 }}</h4>
            <span class="text-xs text-gray-500">Performed by: {{ currentClue.imitationPlayerName }}</span>
          </div>

          <audio ref="audioEl" :src="currentClue.finalAudioUrl" preload="auto" class="w-full" />

          <!-- Autoplay blocked overlay -->
          <div
            v-if="autoplayBlocked"
            class="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800 cursor-pointer text-center"
            @click="unblockAutoplay"
          >
            Tap here to hear the audio
          </div>

          <!-- Host controls -->
          <template v-if="isHost && !submitted">
            <div class="flex items-center gap-2 flex-wrap">
              <button
                @click="hostPlay"
                class="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"
              >▶ Play</button>
              <button
                @click="hostPause"
                class="px-3 py-1.5 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
              >⏸ Pause</button>
              <button
                @click="hostPrev"
                :disabled="hostClueIndex <= 0"
                class="px-3 py-1.5 bg-indigo-500 text-white text-sm rounded hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >← Prev</button>
              <button
                @click="hostNext"
                :disabled="hostClueIndex >= clues.length - 1"
                class="px-3 py-1.5 bg-indigo-500 text-white text-sm rounded hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >Next →</button>
            </div>
            <div class="flex items-center justify-between mt-2">
              <span class="text-xs text-gray-500">{{ submittedCount }} / {{ totalPlayers }} players submitted</span>
              <button
                @click="hostEndGuessing"
                :disabled="ending"
                class="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 disabled:opacity-50"
              >{{ ending ? 'Ending...' : 'End Guessing' }}</button>
            </div>
          </template>

          <!-- Non-host: playback status -->
          <div v-else-if="!isHost" class="text-xs text-gray-500">
            Waiting for host to play the audio...
          </div>

          <!-- Guess input for current song (all players including host) -->
          <div v-if="!submitted" class="space-y-2 mt-3 pt-3 border-t">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Song Title <span class="text-red-500">*</span>
              </label>
              <input
                v-model="localGuesses[hostClueIndex].title"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                :class="{ 'bg-gray-100': isClueSaved(hostClueIndex) }"
                :disabled="isClueSaved(hostClueIndex)"
                placeholder="Enter song title"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Artist (optional)</label>
              <input
                v-model="localGuesses[hostClueIndex].artist"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                :class="{ 'bg-gray-100': isClueSaved(hostClueIndex) }"
                :disabled="isClueSaved(hostClueIndex)"
                placeholder="Enter artist name"
              />
            </div>
            <div class="flex items-center justify-between pt-1">
              <span v-if="isClueSaved(hostClueIndex)" class="text-xs text-green-600 font-medium">✓ Saved</span>
              <button
                v-else
                @click="saveClue(hostClueIndex)"
                class="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
              >Save</button>
            </div>
          </div>
        </div>

        <!-- Submitted confirmation -->
        <div v-if="submitted" class="text-sm text-green-600 font-medium">
          ✓ Guesses submitted! Waiting for results...
        </div>
      </template>

      <!-- ===== PRIVATE MODE (original UI) ===== -->
      <template v-else>
        <p class="text-sm text-gray-600">
          Listen to each final audio and guess the song. You have 60 seconds per song.
        </p>

        <div class="space-y-6">
          <!-- List of clues -->
          <div
            v-for="(clue, index) in clues"
            :key="clue.clueIndex"
            class="p-4 border rounded-lg bg-gray-50"
          >
            <div class="flex items-center justify-between mb-3">
              <h4 class="font-medium">Clue #{{ clue.clueIndex + 1 }}</h4>
              <span class="text-xs text-gray-500">Performed by: {{ clue.imitationPlayerName }}</span>
            </div>

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
                  :disabled="submitted || isClueSaved(index)"
                  :class="{ 'bg-gray-100': submitted || isClueSaved(index) }"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Artist (optional)</label>
                <input
                  v-model="guesses[index].artist"
                  type="text"
                  class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter artist name"
                  :disabled="submitted || isClueSaved(index)"
                  :class="{ 'bg-gray-100': submitted || isClueSaved(index) }"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea
                  v-model="guesses[index].notes"
                  rows="2"
                  class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Additional context or description"
                  :disabled="submitted || isClueSaved(index)"
                  :class="{ 'bg-gray-100': submitted || isClueSaved(index) }"
                ></textarea>
              </div>
              <div v-if="!submitted" class="flex items-center pt-1">
                <span v-if="isClueSaved(index)" class="text-xs text-green-600 font-medium">✓ Saved</span>
                <button
                  v-else
                  @click="saveClue(index)"
                  :disabled="!guesses[index]?.title?.trim()"
                  class="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >Save</button>
              </div>
            </div>
          </div>

          <div class="flex justify-end space-x-3">
            <button
              v-if="!submitted"
              @click="submitPrivateGuesses"
              class="px-6 py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="submitting || !hasAnyGuess"
            >
              {{ submitting ? 'Submitting...' : 'Submit All Guesses' }}
            </button>
            <div v-else class="text-sm text-green-600 font-medium">
              ✓ Guesses submitted! Waiting for other players...
            </div>
          </div>

          <div class="text-xs text-gray-500 text-center">
            {{ submittedCount }} / {{ totalPlayers }} players submitted
          </div>
        </div>
      </template>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { EVENTS } from 'shared/constants/index.js';

const props = defineProps({
  roundId:        { type: String,  required: true },
  mode:           { type: String,  default: 'private' },
  isHost:         { type: Boolean, default: false },
  socket:         { default: null },
  submittedCount: { type: Number,  default: 0 },
  totalPlayers:   { type: Number,  default: 0 },
  hostClueIndex:  { type: Number,  default: 0 },
  hostTotalClues: { type: Number,  default: 0 },
  hostAudioSync:  { type: Object,  default: null },
  submitNow:      { type: Boolean, default: false },
});

const emit = defineEmits(['submitted']);

// ── Shared state ──────────────────────────────────────────────
const clues             = ref([]);
const loading           = ref(true);
const error             = ref(null);
const submitted         = ref(false);
const submitting        = ref(false);
const savedClueIndices  = ref(new Set());

function saveClue(index) {
  savedClueIndices.value = new Set([...savedClueIndices.value, index]);
}

function isClueSaved(index) {
  return savedClueIndices.value.has(index);
}

// ── Public mode state ─────────────────────────────────────────
const audioEl         = ref(null);
const autoplayBlocked = ref(false);
const ending          = ref(false); // separate from submitting — avoids blocking submitPublicGuesses
// localGuesses: { [clueIndex]: { title, artist } }
const localGuesses    = ref({});

const currentClue = computed(() =>
  clues.value.find(c => c.clueIndex === props.hostClueIndex) ?? null
);

// Initialise a guess slot whenever host navigates to a new index
watch(() => props.hostClueIndex, (idx) => {
  if (!localGuesses.value[idx]) {
    localGuesses.value[idx] = { title: '', artist: '' };
  }
});

// React to host play/pause commands
watch(() => props.hostAudioSync, async (sync) => {
  if (!sync || !audioEl.value) return;
  if (sync.clueIndex !== props.hostClueIndex) return;

  // Compensate for ~150ms of socket/relay latency
  audioEl.value.currentTime = (sync.positionSeconds ?? 0) + 0.15;

  if (sync.action === 'play') {
    try {
      await audioEl.value.play();
    } catch {
      autoplayBlocked.value = true;
    }
  } else {
    audioEl.value.pause();
  }
}, { deep: true });

// Auto-submit when host triggers end-guessing
watch(() => props.submitNow, async (val) => {
  if (val && !submitted.value) await submitPublicGuesses();
});

async function unblockAutoplay() {
  autoplayBlocked.value = false;
  try { await audioEl.value?.play(); } catch {}
}

// Host emits socket events
function hostPlay() {
  props.socket?.emit(EVENTS.HOST_AUDIO_SYNC, {
    roundId: props.roundId,
    clueIndex: props.hostClueIndex,
    action: 'play',
    positionSeconds: audioEl.value?.currentTime ?? 0,
  });
}

function hostPause() {
  props.socket?.emit(EVENTS.HOST_AUDIO_SYNC, {
    roundId: props.roundId,
    clueIndex: props.hostClueIndex,
    action: 'pause',
    positionSeconds: audioEl.value?.currentTime ?? 0,
  });
}

function hostPrev() {
  props.socket?.emit(EVENTS.HOST_SONG_CHANGED, {
    roundId: props.roundId,
    clueIndex: props.hostClueIndex - 1,
  });
}

function hostNext() {
  props.socket?.emit(EVENTS.HOST_SONG_CHANGED, {
    roundId: props.roundId,
    clueIndex: props.hostClueIndex + 1,
  });
}

async function hostEndGuessing() {
  ending.value = true;
  error.value = null;
  try {
    const token = sessionStorage.getItem('playerToken');
    const res = await fetch(`/api/rounds/${props.roundId}/end-guessing`, {
      method: 'POST',
      headers: { 'x-player-token': token },
    });
    if (!res.ok) {
      const d = await res.json();
      error.value = d.error || 'Failed to end guessing';
    }
    // Server emits GUESSING_SUBMIT_NOW → GameView sets submitNow → auto-submit fires via watcher
  } catch (e) {
    error.value = e.message;
  } finally {
    ending.value = false;
  }
}

async function submitPublicGuesses() {
  if (submitted.value || submitting.value) return;
  submitting.value = true;

  const guessArray = Object.entries(localGuesses.value)
    .map(([idx, g]) => ({
      clueIndex: parseInt(idx),
      title:     g.title?.trim()  || '',
      artist:    g.artist?.trim() || '',
    }))
    .filter(g => g.title.length > 0);

  if (guessArray.length === 0) {
    // Nothing guessed — mark as done locally, skip POST
    submitted.value = true;
    submitting.value = false;
    emit('submitted');
    return;
  }

  try {
    const token = sessionStorage.getItem('playerToken');
    const res = await fetch(`/api/rounds/${props.roundId}/guess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-player-token': token },
      body: JSON.stringify({ guesses: guessArray }),
    });
    const d = await res.json();
    if (!res.ok && d.error !== 'Already submitted') {
      error.value = d.error || 'Submit failed';
    } else {
      submitted.value = true;
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    submitting.value = false;
    if (submitted.value) emit('submitted');
  }
}

// ── Private mode state ────────────────────────────────────────
const TIME_PER_CLUE    = 60;
const guesses          = ref([]);
const activeClueIndex  = ref(-1);
const timeRemaining    = ref(TIME_PER_CLUE);
const audioRefs        = ref([]);
let timerId            = null;

const hasAnyGuess = computed(() =>
  guesses.value.some(g => g.title && g.title.trim().length > 0)
);

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function onAudioPlay(index) {
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
      if (activeClueIndex.value < clues.value.length - 1) {
        activeClueIndex.value++;
        startTimer();
      } else if (!submitted.value) {
        submitPrivateGuesses();
      }
    }
  }, 1000);
}

async function submitPrivateGuesses() {
  if (submitted.value || submitting.value) return;

  const validGuesses = guesses.value.filter(g => g.title && g.title.trim().length > 0);
  if (validGuesses.length === 0) {
    error.value = 'Please enter at least one guess';
    return;
  }

  submitting.value = true;
  error.value = null;

  try {
    const token = sessionStorage.getItem('playerToken');
    const res = await fetch(`/api/rounds/${props.roundId}/guess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-player-token': token },
      body: JSON.stringify({ guesses: validGuesses }),
    });

    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error || 'Failed to submit guesses');
    }

    submitted.value = true;
    if (timerId) { clearInterval(timerId); timerId = null; }
    emit('submitted');
  } catch (e) {
    error.value = e.message;
  } finally {
    submitting.value = false;
  }
}

// ── Shared lifecycle ──────────────────────────────────────────
async function fetchClues() {
  loading.value = true;
  error.value = null;
  try {
    const token = sessionStorage.getItem('playerToken');
    const res = await fetch(`/api/rounds/${props.roundId}/clues`, {
      headers: { 'x-player-token': token },
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error || 'Failed to fetch clues');
    }
    const data = await res.json();
    clues.value = (data.clues || []).map(clue => ({
      ...clue,
      finalAudioUrl: `${clue.finalAudioUrl}?token=${encodeURIComponent(token)}`,
    }));

    // Initialise per-mode guess structures
    if (props.mode === 'public') {
      clues.value.forEach(c => {
        localGuesses.value[c.clueIndex] = { title: '', artist: '' };
      });
    } else {
      guesses.value = clues.value.map(c => ({ clueIndex: c.clueIndex, title: '', artist: '', notes: '' }));
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchClues();
});

onBeforeUnmount(() => {
  if (timerId) { clearInterval(timerId); timerId = null; }
  if (audioEl.value) audioEl.value.pause();
});
</script>

<style scoped>
</style>
