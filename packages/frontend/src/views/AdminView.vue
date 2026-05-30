<template>
    <div class="max-w-3xl mx-auto p-6 space-y-6 admin-scroll-root">

        <!-- Login form -->
        <div v-if="!isAuthenticated" class="bg-white rounded shadow p-6 space-y-4">
            <h2 class="text-xl font-semibold">Admin Login</h2>
            <input
                v-model="passwordInput"
                type="password"
                placeholder="Admin password"
                class="w-full border rounded px-3 py-2 text-sm text-gray-900"
                @keyup.enter="handleLogin"
            />
            <p v-if="loginError" class="text-sm text-red-600">{{ loginError }}</p>
            <button
                @click="handleLogin"
                :disabled="loggingIn"
                class="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
                {{ loggingIn ? 'Checking...' : 'Login' }}
            </button>
        </div>

        <!-- Admin panel -->
        <div v-else class="space-y-6">
            <div class="flex justify-between items-center">
                <h2 class="text-xl font-semibold">Song Management</h2>
                <button @click="logout" class="text-sm text-gray-500 hover:underline">Logout</button>
            </div>

            <!-- Upload form -->
            <div class="bg-white rounded shadow p-6 space-y-4">
                <h3 class="font-medium">Add New Song</h3>
                <input v-model="form.title" placeholder="Title *" class="w-full border rounded px-3 py-2 text-sm text-gray-900" />
                <input v-model="form.artist" placeholder="Artist *" class="w-full border rounded px-3 py-2 text-sm text-gray-900" />
                <input v-model="form.description" placeholder="Description (optional)" class="w-full border rounded px-3 py-2 text-sm text-gray-900" />
                <textarea
                    v-model="form.lyrics"
                    placeholder="Lyrics (optional)"
                    rows="6"
                    class="w-full border rounded px-3 py-2 text-sm font-mono resize-y text-gray-900"
                />
                <input v-model="form.tags" placeholder="Tags (comma-separated, e.g. pop,80s,rock)" class="w-full border rounded px-3 py-2 text-sm text-gray-900" />
                <div>
                    <label class="text-sm font-medium text-gray-700">MP3 File *</label>
                    <input type="file" accept="audio/mpeg,audio/mp3,.mp3" @change="handleFileSelect" class="mt-1 block text-sm" />
                </div>
                <p v-if="uploadError" class="text-sm text-red-600">{{ uploadError }}</p>
                <p v-if="uploadSuccess" class="text-sm text-green-600">Song uploaded successfully.</p>
                <button
                    @click="uploadSong"
                    :disabled="uploading || !form.title || !form.artist || !selectedFile"
                    class="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {{ uploading ? 'Uploading...' : 'Upload Song' }}
                </button>
            </div>

            <!-- Songs list -->
            <div class="bg-white rounded shadow p-6 space-y-3">
                <div class="flex justify-between items-center">
                    <h3 class="font-medium">Existing Songs ({{ filteredSongs.length }}/{{ songs.length }})</h3>
                </div>

                <!-- Filters -->
                <div class="space-y-2">
                    <input
                        v-model="filterText"
                        type="text"
                        placeholder="Filter by title..."
                        class="w-full border rounded px-3 py-2 text-sm text-gray-900"
                    />
                    <div v-if="allTags.length" class="flex gap-1.5 flex-wrap">
                        <button
                            @click="selectedTag = null"
                            :class="['text-xs px-2 py-0.5 rounded border transition-colors', selectedTag === null ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200']"
                        >All</button>
                        <button
                            v-for="tag in allTags"
                            :key="tag"
                            @click="selectedTag = selectedTag === tag ? null : tag"
                            :class="['text-xs px-2 py-0.5 rounded border transition-colors', selectedTag === tag ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200']"
                        >{{ tag }}</button>
                    </div>
                </div>

                <div v-if="loadingList" class="text-sm text-gray-500">Loading...</div>
                <div v-else-if="listError" class="text-sm text-red-600">{{ listError }}</div>
                <ul v-else class="divide-y">
                    <li v-for="song in filteredSongs" :key="song.id" class="py-3 space-y-1.5">
                        <div class="flex justify-between items-start gap-4">
                            <div class="space-y-0.5 min-w-0">
                                <div class="font-medium text-sm">{{ song.title }}</div>
                                <div class="text-xs text-gray-500">{{ song.artist }}</div>
                                <div class="text-xs text-gray-400">{{ song.duration }}s · {{ song.difficulty }}</div>
                                <div v-if="song.description" class="text-xs text-gray-500 italic truncate">{{ song.description }}</div>
                                <div v-if="song.tags.length" class="flex gap-1 flex-wrap mt-1">
                                    <span
                                        v-for="tag in song.tags"
                                        :key="tag.id"
                                        class="text-xs bg-gray-100 px-2 py-0.5 rounded"
                                    >{{ tag.name }}</span>
                                </div>
                            </div>
                            <div class="flex items-center gap-3 shrink-0">
                                <button
                                    v-if="!audioUrls[song.id]"
                                    @click="loadAudioUrl(song.id)"
                                    class="text-xs text-indigo-600 hover:underline"
                                >▶ Play</button>
                                <button
                                    @click="deleteSong(song.id)"
                                    class="text-sm text-red-500 hover:underline"
                                >Delete</button>
                            </div>
                        </div>
                        <audio
                            v-if="audioUrls[song.id]"
                            :src="audioUrls[song.id]"
                            controls
                            autoplay
                            class="w-full h-8"
                        />
                    </li>
                </ul>
            </div>
        </div>

    </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAdminAuth } from '../composables/useAdminAuth.js';

