<template>
  <TheStage>
    <div class="lobby-root">

      <!-- ── Loading ──────────────────────────────────────────────── -->
      <div v-if="viewMode === 'loading'" class="state-center">
        <span class="loading-text">Loading room…</span>
      </div>

      <!-- ── Unavailable ──────────────────────────────────────────── -->
      <div v-else-if="viewMode === 'unavailable'" class="state-center">
        <div class="unavail-card">
          <p class="unavail-title">Room Unavailable</p>
          <p class="unavail-body">
            This room doesn't exist or the game has already started.
          </p>
          <router-link to="/" class="vr-btn-secondary unavail-link">← Go Home</router-link>
        </div>
      </div>

      <!-- ── Join form ────────────────────────────────────────────── -->
      <div v-else-if="viewMode === 'join'" class="state-center">
        <div class="join-card">
          <label class="vr-label">Join Room</label>
          <p class="join-code">{{ roomCode }}</p>
          <input
            v-model="joinName"
            class="vr-input"
            placeholder="Your name"
            maxlength="30"
            @keyup.enter="joinRoom"
          />
          <p v-if="joinError" class="join-error">{{ joinError }}</p>
          <button
            class="vr-btn-primary join-btn"
            :disabled="joinName.length < 3 || joining"
            @click="joinRoom"
          >{{ joining ? 'Joining…' : 'Join Game' }}</button>
        </div>
      </div>

      <!-- ── Lobby (authenticated) ────────────────────────────────── -->
      <div v-else-if="viewMode === 'room'" class="lobby-inner">

        <!-- Header -->
        <header class="lobby-header">
          <div class="header-brand">
            <svg viewBox="0 0 32 32" width="28" height="28" fill="none" class="header-logo-svg">
              <circle cx="16" cy="16" r="15" stroke="#FFE066" stroke-width="1.5" opacity="0.6"/>
              <circle cx="16" cy="16" r="9"  fill="#FF2F87" opacity="0.85"/>
              <circle cx="16" cy="16" r="3"  fill="#07020F"/>
              <circle cx="16" cy="16" r="13" fill="none" stroke="rgba(255,224,102,.3)" stroke-width="1"/>
              <circle cx="16" cy="16" r="11" fill="none" stroke="rgba(255,224,102,.2)" stroke-width="1"/>
            </svg>
            <span class="header-title">VERSE REVERSE</span>
          </div>
          <div class="header-room">
            <span class="room-label">Room</span>
            <span class="room-code">{{ roomCode }}</span>
            <button class="vr-btn-secondary copy-btn" @click="copyCode">Copy Room Link</button>
          </div>
        </header>

        <!-- Main grid -->
        <main class="lobby-grid">

          <!-- ── LEFT: The Green Room ──────────────────────────────── -->
          <section class="col-stage">
            <div class="stage-heading">
              <span class="stage-title">THE GREEN ROOM</span>
              <span class="stage-subtitle">waiting for the warm-up</span>
            </div>

            <div class="green-room">
              <!-- Animated indicator dots -->
              <div class="stage-dots">
                <span
                  v-for="i in 10"
                  :key="i"
                  class="stage-dot"
                  :style="{ animationDelay: ((i - 1) * 0.08) + 's' }"
                ></span>
              </div>

              <!-- On stage label -->
              <div class="on-stage-label">♪ ON STAGE ♪</div>

              <!-- Player list -->
              <div class="player-list">
                <div v-if="players.length === 0" class="empty-stage">
                  Waiting for players…
                </div>
                <div
                  v-for="p in players"
                  :key="p.id"
                  class="player-row"
                  :class="{ 'player-you': p.id === playerId }"
                >
                  <span class="player-name">{{ p.name }}</span>
                  <div class="player-badges">
                    <span v-if="p.id === hostId" class="badge badge-host">HOST</span>
                    <span v-if="p.id === playerId" class="badge badge-you">YOU</span>
                  </div>
                </div>
                <div v-if="players.length === 1" class="need-more">
                  Need at least one more player…
                </div>
              </div>
            </div>
          </section>

          <!-- ── RIGHT: Controls ───────────────────────────────────── -->
          <section class="col-controls">

            <!-- Game mode (host only) -->
            <div v-if="isHost" class="mode-section">
              <span class="vr-label">Guessing Mode</span>
              <div class="mode-cards">
                <div
                  class="mode-card"
                  :class="{ active: gameMode === 'public' }"
                  @click="gameMode = 'public'"
                >
                  <div class="mode-card-title">Party Mode</div>
                  <div class="mode-card-desc">Host controls playback on a shared screen</div>
                </div>
                <div
                  class="mode-card"
                  :class="{ active: gameMode === 'private' }"
                  @click="gameMode = 'private'"
                >
                  <div class="mode-card-title">Classic</div>
                  <div class="mode-card-desc">Everyone guesses privately with a timer</div>
                </div>
              </div>
            </div>

            <!-- Mic check -->
            <div class="mic-check-section">
              <button v-if="micCheckState === 'idle'" class="mic-check-toggle" @click="startMicCheck">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                  <path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2z"/>
                </svg>
                Check your microphone
              </button>
              <div v-else class="mic-check-panel">
                <div class="mic-check-header">
                  <span class="mic-check-label">Mic Check</span>
                  <button class="mic-check-close" @click="closeMicCheck">✕</button>
                </div>
                <template v-if="micCheckState === 'recording'">
                  <div class="mic-check-waveform">
                    <div
                      v-for="(h, i) in micWaveHeights"
                      :key="i"
                      class="wbar wbar--live"
                      :style="{ animationDelay: (i * 0.04) + 's' }"
                    ></div>
                  </div>
                  <div class="mic-rec-row">
                    <span class="mic-rec-dot">●</span>
                    <span class="mic-timer">{{ micTimeLabel }}</span>
                    <button class="mic-stop-btn" @click="stopMicCheck">■ Stop</button>
                  </div>
                </template>
                <template v-if="micCheckState === 'playback'">
                  <audio
                    ref="micCheckAudioEl"
                    :src="micCheckBlobUrl || undefined"
                    style="display:none"
                    @ended="micCheckIsPlaying = false"
                  />
                  <div class="mic-playback-row">
                    <button class="mic-play-btn" @click="toggleMicPlayback">
                      {{ micCheckIsPlaying ? '⏸ Pause' : '▶ Play back' }}
                    </button>
                    <button class="mic-retry-btn" @click="retryMicCheck">↺ Again</button>
                  </div>
                </template>
              </div>
            </div>

            <!-- Start / Wait area -->
            <div class="start-area">
              <template v-if="isHost">
                <button
                  class="start-btn"
                  :class="{ disabled: players.length < 2 || starting }"
                  :disabled="players.length < 2 || starting"
                  @click="startGame"
                >
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                  {{ starting ? 'Starting…' : 'Start the Show' }}
                </button>
                <p v-if="startError" class="start-error">{{ startError }}</p>
                <p class="start-hint">
                  Only the host can start · need at least 2 (3+ is more fun)
                </p>
              </template>
              <template v-else>
                <p class="waiting-msg">Waiting for the host to start the show…</p>
                <p class="start-hint">The host needs at least 2 players to begin.</p>
              </template>
            </div>


          </section>

        </main>
      </div>

    </div>
  </TheStage>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSocket } from '../composables/useSocket.js';
