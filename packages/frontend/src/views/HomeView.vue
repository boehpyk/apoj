<template>
  <TheStage>

    <!-- Floating disco ball -->
    <div class="disco-ball">
      <svg viewBox="0 0 100 100" width="68" height="68">
        <defs>
          <radialGradient id="mb-bg" cx="40%" cy="35%" r="60%">
            <stop offset="0%"   stop-color="#fff"/>
            <stop offset="40%"  stop-color="#C4A8E8"/>
            <stop offset="100%" stop-color="#4A2670"/>
          </radialGradient>
        </defs>
        <!-- Hanger wire -->
        <line x1="50" y1="0" x2="50" y2="8" stroke="#FFF5DC" stroke-width="0.8"/>
        <!-- Ball -->
        <circle cx="50" cy="50" r="42" fill="url(#mb-bg)"/>
        <!-- Mirror tiles — horizontal rows -->
        <g opacity="0.85">
          <rect x="36" y="14" width="5" height="5" rx="0.5" fill="#fff" opacity="0.95"/>
          <rect x="43" y="14" width="5" height="5" rx="0.5" fill="#fff" opacity="0.88"/>
          <rect x="50" y="14" width="5" height="5" rx="0.5" fill="#fff" opacity="0.78"/>
          <rect x="57" y="14" width="5" height="5" rx="0.5" fill="#F0E6FF" opacity="0.65"/>
          <rect x="29" y="22" width="5" height="5" rx="0.5" fill="#fff" opacity="0.90"/>
          <rect x="36" y="22" width="5" height="5" rx="0.5" fill="#fff" opacity="0.95"/>
          <rect x="43" y="22" width="5" height="5" rx="0.5" fill="#fff" opacity="0.88"/>
          <rect x="50" y="22" width="5" height="5" rx="0.5" fill="#F0E6FF" opacity="0.78"/>
          <rect x="57" y="22" width="5" height="5" rx="0.5" fill="#C4A8E8" opacity="0.55"/>
          <rect x="64" y="22" width="5" height="5" rx="0.5" fill="#7A6494" opacity="0.40"/>
          <rect x="22" y="30" width="5" height="5" rx="0.5" fill="#fff" opacity="0.85"/>
          <rect x="29" y="30" width="5" height="5" rx="0.5" fill="#fff" opacity="0.92"/>
          <rect x="36" y="30" width="5" height="5" rx="0.5" fill="#fff" opacity="0.95"/>
          <rect x="43" y="30" width="5" height="5" rx="0.5" fill="#F0E6FF" opacity="0.80"/>
          <rect x="50" y="30" width="5" height="5" rx="0.5" fill="#C4A8E8" opacity="0.60"/>
          <rect x="57" y="30" width="5" height="5" rx="0.5" fill="#7A6494" opacity="0.45"/>
          <rect x="64" y="30" width="5" height="5" rx="0.5" fill="#7A6494" opacity="0.30"/>
          <rect x="71" y="30" width="5" height="5" rx="0.5" fill="#7A6494" opacity="0.20"/>
          <rect x="22" y="38" width="5" height="5" rx="0.5" fill="#F0E6FF" opacity="0.70"/>
          <rect x="29" y="38" width="5" height="5" rx="0.5" fill="#fff" opacity="0.88"/>
          <rect x="36" y="38" width="5" height="5" rx="0.5" fill="#fff" opacity="0.93"/>
          <rect x="43" y="38" width="5" height="5" rx="0.5" fill="#C4A8E8" opacity="0.72"/>
          <rect x="50" y="38" width="5" height="5" rx="0.5" fill="#7A6494" opacity="0.50"/>
          <rect x="57" y="38" width="5" height="5" rx="0.5" fill="#7A6494" opacity="0.35"/>
          <rect x="64" y="38" width="5" height="5" rx="0.5" fill="#7A6494" opacity="0.22"/>
          <rect x="71" y="38" width="5" height="5" rx="0.5" fill="#7A6494" opacity="0.15"/>
        </g>
        <!-- Equator line for depth -->
        <ellipse cx="50" cy="50" rx="42" ry="8" fill="none" stroke="rgba(255,245,220,.12)" stroke-width="1"/>
      </svg>
    </div>

    <!-- Title block -->
    <div class="title-block">
      <div class="title-verse">VERSE</div>
      <div class="title-reverse">REVERSE</div>
      <div class="tagline">
        Sing it forward ·&nbsp;
        <span class="tagline-highlight">Reproduce it backwards</span>
        &nbsp;· Guess what it is
      </div>
    </div>

    <!-- Tab switcher -->
    <div class="tab-pill">
      <button
        class="tab-btn"
        :class="{ 'tab-active': activeTab === 'create' }"
        @click="activeTab = 'create'"
      >★ New Room</button>
      <button
        class="tab-btn tab-ghost"
        :class="{ 'tab-active': activeTab === 'join' }"
        @click="activeTab = 'join'"
      >Got a Code</button>
    </div>

    <!-- Create Room card -->
    <div v-if="activeTab === 'create'" class="form-card">
      <div class="form-title">Start the show</div>
      <div class="form-subtitle">We'll mint you a six-character room code.</div>
      <div class="form-row">
        <div class="form-field">
          <label class="vr-label">Your Name</label>
          <input
            v-model="createName"
            class="vr-input"
            placeholder="DJ Stardust"
            @keydown.enter="onCreate"
          />
        </div>
        <button
          class="vr-btn-primary"
          :disabled="creating || !validName(createName)"
          @click="onCreate"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          {{ creating ? 'Creating…' : 'Create' }}
        </button>
      </div>
      <div class="form-hint">3+ chars · You'll be host.</div>
      <div v-if="createError" class="form-error">{{ createError }}</div>
    </div>

    <!-- Join Room card -->
    <div v-if="activeTab === 'join'" class="form-card form-card--join">
      <div class="form-title">Join the show</div>
      <div class="form-subtitle">Enter the room code your host shared.</div>
      <div class="form-row form-row--join">
        <div class="form-field form-field--code">
          <label class="vr-label">Room Code</label>
          <input
            v-model="joinCode"
            class="vr-input vr-input--code"
            placeholder="ABC123"
            maxlength="6"
            @input="joinCode = joinCode.toUpperCase()"
            @keydown.enter="onJoin"
          />
        </div>
        <div class="form-field">
          <label class="vr-label">Your Name</label>
          <input
            v-model="joinName"
            class="vr-input"
            placeholder="DJ Stardust"
            @keydown.enter="onJoin"
          />
        </div>
        <button
          class="vr-btn-primary"
          :disabled="joining || !validCode(joinCode) || !validName(joinName)"
          @click="onJoin"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
          {{ joining ? 'Joining…' : 'Join' }}
        </button>
      </div>
      <div class="form-hint">6-character code · letters &amp; numbers.</div>
      <div v-if="joinError" class="form-error">{{ joinError }}</div>
    </div>

    <!-- How to play button -->
    <button class="htp-trigger" @click="showRules = true">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="12" cy="12" r="10"/>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/>
      </svg>
      How to Play
    </button>

    <HowToPlayModal v-model="showRules" />

  </TheStage>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import TheStage from '@/components/ui/TheStage.vue';
