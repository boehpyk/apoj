<template>
  <Teleport to="body">
    <Transition name="htp-fade">
      <div v-if="modelValue" class="htp-backdrop" @click.self="$emit('update:modelValue', false)">
        <div class="htp-modal" role="dialog" aria-modal="true" aria-label="How to play">

          <!-- Header -->
          <div class="htp-header">
            <div class="htp-title">How to Play</div>
            <button class="htp-close" @click="$emit('update:modelValue', false)" aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <!-- Tab switcher -->
          <div class="htp-tabs">
            <button
              class="htp-tab"
              :class="{ active: tab === 'classic' }"
              @click="tab = 'classic'"
            >Classic</button>
            <button
              class="htp-tab"
              :class="{ active: tab === 'party' }"
              @click="tab = 'party'"
            >Party</button>
          </div>

          <!-- Classic mode rules -->
          <div v-if="tab === 'classic'" class="htp-body">
            <p class="htp-intro">Every player records their own clue. Everyone guesses on their own schedule.</p>

            <ol class="htp-steps">
              <li>
                <span class="step-num">1</span>
                <div>
                  <strong>Sing your snippet</strong>
                  <p>Each player gets a random song. Record yourself singing it — 10 to 40 seconds.</p>
                </div>
              </li>
              <li>
                <span class="step-num">2</span>
                <div>
                  <strong>Receive a mystery clip</strong>
                  <p>Your recording is reversed and secretly handed to another player. You get someone else's reversed clip.</p>
                </div>
              </li>
              <li>
                <span class="step-num">3</span>
                <div>
                  <strong>Imitate the chaos</strong>
                  <p>Listen to your reversed clip and record yourself copying it as accurately as you can.</p>
                </div>
              </li>
              <li>
                <span class="step-num">4</span>
                <div>
                  <strong>The final clue</strong>
                  <p>Your imitation is reversed again — producing a garbled echo of the original. That's the clue everyone hears.</p>
                </div>
              </li>
              <li>
                <span class="step-num">5</span>
                <div>
                  <strong>Guess independently</strong>
                  <p>All clues appear at once. You have <em>60 seconds per clue</em> — the timer starts the moment you press play. Guess the song title and, for bonus points, the artist.</p>
                </div>
              </li>
            </ol>

            <div class="htp-scoring">
              <div class="htp-scoring-title">Scoring</div>
              <div class="htp-score-row">
                <span class="score-label">Title accuracy</span>
                <span class="score-val">up to <strong>100 pts</strong></span>
              </div>
              <div class="htp-score-row">
                <span class="score-label">Speed bonus</span>
                <span class="score-val"><strong>+25</strong> under 30s&nbsp;·&nbsp;<strong>+15</strong> under 45s</span>
              </div>
              <div class="htp-score-row">
                <span class="score-label">Correct artist</span>
                <span class="score-val"><strong>+30 pts</strong></span>
              </div>
              <div class="htp-score-max">Max 155 pts per clue</div>
            </div>
          </div>

          <!-- Party mode rules -->
          <div v-if="tab === 'party'" class="htp-body">
            <p class="htp-intro">Same recording flow — but the host runs the guessing phase like a game show.</p>

            <ol class="htp-steps">
              <li>
                <span class="step-num">1</span>
                <div>
                  <strong>Recording works the same</strong>
                  <p>Players sing, clips get reversed, someone else imitates, that's reversed again. Identical to Classic.</p>
                </div>
              </li>
              <li>
                <span class="step-num">2</span>
                <div>
                  <strong>Host takes the stage</strong>
                  <p>Instead of everyone going at their own pace, the host reveals one clue at a time using Prev / Next controls.</p>
                </div>
              </li>
              <li>
                <span class="step-num">3</span>
                <div>
                  <strong>Synchronized audio</strong>
                  <p>When the host plays or pauses a clip, it syncs across every screen in real time — perfect for playing on a shared TV or stream.</p>
                </div>
              </li>
              <li>
                <span class="step-num">4</span>
                <div>
                  <strong>Guess along</strong>
                  <p>Fill in your answer for whichever clue the host is currently showing. You can revise it until the host moves to the next one.</p>
                </div>
              </li>
              <li>
                <span class="step-num">5</span>
                <div>
                  <strong>Host ends guessing</strong>
                  <p>When the host clicks <em>"End Guessing"</em>, everyone gets 5 seconds to submit any pending answers. Then scoring begins.</p>
                </div>
              </li>
            </ol>

            <div class="htp-scoring">
              <div class="htp-scoring-title">Scoring</div>
              <div class="htp-score-row">
                <span class="score-label">Same formula as Classic</span>
                <span class="score-val">up to <strong>155 pts</strong> per clue</span>
              </div>
              <div class="htp-tip">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
                Best played with a big screen and a rowdy crowd.
              </div>
            </div>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);

const tab = ref('classic');

watch(() => props.modelValue, (open) => {
  if (open) tab.value = 'classic';
});

function onKey(e) {
  if (e.key === 'Escape' && props.modelValue) emit('update:modelValue', false);
}

onMounted(() => document.addEventListener('keydown', onKey));
onUnmounted(() => document.removeEventListener('keydown', onKey));
</script>