import { useAudioRecorder } from '../composables/useAudioRecorder.js';
import TheStage from '@/components/ui/TheStage.vue';

const route = useRoute();
const router = useRouter();
const roomCode = route.params.code;
const playerId = sessionStorage.getItem('playerId');
const playerToken = sessionStorage.getItem('playerToken');

const viewMode      = ref('loading'); // 'loading' | 'join' | 'unavailable' | 'room'
const joinName      = ref('');
const joining       = ref(false);
const joinError     = ref(null);
const error         = ref(null);
const players       = ref([]);
const hostId        = ref(null);
const roomStatus    = ref(null);
const starting      = ref(false);
const startError    = ref(null);
const gameMode      = ref('private');

const isHost = computed(() => hostId.value && playerId === hostId.value);
const { socket, connected, events, off } = useSocket(roomCode, playerId);
const socketStatus = computed(() => connected.value ? 'ws ok' : 'ws...');

// ── Mic check ────────────────────────────────────────────────────────
const { isRecording: micIsRecording, start: micRecStart, stop: micRecStop } = useAudioRecorder();
const micCheckState     = ref('idle'); // 'idle' | 'recording' | 'playback'
const micCheckBlobUrl   = ref(null);
const micCheckAudioEl   = ref(null);
const micCheckIsPlaying = ref(false);
const micCheckSeconds   = ref(0);
let   micTimerInterval  = null;

