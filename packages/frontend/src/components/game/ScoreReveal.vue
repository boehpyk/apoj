<template>
  <div class="space-y-6">
    <h3 class="text-2xl font-bold">Scores Are In!</h3>

    <!-- Leaderboard -->
    <div class="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6">
      <h4 class="text-xl font-bold mb-4 text-center">Leaderboard</h4>
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
            <span
              v-if="player.playerId === myPlayerId"
              class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded"
            >
              You
            </span>
          </div>
          <div class="text-2xl font-bold text-blue-600">{{ player.total }} pts</div>
        </div>
      </div>
    </div>

    <!-- Per-clue breakdown -->
    <div>
      <h4 class="text-lg font-semibold mb-3">Breakdown by Clue</h4>
      <div class="space-y-4">
        <div
          v-for="clueIndex in clueIndexes"
          :key="clueIndex"
          class="border rounded-lg p-4 bg-gray-50"
        >
          <div class="mb-3 pb-2 border-b">
            <div class="font-bold text-base">{{ songByClue[clueIndex]?.songTitle || `Clue #${clueIndex + 1}` }}</div>
            <div v-if="songByClue[clueIndex]?.songArtist" class="text-sm text-gray-500">{{ songByClue[clueIndex].songArtist }}</div>
          </div>
          <div class="space-y-2">
            <div
              v-for="score in scoresByClue[clueIndex]"
              :key="score.playerId"
              class="bg-white p-3 rounded border-l-4"
              :class="{
                'border-blue-500': score.playerId === myPlayerId,
                'border-gray-300': score.playerId !== myPlayerId
              }"
            >
              <div class="flex justify-between items-start">
                <div class="flex items-center space-x-2">
                  <span class="font-medium">{{ score.playerName }}</span>
                  <span
                    v-if="score.playerId === myPlayerId"
                    class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded"
                  >
                    You
                  </span>
                </div>
                <div class="text-right">
                  <div class="text-xl font-bold text-blue-600">{{ score.total }} pts</div>
                  <div class="text-xs text-gray-500">AI: {{ score.aiScore.toFixed(1) }}/10</div>
                </div>
              </div>

              <div class="mt-2 text-xs text-gray-600 space-y-1">
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

              <div v-if="score.reasoning" class="mt-2 text-xs text-gray-400 italic">
                {{ score.reasoning }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- Host controls -->
    <div v-if="isHost" class="flex justify-center gap-4 pt-2">
      <button
        @click="endGame"
        :disabled="ending"
        class="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        End Game
      </button>
      <button
        @click="endGameAndClean"
        :disabled="ending"
        class="px-6 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
      >
        End Game &amp; Clean Files
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

const props = defineProps({
  scores: {
    type: Array,
    required: true
  },
  myPlayerId: {
    type: String,
    required: true
  },
  isHost: {
    type: Boolean,
    default: false
  },
  roundId: {
    type: String,
    default: null
  }
});

const ending = ref(false);

async function endGame() {
  if (ending.value) return;
  ending.value = true;
  try {
    const token = sessionStorage.getItem('playerToken');
    await fetch(`/api/rounds/${props.roundId}/end`, {
      method: 'POST',
      headers: { 'x-player-token': token }
    });
    router.replace('/');
  } finally {
    ending.value = false;
  }
}

async function endGameAndClean() {
  if (ending.value) return;
  ending.value = true;
  try {
    const token = sessionStorage.getItem('playerToken');
    await fetch(`/api/rounds/${props.roundId}/cleanup`, {
      method: 'POST',
      headers: { 'x-player-token': token }
    });
    router.replace('/');
  } finally {
    ending.value = false;
  }
}

const leaderboard = computed(() => {
  const totals = {};
  for (const score of props.scores) {
    if (!totals[score.playerId]) {
      totals[score.playerId] = { playerId: score.playerId, playerName: score.playerName, total: 0 };
    }
    totals[score.playerId].total += score.total;
  }
  return Object.values(totals).sort((a, b) => b.total - a.total);
});

const clueIndexes = computed(() => {
  const indexes = [...new Set(props.scores.map(s => s.clueIndex))];
  return indexes.sort((a, b) => a - b);
});

const scoresByClue = computed(() => {
  const map = {};
  for (const score of props.scores) {
    if (!map[score.clueIndex]) map[score.clueIndex] = [];
    map[score.clueIndex].push(score);
  }
  return map;
});

const songByClue = computed(() => {
  const map = {};
  for (const score of props.scores) {
    if (!map[score.clueIndex] && (score.songTitle || score.songArtist)) {
      map[score.clueIndex] = { songTitle: score.songTitle, songArtist: score.songArtist };
    }
  }
  return map;
});
</script>