<style scoped>
/* ── Backdrop ───────────────────────────────────────────── */
.htp-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(7, 2, 15, 0.82);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

/* ── Modal card ─────────────────────────────────────────── */
.htp-modal {
  width: 100%;
  max-width: 560px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  background: rgb(14, 4, 32);
  border: 2px solid rgb(58, 27, 92);
  border-radius: 20px;
  box-shadow:
    rgba(255, 47, 135, 0.2) 0 0 40px,
    rgba(0, 0, 0, 0.6) 0 24px 60px;
  overflow: hidden;
}

/* ── Header ─────────────────────────────────────────────── */
.htp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid rgba(58, 27, 92, 0.6);
  flex-shrink: 0;
}

.htp-title {
  font-family: "Bowlby One SC", "Bowlby One", Impact, sans-serif;
  font-size: 20px;
  letter-spacing: 1px;
  color: #FFF5DC;
}

.htp-close {
  background: transparent;
  border: none;
  color: rgba(255, 245, 220, 0.5);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  transition: color 0.12s, background 0.12s;
  line-height: 0;
}
.htp-close:hover {
  color: #FFF5DC;
  background: rgba(255, 255, 255, 0.06);
}

/* ── Tabs ───────────────────────────────────────────────── */
.htp-tabs {
  display: flex;
  gap: 0;
  padding: 12px 24px 0;
  flex-shrink: 0;
}

.htp-tab {
  padding: 8px 20px;
  border: none;
  background: transparent;
  color: rgba(255, 245, 220, 0.45);
  font-family: "Bowlby One SC", "Bowlby One", Impact, sans-serif;
  font-size: 13px;
  letter-spacing: 1.5px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.12s, border-color 0.12s;
  text-transform: uppercase;
}
.htp-tab.active {
  color: #FF2F87;
  border-bottom-color: #FF2F87;
}
.htp-tab:not(.active):hover {
  color: rgba(255, 245, 220, 0.75);
}

/* ── Scrollable body ────────────────────────────────────── */
.htp-body {
  overflow-y: auto;
  padding: 20px 24px 24px;
  scrollbar-width: thin;
  scrollbar-color: rgba(58, 27, 92, 0.8) transparent;
}

.htp-intro {
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 14px;
  color: rgba(255, 245, 220, 0.6);
  margin: 0 0 20px;
  line-height: 1.5;
}

/* ── Steps list ─────────────────────────────────────────── */
.htp-steps {
  list-style: none;
  margin: 0 0 24px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.htp-steps li {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.step-num {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(255, 47, 135, 0.15);
  border: 1.5px solid rgba(255, 47, 135, 0.4);
  color: #FF2F87;
  font-family: "Bowlby One SC", "Bowlby One", Impact, sans-serif;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 1px;
}

.htp-steps li div {
  flex: 1;
}

.htp-steps strong {
  display: block;
  font-family: "Bowlby One SC", "Bowlby One", Impact, sans-serif;
  font-size: 13px;
  letter-spacing: 0.5px;
  color: #FFF5DC;
  margin-bottom: 3px;
}

.htp-steps p {
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 13px;
  color: rgba(255, 245, 220, 0.6);
  margin: 0;
  line-height: 1.5;
}

.htp-steps em {
  color: #3FD0C9;
  font-style: normal;
}

/* ── Scoring box ────────────────────────────────────────── */
.htp-scoring {
  background: rgba(24, 10, 46, 0.7);
  border: 1px solid rgba(58, 27, 92, 0.8);
  border-radius: 12px;
  padding: 14px 16px;
}

.htp-scoring-title {
  font-family: "Bowlby One SC", "Bowlby One", Impact, sans-serif;
  font-size: 11px;
  letter-spacing: 2px;
  color: #FFE066;
  text-transform: uppercase;
  margin-bottom: 10px;
}

.htp-score-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
  padding: 4px 0;
  border-bottom: 1px solid rgba(58, 27, 92, 0.4);
}
.htp-score-row:last-of-type { border-bottom: none; }

.score-label {
  color: rgba(255, 245, 220, 0.55);
  font-family: "Space Grotesk", system-ui, sans-serif;
}

.score-val {
  color: #FFF5DC;
  font-family: "Space Grotesk", system-ui, sans-serif;
  text-align: right;
}

.score-val strong { color: #FFE066; }

.htp-score-max {
  margin-top: 10px;
  font-family: "Bowlby One SC", "Bowlby One", Impact, sans-serif;
  font-size: 11px;
  letter-spacing: 1px;
  color: rgba(255, 245, 220, 0.35);
  text-transform: uppercase;
  text-align: right;
}

.htp-tip {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 12px;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 12px;
  color: #3FD0C9;
}

/* ── Transition ─────────────────────────────────────────── */
.htp-fade-enter-active,
.htp-fade-leave-active {
  transition: opacity 0.18s ease;
}
.htp-fade-enter-active .htp-modal,
.htp-fade-leave-active .htp-modal {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.htp-fade-enter-from,
.htp-fade-leave-to {
  opacity: 0;
}
.htp-fade-enter-from .htp-modal {
  transform: translateY(12px) scale(0.97);
}
.htp-fade-leave-to .htp-modal {
  transform: translateY(8px) scale(0.98);
}
</style>