const micTimeLabel = computed(() => {
  const s = micCheckSeconds.value;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
});

const micWaveHeights = [
  27, 34, 55, 42, 62, 48, 71, 55, 39, 77, 64,
  52, 83, 61, 74, 58, 82, 69, 91, 64, 45, 58, 76,
];

async function startMicCheck() {
  await micRecStart();
  micCheckSeconds.value = 0;
  micTimerInterval = setInterval(() => micCheckSeconds.value++, 1000);
  micCheckState.value = 'recording';
}

async function stopMicCheck() {
  clearInterval(micTimerInterval);
  micTimerInterval = null;
  const blob = await micRecStop();
  if (micCheckBlobUrl.value) URL.revokeObjectURL(micCheckBlobUrl.value);
  micCheckBlobUrl.value   = URL.createObjectURL(blob);
  micCheckIsPlaying.value = false;
  micCheckState.value     = 'playback';
}

function toggleMicPlayback() {
  const el = micCheckAudioEl.value;
  if (!el) return;
  if (micCheckIsPlaying.value) {
    el.pause();
    micCheckIsPlaying.value = false;
  } else {
    el.play();
    micCheckIsPlaying.value = true;
  }
}

async function retryMicCheck() {
  if (micCheckBlobUrl.value) {
    URL.revokeObjectURL(micCheckBlobUrl.value);
    micCheckBlobUrl.value = null;
  }
  micCheckIsPlaying.value = false;
  await startMicCheck();
}

function closeMicCheck() {
  if (micIsRecording.value) micRecStop();
  clearInterval(micTimerInterval);
  micTimerInterval = null;
  if (micCheckBlobUrl.value) {
    URL.revokeObjectURL(micCheckBlobUrl.value);
    micCheckBlobUrl.value = null;
  }
  micCheckIsPlaying.value = false;
  micCheckState.value     = 'idle';
}

// Store handler references for cleanup
const handlers = {};

