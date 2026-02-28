<template>
  <div class="space-y-6">
    <h3 class="text-2xl font-bold">Round Results</h3>

    <div v-if="loading" class="text-sm text-gray-500">Loading results...</div>
    <div v-else-if="error" class="text-sm text-red-600">{{ error }}</div>
    <div v-else class="space-y-6">
      <!-- Leaderboard at top -->
      <div class="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6">
        <h4 class="text-xl font-bold mb-4 text-center">🏆 Leaderboard</h4>
        <div class="space-y-2">
          <div
            v-for="(player, idx) in leaderboard"
            :key="player.playerId"
            class="flex items-center justify-between p-3 bg-white rounded shadow-sm"
            :class="{
              'ring-2 ring-yellow-400': idx === 0,
              'ring-2 ring-gray-300': idx === 1,
              'ring-2 ring-orange-400': idx === 2
            }"
          >
            <div class="flex items-center space-x-3">
              <span class="text-2xl font-bold text-gray-400">{{ idx + 1 }}.</span>
              <span class="font-semibold text-lg">{{ player.playerName }}</span>
              <span v-if="player.playerId === myPlayerId" class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                You
              </span>
            </div>
            <div class="text-right">
              <div class="text-2xl font-bold text-blue-600">{{ player.totalScore }} pts</div>
              <div v-if="singerBonusFor(player.playerId) > 0" class="text-xs text-orange-600">
                incl. +{{ singerBonusFor(player.playerId) }} singing
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Detailed clue results -->
      <div>
        <h4 class="text-lg font-semibold mb-3">Detailed Results by Clue</h4>
        <div class="space-y-4">
          <div
            v-for="clue in clues"
            :key="clue.clueIndex"
            class="border rounded-lg p-4 bg-gray-50"
          >
            <div class="mb-3 pb-3 border-b">
              <div class="flex items-center justify-between">
                <div class="font-bold text-lg">Clue #{{ clue.clueIndex + 1 }}</div>
                <div v-if="clue.singerPlayerId" class="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded font-medium">
                  Sung by {{ clue.singerPlayerId === myPlayerId ? 'you' : clue.singerPlayerName }}
                  <span v-if="clue.singerBonus > 0"> · +{{ clue.singerBonus }} singer pts</span>
                </div>
              </div>
              <div class="text-sm text-gray-700 mt-1">
                <span class="font-medium">Correct Answer:</span>
                <span class="text-green-700">{{ clue.correctTitle }}</span>
                <span class="text-gray-500"> - {{ clue.correctArtist }}</span>
              </div>
            </div>

            <!-- Player scores for this clue -->
            <div class="space-y-2">
              <div
                v-for="score in clue.playerScores"
                :key="score.playerId"
                class="bg-white p-3 rounded border-l-4"
                :class="{
                  'border-blue-500': score.playerId === myPlayerId,
                  'border-gray-300': score.playerId !== myPlayerId
                }"
              >
                <div class="flex justify-between items-start mb-2">
                  <div>
                    <span class="font-medium">{{ score.playerName }}</span>
                    <span v-if="score.playerId === myPlayerId" class="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                      You
                    </span>
                  </div>
                  <div class="text-right">
                    <div class="text-xl font-bold text-blue-600">
                      {{ score.totalPoints }} pts
                    </div>
                    <div class="text-xs text-gray-500">
                      AI Score: {{ score.aiScore.toFixed(1) }}/10
                    </div>
                  </div>
                </div>

                <div class="text-sm mb-2">
                  <span class="text-gray-600">Guess:</span>
                  <span class="ml-1 font-medium">{{ score.guessTitle || '(empty)' }}</span>
                  <span v-if="score.guessArtist" class="text-gray-500"> - {{ score.guessArtist }}</span>
                </div>

                <div class="text-xs text-gray-600 space-y-1">
                  <div class="flex justify-between">
                    <span>Base Points:</span>
                    <span class="font-medium">{{ score.basePoints }}</span>
                  </div>
                  <div v-if="score.speedBonus > 0" class="flex justify-between text-green-600">
                    <span>Speed Bonus <span class="text-green-500 font-normal">({{ score.speedBonus === 25 ? 'guessed in &lt;30s' : 'guessed in &lt;45s' }}):</span></span>
                    <span class="font-medium">+{{ score.speedBonus }}</span>
                  </div>
                  <div v-if="score.artistBonus > 0" class="flex justify-between text-purple-600">
                    <span>Artist Bonus <span class="text-purple-500 font-normal">(correct artist):</span></span>
                    <span class="font-medium">+{{ score.artistBonus }}</span>
                  </div>
                </div>

                <div v-if="score.reasoning" class="mt-2 text-xs text-gray-500 italic">
                  {{ score.reasoning }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Next round button (for host) -->
      <div class="flex justify-center space-x-4 pt-6">
        <button
          v-if="isHost"
          @click="startNextRound"
          class="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
        >
          Start Next Round
        </button>
        <button
          @click="backToLobby"
          class="px-6 py-3 bg-gray-600 text-white font-medium rounded-lg hover:bg-gray-700"
        >
          Back to Lobby
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';

const props = defineProps({
  roundId: {
    type: String,
    required: true
  },
  roomCode: {
    type: String,
    required: true
  },
  isHost: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['nextRound']);

const router = useRouter();
const myPlayerId = sessionStorage.getItem('playerId');

const loading = ref(true);
const error = ref(null);
const clues = ref([]);
const leaderboard = ref([]);

function singerBonusFor(playerId) {
  return clues.value
    .filter(c => c.singerPlayerId === playerId)
    .reduce((sum, c) => sum + (c.singerBonus || 0), 0);
}

async function fetchResults() {
  loading.value = true;
  error.value = null;

  try {
    const playerToken = sessionStorage.getItem('playerToken');
    const res = await fetch(`/api/rounds/${props.roundId}/results`, {
      headers: {
        'x-player-token': playerToken
      }
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to fetch results');
    }

    const data = await res.json();
    clues.value = data.clues || [];
    leaderboard.value = data.leaderboard || [];
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function startNextRound() {
  emit('nextRound');
}

function backToLobby() {
  router.push(`/room/${props.roomCode}`);
}

onMounted(() => {
  fetchResults();
});
</script>

<style scoped>
/* Custom styles if needed */
</style>
