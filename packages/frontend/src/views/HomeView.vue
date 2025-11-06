<template>
  <div class="max-w-xl mx-auto bg-white p-6 rounded shadow space-y-4">
    <h2 class="text-xl font-semibold">Reverse Song Challenge</h2>

    <section class="border rounded p-4 space-y-3">
      <h3 class="font-medium">Create Room</h3>
      <div class="flex items-center space-x-2">
        <input v-model="createName" class="border px-2 py-1 rounded flex-1" placeholder="Your name" />
        <button @click="onCreate" :disabled="creating || !validName(createName)" class="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50">{{ creating ? 'Creating...' : 'Create' }}</button>
      </div>
      <p class="text-xs text-gray-500">Min 3 characters. Generates a 6-char room code.</p>
      <p v-if="createError" class="text-xs text-red-600">{{ createError }}</p>
    </section>

    <section class="border rounded p-4 space-y-3">
      <h3 class="font-medium">Join Room</h3>
      <div class="flex items-center space-x-2 flex-wrap">
        <input v-model="joinCode" class="border px-2 py-1 rounded w-32" placeholder="Code" />
        <input v-model="joinName" class="border px-2 py-1 rounded flex-1" placeholder="Your name" />
        <button @click="onJoin" :disabled="joining || !validCode(joinCode) || !validName(joinName)" class="px-4 py-2 rounded bg-green-600 text-white disabled:opacity-50">{{ joining ? 'Joining...' : 'Join' }}</button>
      </div>
      <p class="text-xs text-gray-500">Room code is 6 letters/numbers.</p>
      <p v-if="joinError" class="text-xs text-red-600">{{ joinError }}</p>
    </section>

    <section>
      <div class="text-sm" v-if="health.loading">Checking backend health...</div>
      <div class="text-sm text-green-700" v-else-if="health.ok">Backend: OK</div>
      <div class="text-sm text-red-700" v-else>Backend error: {{ health.error }}</div>
    </section>
  </div>
</template>
<script setup>
import { reactive, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const health = reactive({ loading: true, ok: false, error: null });
const createName = ref('');
const createError = ref(null);
const creating = ref(false);

const joinCode = ref('');
const joinName = ref('');
const joinError = ref(null);
const joining = ref(false);

function validName(n){ return (n||'').trim().length >= 3; }
function validCode(c){ return (c||'').trim().length === 6; }

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

async function onCreate(){
  createError.value = null;
  creating.value = true;
  try {
    const res = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerName: createName.value }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    sessionStorage.setItem('playerId', data.playerId);
    if (data.playerToken) sessionStorage.setItem('playerToken', data.playerToken);
    sessionStorage.setItem('roomCode', data.roomCode);
    router.push(`/room/${data.roomCode}`);
  } catch (e) {
    createError.value = e.message;
  } finally {
    creating.value = false;
  }
}

async function onJoin(){
  joinError.value = null;
  joining.value = true;
  try {
    const code = joinCode.value.toUpperCase();
    const res = await fetch(`/api/rooms/${code}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerName: joinName.value }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    sessionStorage.setItem('playerId', data.playerId);
    if (data.playerToken) sessionStorage.setItem('playerToken', data.playerToken);
    sessionStorage.setItem('roomCode', data.roomCode);
    router.push(`/room/${data.roomCode}`);
  } catch (e) {
    joinError.value = e.message;
  } finally {
    joining.value = false;
  }
}
</script>
<style scoped>
input { outline: none; }
</style>