async function fetchState() {
  try {
    const res = await fetch(`/api/rooms/${roomCode}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    players.value    = data.players || [];
    hostId.value     = data.hostId;
    roomStatus.value = data.status;
    error.value      = null;
    return data;
  } catch (e) {
    error.value = e.message;
    return null;
  }
}

function copyCode() {
  navigator.clipboard.writeText(window.location.href).catch(() => {});
}

async function joinRoom() {
  joining.value   = true;
  joinError.value = null;
  try {
    const res = await fetch(`/api/rooms/${roomCode}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName: joinName.value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to join');
    sessionStorage.setItem('playerId',    data.playerId);
    sessionStorage.setItem('playerToken', data.playerToken);
    sessionStorage.setItem('roomCode',    data.roomCode);
    window.location.reload();
  } catch (e) {
    joinError.value = e.message;
  } finally {
    joining.value = false;
  }
}

async function startGame() {
  if (players.value.length < 2) return;
  if (!isHost.value) return;

  starting.value  = true;
  startError.value = null;
  try {
    const res  = await fetch(`/api/rooms/${roomCode}/start`, {
      method: 'POST',
      headers: {
        'x-player-token': playerToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ mode: gameMode.value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
  } catch (e) {
    startError.value = e.message;
  } finally {
    starting.value = false;
  }
}

function applyRoomState(state) {
  if (!state) return;
  players.value = state.players || [];
  hostId.value  = state.hostId;
}

onMounted(async () => {
  const data = await fetchState();

  if (!data) {
    viewMode.value = 'unavailable';
    return;
  }

  const isInRoom = playerId && (data.players || []).some(p => p.id === playerId);
  if (isInRoom) {
    viewMode.value = 'room';
  } else if (data.status === 'waiting') {
    viewMode.value = 'join';
  } else {
    viewMode.value = 'unavailable';
    return;
  }

  handlers.roomUpdated = (state) => { applyRoomState(state); };
  handlers.playerJoined = () => {};
  handlers.playerLeft   = () => {};
  handlers.gameStarted  = () => { router.push(`/game/${roomCode}`); };

  socket.value?.on?.(events.ROOM_UPDATED,  handlers.roomUpdated);
  socket.value?.on?.(events.PLAYER_JOINED, handlers.playerJoined);
  socket.value?.on?.(events.PLAYER_LEFT,   handlers.playerLeft);
  socket.value?.on?.(events.GAME_STARTED,  handlers.gameStarted);
});

onBeforeUnmount(() => {
  closeMicCheck();
  if (socket.value) {
    socket.value.off(events.ROOM_UPDATED,  handlers.roomUpdated);
    socket.value.off(events.PLAYER_JOINED, handlers.playerJoined);
    socket.value.off(events.PLAYER_LEFT,   handlers.playerLeft);
    socket.value.off(events.GAME_STARTED,  handlers.gameStarted);
  }
});
</script>

<style scoped>
/* ── Root ────────────────────────────────────────────────────────── */
.lobby-root {
  position: absolute;
  inset: 0;
  padding-bottom: 56px; /* clear TheStage status bar */
  display: flex;
  flex-direction: column;
}

/* ── Loading / unavailable / join centered states ────────────────── */
.state-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-text {
  font-family: var(--vr-font-mono);
  font-size: 14px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--vr-cream-dim);
  animation: vr-pulse 2s ease infinite;
}

/* Unavailable card */
.unavail-card {
  background: var(--vr-panel);
  border: 1.5px solid var(--vr-border);
  border-radius: 20px;
  padding: 40px 48px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  max-width: 420px;
}

.unavail-title {
  font-family: var(--vr-font-ui);
  font-size: 24px;
  letter-spacing: 0.5px;
  color: var(--vr-pink);
}

.unavail-body {
  font-size: 14px;
  color: var(--vr-cream-dim);
  line-height: 1.6;
}

.unavail-link {
  margin-top: 8px;
  font-size: 13px;
}

/* Join card */
.join-card {
  background: var(--vr-panel);
  border: 1.5px solid var(--vr-border);
  border-radius: 20px;
  padding: 40px 48px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 360px;
  max-width: 460px;
}

.join-code {
  font-family: var(--vr-font-mono);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 4px;
  color: var(--vr-gold);
  text-shadow: 0 0 12px rgba(255,224,102,.5);
  margin: -4px 0 4px;
}

.join-error {
  font-size: 13px;
  color: var(--vr-pink);
  margin: -4px 0;
}

.join-btn {
  width: 100%;
  justify-content: center;
}

/* ── Lobby inner (authenticated) ─────────────────────────────────── */
.lobby-inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.lobby-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32px;
  height: 68px;
  flex-shrink: 0;
  background: linear-gradient(180deg, rgb(14,4,32) 0%, rgb(24,10,46) 100%);
  border-bottom: 2px solid rgb(58,27,92);
  position: relative;
  z-index: 2;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-logo-svg {
  flex-shrink: 0;
}

.header-title {
  font-family: var(--vr-font-title);
  font-size: 22px;
  letter-spacing: 2px;
  color: var(--vr-gold);
  text-shadow:
    0 0 4px  var(--vr-gold),
    0 0 14px #FFC400,
    0 0 28px #FF8A00,
    0 0 60px rgba(255,196,0,.55);
}

.header-room {
  display: flex;
  align-items: center;
  gap: 12px;
}

.room-label {
  font-family: var(--vr-font-mono);
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--vr-cream-faint);
}

.room-code {
  font-family: var(--vr-font-mono);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 3px;
  color: var(--vr-gold);
  text-shadow: 0 0 10px rgba(255,224,102,.5);
  padding: 4px 14px;
  background: rgba(255,224,102,.08);
  border: 1.5px solid rgba(255,224,102,.3);
  border-radius: 8px;
}

.copy-btn {
  font-size: 12px;
  padding: 6px 16px;
}

/* Main grid */
.lobby-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 32px;
  padding: 24px 32px 16px;
  overflow: hidden;
}

/* ── Left column ─────────────────────────────────────────────────── */
.col-stage {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.stage-heading {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.stage-title {
  font-family: var(--vr-font-ui);
  font-size: 13px;
  letter-spacing: 2px;
  color: var(--vr-cream);
}

.stage-subtitle {
  font-size: 12px;
  color: var(--vr-cream-faint);
  font-style: italic;
}

/* Gold-bordered stage box */
.green-room {
  flex: 1;
  background: rgb(36,18,71);
  border: 4px solid var(--vr-gold);
  border-radius: 28px;
  box-shadow:
    0 0 0 1px rgba(255,224,102,.12),
    0 0 32px rgba(255,224,102,.12),
    0 0 64px rgba(255,224,102,.06),
    inset 0 0 40px rgba(58,27,92,.6);
  padding: 22px 26px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 30px;
  overflow: hidden;
}

/* Indicator dots */
.stage-dots {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.stage-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--vr-gold);
  box-shadow: 0 0 8px var(--vr-gold), 0 0 16px rgba(255,224,102,.4);
  animation: vr-marquee-blink 1.6s ease infinite;
}

/* On Stage label */
.on-stage-label {
  text-align: center;
  font-family: var(--vr-font-ui);
  font-size: 18px;
  letter-spacing: 2px;
  color: var(--vr-teal);
  text-shadow: 0 0 12px rgba(63,208,201,.5);
}

/* Player list */
.player-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}

.empty-stage,
.need-more {
  font-size: 13px;
  color: var(--vr-cream-faint);
  font-style: italic;
  text-align: center;
  padding: 8px 0;
}

.need-more {
  margin-top: 4px;
}

.player-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: rgba(24,10,46,.7);
  border: 1.5px solid rgba(58,27,92,.8);
  border-radius: 12px;
  transition: border-color 0.15s;
}