import HowToPlayModal from '@/components/ui/HowToPlayModal.vue';

const router = useRouter();

const showRules  = ref(false);
const activeTab  = ref('create');
const createName = ref('');
const createError = ref(null);
const creating   = ref(false);

const joinCode  = ref('');
const joinName  = ref('');
const joinError = ref(null);
const joining   = ref(false);

function validName(n) { return (n || '').trim().length >= 3; }
function validCode(c) { return (c || '').trim().length === 6; }


async function onCreate() {
  createError.value = null;
  creating.value    = true;
  try {
    const res  = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName: createName.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    sessionStorage.setItem('playerId',   data.playerId);
    if (data.playerToken) sessionStorage.setItem('playerToken', data.playerToken);
    sessionStorage.setItem('roomCode', data.roomCode);
    await router.push(`/room/${data.roomCode}`);
  } catch (e) {
    createError.value = e.message;
  } finally {
    creating.value = false;
  }
}

async function onJoin() {
  joinError.value = null;
  joining.value   = true;
  try {
    const code = joinCode.value.toUpperCase();
    const res  = await fetch(`/api/rooms/${code}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName: joinName.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    sessionStorage.setItem('playerId',   data.playerId);
    if (data.playerToken) sessionStorage.setItem('playerToken', data.playerToken);
    sessionStorage.setItem('roomCode', data.roomCode);
    await router.push(`/room/${data.roomCode}`);
  } catch (e) {
    joinError.value = e.message;
  } finally {
    joining.value = false;
  }
}
</script>

<style scoped>
/* ── Disco ball ─────────────────────────────────────────── */
.disco-ball {
  position: absolute;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  animation: vr-float 4s ease-in-out infinite;
}

/* ── Title ──────────────────────────────────────────────── */
.title-block {
  position: absolute;
  top: 100px;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  white-space: nowrap;
}

.title-verse {
  font-family: "Monoton", "Bowlby One SC", Impact, sans-serif;
  font-size: 92px;
  line-height: 0.95;
  color: #FFE066;
  text-shadow:
    #FFE066  0 0  4px,
    #FFC400  0 0 14px,
    #FF8A00  0 0 28px,
    rgba(255,196,0,.55) 0 0 60px;
  letter-spacing: 4px;
}

.title-reverse {
  font-family: "Monoton", "Bowlby One SC", Impact, sans-serif;
  font-size: 92px;
  line-height: 0.95;
  color: #FF2F87;
  text-shadow:
    #FF7AB6  0 0  4px,
    #FF2F87  0 0 14px,
    #FF2F87  0 0 30px,
    rgba(255,47,135,.55) 0 0 60px;
  letter-spacing: 4px;
  transform: scaleX(-1);
  display: inline-block;
  margin-top: 4px;
}

.tagline {
  margin-top: 22px;
  font-family: "Bowlby One SC", "Bowlby One", Impact, sans-serif;
  font-size: 17px;
  color: #FFF5DC;
  letter-spacing: 3px;
  text-transform: uppercase;
}

.tagline-highlight { color: #3FD0C9; }

/* ── Tab pill ───────────────────────────────────────────── */
.tab-pill {
  position: absolute;
  top: 432px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
  padding: 4px;
  background: rgb(14, 4, 32);
  border: 2px solid rgb(58, 27, 92);
  border-radius: 14px;
}

.tab-btn {
  padding: 10px 22px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: rgba(255, 245, 220, 0.667);
  font-family: "Bowlby One SC", "Bowlby One", Impact, sans-serif;
  font-size: 14px;
  letter-spacing: 1.5px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.tab-btn.tab-active {
  background: #FF2F87;
  color: rgb(14, 4, 32);
}

.tab-ghost { /* secondary style when not active */ }

/* ── Form card ──────────────────────────────────────────── */
.form-card {
  position: absolute;
  top: 500px;
  left: 50%;
  transform: translateX(-50%);
  width: 520px;
  background: rgb(14, 4, 32);
  border: 3px solid #FF2F87;
  border-radius: 20px;
  box-shadow:
    rgb(24, 10, 46) 0 0 0 2px,
    rgba(255, 47, 135, 0.333) 0 0 28px,
    rgba(0, 0, 0, 0.5) 0 20px 50px;
  padding: 20px 24px 24px;
}

.form-card--join {
  width: 600px;
}

.form-title {
  font-family: "Bowlby One SC", "Bowlby One", Impact, sans-serif;
  font-size: 22px;
  color: #FFF5DC;
  letter-spacing: 0.4px;
  margin-bottom: 2px;
}

.form-subtitle {
  font-size: 12px;
  color: rgba(255, 245, 220, 0.667);
  margin-bottom: 14px;
}

.form-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}

.form-row--join {
  gap: 10px;
}

.form-field {
  flex: 1;
}

.form-field--code {
  flex: 0 0 130px;
}

.vr-input--code {
  text-transform: uppercase;
  letter-spacing: 4px;
  font-family: "JetBrains Mono", monospace;
  font-size: 18px;
  text-align: center;
}

.form-hint {
  margin-top: 14px;
  font-size: 11px;
  color: rgba(255, 245, 220, 0.4);
}

.form-error {
  margin-top: 8px;
  font-size: 12px;
  color: #FF2F87;
}

/* ── How to play trigger ────────────────────────────────── */
.htp-trigger {
  position: absolute;
  bottom: 50px;
  left: 24px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 10px 18px;
  background: rgba(255, 47, 135, 0.12);
  border: 1.5px solid rgba(255, 47, 135, 0.55);
  border-radius: 20px;
  color: rgba(255, 245, 220, 0.85);
  font-family: "Bowlby One SC", "Bowlby One", Impact, sans-serif;
  font-size: 12px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s, box-shadow 0.15s;
  box-shadow: rgba(255, 47, 135, 0.15) 0 0 14px;
}
.htp-trigger:hover {
  color: #FFF5DC;
  border-color: #FF2F87;
  background: rgba(255, 47, 135, 0.22);
  box-shadow: rgba(255, 47, 135, 0.35) 0 0 20px;
}
</style>