const { isAuthenticated, tryLogin, logout, apiFetch } = useAdminAuth();

const passwordInput = ref('');
const loginError = ref(null);
const loggingIn = ref(false);

const songs = ref([]);
const loadingList = ref(false);
const listError = ref(null);

const filterText = ref('');
const selectedTag = ref(null);
const audioUrls = ref({});

const allTags = computed(() => {
    const seen = new Set();
    const tags = [];
    for (const song of songs.value) {
        for (const tag of song.tags) {
            if (!seen.has(tag.name)) {
                seen.add(tag.name);
                tags.push(tag.name);
            }
        }
    }
    return tags.sort();
});

const filteredSongs = computed(() => {
    const text = filterText.value.toLowerCase();
    return songs.value.filter(song => {
        const matchesText = !text || song.title.toLowerCase().includes(text);
        const matchesTag = !selectedTag.value || song.tags.some(t => t.name === selectedTag.value);
        return matchesText && matchesTag;
    });
});

async function loadAudioUrl(songId) {
    if (audioUrls.value[songId]) return;
    try {
        const res = await apiFetch(`/api/admin/songs/${songId}/audio-url`);
        if (!res.ok) return;
        const data = await res.json();
        audioUrls.value = { ...audioUrls.value, [songId]: data.url };
    } catch (e) {
        // ignore
    }
}

const form = ref({ title: '', artist: '', description: '', lyrics: '', tags: '' });
const selectedFile = ref(null);
const uploading = ref(false);
const uploadError = ref(null);
const uploadSuccess = ref(false);

async function handleLogin() {
    loginError.value = null;
    if (!passwordInput.value) {
        loginError.value = 'Password required';
        return;
    }
    loggingIn.value = true;
    try {
        const data = await tryLogin(passwordInput.value);
        songs.value = data;
    } catch (e) {
        loginError.value = e.message;
    } finally {
        loggingIn.value = false;
    }
}

function handleFileSelect(e) {
    selectedFile.value = e.target.files[0] || null;
}

async function loadSongs() {
    loadingList.value = true;
    listError.value = null;
    try {
        const res = await apiFetch('/api/admin/songs');
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to load songs');
        }
        songs.value = await res.json();
    } catch (e) {
        if (e.message !== 'Authentication failed') {
            listError.value = e.message;
        } else {
            loginError.value = 'Wrong password';
        }
    } finally {
        loadingList.value = false;
    }
}

async function uploadSong() {
    uploadError.value = null;
    uploadSuccess.value = false;
    uploading.value = true;

    try {
        const fd = new FormData();
        fd.append('title', form.value.title);
        fd.append('artist', form.value.artist);
        if (form.value.description) fd.append('description', form.value.description);
        if (form.value.lyrics) fd.append('lyrics', form.value.lyrics);
        if (form.value.tags) fd.append('tags', form.value.tags);
        fd.append('audio', selectedFile.value);

        const res = await apiFetch('/api/admin/songs', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');

        uploadSuccess.value = true;
        form.value = { title: '', artist: '', description: '', lyrics: '', tags: '' };
        selectedFile.value = null;
        await loadSongs();
    } catch (e) {
        if (e.message !== 'Authentication failed') uploadError.value = e.message;
    } finally {
        uploading.value = false;
    }
}

async function deleteSong(id) {
    if (!confirm('Delete this song? This cannot be undone.')) return;
    try {
        const res = await apiFetch(`/api/admin/songs/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Delete failed');
        }
        await loadSongs();
    } catch (e) {
        if (e.message !== 'Authentication failed') listError.value = e.message;
    }
}

onMounted(() => {
    if (isAuthenticated.value) loadSongs();
});
</script>

<style scoped>
/*
  html/body have overflow:hidden for the game views.
  The admin page needs normal document scrolling, so we make
  its root fill the viewport and scroll independently.
*/
.admin-scroll-root {
  position: fixed;
  inset: 0;
  overflow-y: auto;
  max-width: none;
  padding: 24px;
}

/* Re-apply the max-width centering inside the scrollable container */
.admin-scroll-root > * {
  max-width: 48rem; /* 3xl */
  margin-left: auto;
  margin-right: auto;
}
</style>