.player-row.player-you {
  border-color: rgba(255,224,102,.35);
  background: rgba(255,224,102,.06);
}

.player-name {
  font-family: var(--vr-font-ui);
  font-size: 15px;
  letter-spacing: 0.5px;
  color: var(--vr-cream);
}

.player-badges {
  display: flex;
  gap: 6px;
}

.badge {
  font-family: var(--vr-font-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 6px;
}

.badge-host {
  background: rgba(255,47,135,.15);
  border: 1px solid rgba(255,47,135,.5);
  color: var(--vr-pink);
}

.badge-you {
  background: rgba(255,224,102,.12);
  border: 1px solid rgba(255,224,102,.4);
  color: var(--vr-gold);
}

/* ── Right column ────────────────────────────────────────────────── */
.col-controls {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-top: 4px;
}

/* Mode cards */
.mode-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mode-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mode-card {
  padding: 12px 16px;
  border-radius: 14px;
  border: 1.5px solid var(--vr-border);
  background: var(--vr-panel);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.mode-card:hover {
  border-color: rgba(255,224,102,.3);
}

.mode-card.active {
  border-color: var(--vr-gold);
  background: rgba(255,224,102,.08);
}

.mode-card-title {
  font-family: var(--vr-font-ui);
  font-size: 13px;
  letter-spacing: 0.5px;
  color: var(--vr-cream);
  margin-bottom: 3px;
}

.mode-card.active .mode-card-title {
  color: var(--vr-gold);
}

.mode-card-desc {
  font-size: 12px;
  color: var(--vr-cream-faint);
  line-height: 1.4;
}

/* Start area */
.start-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
}

.start-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--vr-font-ui);
  font-size: 22px;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: rgb(14,4,32);
  background: var(--vr-gold);
  border: none;
  border-radius: 20px;
  padding: 22px 40px;
  cursor: pointer;
  box-shadow:
    rgb(181,136,0) 0 6px 0,
    rgba(0,0,0,.25) 0 10px 24px;
  transition: transform 0.12s cubic-bezier(0.4,0,0.2,1),
              box-shadow 0.12s,
              filter 0.12s;
  width: 100%;
  justify-content: center;
}

