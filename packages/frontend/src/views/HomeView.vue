<template>
  <div class="max-w-xl mx-auto bg-white p-6 rounded shadow">
    <h2 class="text-xl font-semibold mb-4">Welcome</h2>
    <p class="mb-4">This is the MVP placeholder. Iteration 2 will add room creation.</p>
    <div class="space-y-2 mb-6">
      <button class="px-4 py-2 bg-blue-600 text-white rounded opacity-60 cursor-not-allowed">Create Room (Coming Soon)</button>
      <div>
        <input class="border px-2 py-1 rounded w-40 mr-2" placeholder="Room Code" disabled />
        <button class="px-4 py-2 bg-green-600 text-white rounded opacity-60 cursor-not-allowed">Join Room (Coming Soon)</button>
      </div>
    </div>
    <div class="text-sm" v-if="health.loading">Checking backend health...</div>
    <div class="text-sm text-green-700" v-else-if="health.ok">Backend: OK</div>
    <div class="text-sm text-red-700" v-else>Backend error: {{ health.error }}</div>
  </div>
</template>
<script setup>
import { reactive, onMounted } from 'vue';

const health = reactive({ loading: true, ok: false, error: null });

onMounted(async () => {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
    const data = await res.json();
    health.ok = data.status === 'ok';
  } catch (e) {
    health.error = e.message;
  } finally {
    health.loading = false;
  }
});
</script>