.start-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow:
    rgb(181,136,0) 0 8px 0,
    rgba(0,0,0,.3) 0 14px 28px;
  filter: brightness(1.08);
}

.start-btn:active:not(:disabled) {
  transform: translateY(4px);
  box-shadow:
    rgb(181,136,0) 0 2px 0,
    rgba(0,0,0,.2) 0 4px 12px;
}

.start-btn.disabled,
.start-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.start-error {
  font-family: var(--vr-font-mono);
  font-size: 12px;
  color: var(--vr-pink);
  text-align: center;
  max-width: 280px;
  line-height: 1.4;
}

.start-hint {
  font-size: 12px;
  color: rgba(255,245,220,.4);
  text-align: center;
  line-height: 1.5;
  max-width: 260px;
}

.waiting-msg {
  font-family: var(--vr-font-ui);
  font-size: 16px;
  letter-spacing: 0.5px;
  color: var(--vr-cream-dim);
  text-align: center;
}

/* ── Mic check ───────────────────────────────────────────────────── */
.mic-check-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 16px;
  background: var(--vr-panel);
  border: 1.5px solid var(--vr-border);
  border-radius: 14px;
  font-family: var(--vr-font-ui);
  font-size: 13px;
  letter-spacing: 0.4px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.mic-check-toggle:hover {
  border-color: rgba(63,208,201,.4);
  color: var(--vr-teal);
}

.mic-check-panel {
  background: var(--vr-panel);
  border: 1.5px solid rgba(63,208,201,.3);
  border-radius: 14px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mic-check-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.mic-check-label {
  font-family: var(--vr-font-mono);
  font-size: 10px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--vr-teal);
}

.mic-check-close {
  background: none;
  border: none;
  color: var(--vr-cream-faint);
  font-size: 14px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
  transition: color 0.12s;
}

.mic-check-close:hover { color: var(--vr-cream); }

.mic-check-waveform {
  height: 36px;
  display: flex;
  align-items: center;
  gap: 3px;
}

.mic-check-waveform .wbar {
  flex: 1 1 0;
  background: var(--vr-teal);
  border-radius: 3px;
  box-shadow: rgba(63,208,201,.5) 0 0 5px;
  min-height: 4px;
  transform-origin: 50% 50%;
}

.mic-rec-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mic-rec-dot {
  color: var(--vr-pink);
  font-size: 10px;
  animation: vr-pulse 1s ease infinite;
}

.mic-timer {
  font-family: var(--vr-font-mono);
  font-size: 14px;
  color: var(--vr-cream-dim);
  flex: 1;
}

.mic-stop-btn {
  font-family: var(--vr-font-mono);
  font-size: 11px;
  letter-spacing: 1px;
  padding: 7px 16px;
  background: rgba(255,47,135,.12);
  border: 1.5px solid rgba(255,47,135,.4);
  border-radius: 10px;
  color: var(--vr-pink);
  cursor: pointer;
  transition: background 0.12s;
}

.mic-stop-btn:hover { background: rgba(255,47,135,.22); }

.mic-playback-row {
  display: flex;
  gap: 8px;
}

.mic-play-btn {
  flex: 1;
  font-family: var(--vr-font-ui);
  font-size: 13px;
  letter-spacing: 0.5px;
  padding: 10px 14px;
  background: rgba(63,208,201,.12);
  border: 1.5px solid rgba(63,208,201,.4);
  border-radius: 10px;
  color: var(--vr-teal);
  cursor: pointer;
  transition: background 0.12s;
}

.mic-play-btn:hover { background: rgba(63,208,201,.22); }

.mic-retry-btn {
  font-family: var(--vr-font-ui);
  font-size: 12px;
  padding: 10px 14px;
  background: var(--vr-panel);
  border: 1.5px solid var(--vr-border);
  border-radius: 10px;
  color: var(--vr-cream-faint);
  cursor: pointer;
  transition: color 0.12s, border-color 0.12s;
}

.mic-retry-btn:hover {
  color: var(--vr-cream);
  border-color: rgba(255,255,255,.25);
}

</style>
