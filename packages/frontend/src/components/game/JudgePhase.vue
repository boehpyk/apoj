<template>
  <div class="judge-root">

    <!-- ── "JURY IS LISTENING" badge ─────────────────────────────── -->
    <div class="jury-badge">
      <span class="jury-live-chip">● JURY IS LISTENING</span>
    </div>

    <!-- ── Central content ───────────────────────────────────────── -->
    <div class="judge-center">

      <!-- Vinyl record stage -->
      <div class="vinyl-wrapper">
        <!-- Radial orange aura glow -->
        <div class="vinyl-aura"></div>

        <!-- Outer decorative ring — spins -->
        <div class="vinyl-outer-ring">
          <svg viewBox="0 0 200 200" width="200" height="200" fill="none">
            <circle cx="100" cy="100" r="94" stroke="rgba(255,107,74,0.18)" stroke-width="2"/>
            <circle cx="100" cy="100" r="83" stroke="rgba(255,107,74,0.12)" stroke-width="1.5"/>
            <circle cx="100" cy="100" r="72" stroke="rgba(255,107,74,0.08)" stroke-width="1"/>
          </svg>
        </div>

        <!-- Main vinyl disc -->
        <div class="vinyl-disc">
          <svg viewBox="0 0 160 160" width="160" height="160">
            <!-- Groove rings -->
            <circle cx="80" cy="80" r="73" fill="none" stroke="rgba(14,4,32,0.2)"  stroke-width="2"/>
            <circle cx="80" cy="80" r="63" fill="none" stroke="rgba(14,4,32,0.16)" stroke-width="1.5"/>
            <circle cx="80" cy="80" r="53" fill="none" stroke="rgba(14,4,32,0.12)" stroke-width="1.2"/>
            <circle cx="80" cy="80" r="43" fill="none" stroke="rgba(14,4,32,0.09)" stroke-width="1"/>
            <circle cx="80" cy="80" r="33" fill="none" stroke="rgba(14,4,32,0.07)" stroke-width="1"/>
            <!-- Orange label ring -->
            <circle cx="80" cy="80" r="22" fill="rgba(255,107,74,0.25)" stroke="rgb(255,107,74)" stroke-width="1.5"/>
            <!-- Center spindle -->
            <circle cx="80" cy="80" r="7"  fill="rgb(14,4,32)"/>
            <circle cx="80" cy="80" r="3"  fill="rgb(255,107,74)"/>
            <!-- Mystery "?" -->
            <text x="80" y="72" text-anchor="middle"
                  font-family="Bowlby One SC,Impact,sans-serif"
                  font-size="11" fill="rgb(255,224,102)">?</text>
          </svg>
        </div>

        <!-- Needle arm + glowing head -->
        <div class="needle-arm"></div>
        <div class="needle-head"></div>

        <!-- Flanking teal waveform panels -->
        <div class="wave-panel wave-left">
          <div v-for="i in 4" :key="`l${i}`" class="wave-bar"
               :style="{ animationDuration: (0.70 + i * 0.13) + 's' }"></div>
        </div>
        <div class="wave-panel wave-right">
          <div v-for="i in 4" :key="`r${i}`" class="wave-bar"
               :style="{ animationDuration: (0.76 + i * 0.11) + 's' }"></div>
        </div>
      </div>

      <!-- Judge title -->
      <h2 class="judge-title">Asking the AI judge…</h2>
      <p class="judge-subtitle">
        Comparing your guesses to the originals. No appeals, no rematch —
        judge's decision is sparkly and final.
      </p>

      <!-- ── Step progress ──────────────────────────────────────── -->
      <div class="step-row">
        <template v-for="(step, idx) in STEPS" :key="step.key">
          <div class="step-item">
            <div class="step-circle"
                 :class="{
                   'step-done':    idx < currentStep,
                   'step-active':  idx === currentStep,
                   'step-pending': idx > currentStep,
                 }">
              <span v-if="idx < currentStep">✓</span>
              <span v-else>{{ idx + 1 }}</span>
            </div>
            <span class="step-label"
                  :class="{ 'label-live': idx <= currentStep, 'label-dim': idx > currentStep }">
              {{ step.label }}
            </span>
          </div>
          <div v-if="idx < STEPS.length - 1"
               class="step-connector"
               :class="{ 'connector-done': idx < currentStep }"></div>
        </template>
      </div>

    </div><!-- /judge-center -->

    <!-- ── Decorative dot marquee ─────────────────────────────── -->
    <div class="bottom-dots">
      <div v-for="i in 5" :key="i" class="dot-blip"
           :style="{ animationDelay: ((i - 1) * 0.2) + 's' }"></div>
    </div>

    <!-- ── JUDGE SAYS bottom ticker ───────────────────────────── -->
    <div class="judge-bar">
      <span class="bar-label">JUDGE SAYS</span>
      <transition name="fade-slide" mode="out-in">
        <span class="bar-text" :key="currentCommentIdx">
          <template v-if="currentComment">
            <strong class="bar-name">{{ currentComment.name }}</strong>
            {{ currentComment.text }}
          </template>
          <em v-else>The gavel is about to drop…</em>
        </span>
      </transition>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps({
  scores: { type: Array, default: () => [] },
});

// ── Step animation ────────────────────────────────────────────────────
const STEPS = [
  { key: 'reversed', label: 'Reversed back' },
  { key: 'title',    label: 'Title match'   },
  { key: 'scoring',  label: 'Scoring'       },
  { key: 'crown',    label: 'Crown'         },
];

const currentStep     = ref(0);
const currentCommentIdx = ref(0);
let stepTimer    = null;
let commentTimer = null;

// ── "JUDGE SAYS" comments ─────────────────────────────────────────────
const FALLBACK_COMMENTS = [
  { name: 'The judge',  text: 'is reviewing every syllable… this may take a moment.' },
  { name: 'The oracle', text: 'listens closely. Tune stays hidden until it\'s revealed.' },
  { name: 'The AI',     text: 'is comparing your guesses. No hints — only vibes.' },
];

const scoringComments = computed(() => {
  if (!props.scores.length) return FALLBACK_COMMENTS;
  return props.scores
    .filter(s => s.reasoning)
    .map(s => ({ name: s.playerName, text: s.reasoning }));
});

const commentPool = computed(() =>
  scoringComments.value.length ? scoringComments.value : FALLBACK_COMMENTS
);

const currentComment = computed(() =>
  commentPool.value[currentCommentIdx.value % commentPool.value.length]
);

// ── Lifecycle ─────────────────────────────────────────────────────────
onMounted(() => {
  // Advance step progress every ~1.8 s (cycles, never beyond last)
  stepTimer = setInterval(() => {
    currentStep.value = (currentStep.value + 1) % STEPS.length;
  }, 1800);

  // Cycle through judge comments every 4 s
  commentTimer = setInterval(() => {
    currentCommentIdx.value++;
  }, 4000);
});

onBeforeUnmount(() => {
  clearInterval(stepTimer);
  clearInterval(commentTimer);
});
</script>

<style scoped>
/* ── Root ────────────────────────────────────────────────────────────── */
.judge-root {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 40px 76px;   /* bottom padding clears the judge bar */
  gap: 0;
}

/* ── JURY badge ──────────────────────────────────────────────────────── */
.jury-badge {
  margin-bottom: 20px;
}

.jury-live-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px 6px 12px;
  border-radius: 999px;
  background: rgb(14, 4, 32);
  border: 2px solid var(--vr-orange);
  box-shadow: rgb(24, 10, 46) 0 0 0 2px, var(--vr-orange-glow) 0 0 24px;
  font-family: var(--vr-font-ui);
  font-size: 12px;
  letter-spacing: 1.6px;
  color: var(--vr-orange);
  animation: vr-marquee-blink 1.6s ease infinite;
}

/* ── Center column ───────────────────────────────────────────────────── */
.judge-center {
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* ── Vinyl wrapper (160×160, overflow visible for needle & aura) ─────── */
.vinyl-wrapper {
  position: relative;
  width: 160px;
  height: 160px;
  margin-bottom: 20px;
}

/* Orange radial aura */
.vinyl-aura {
  position: absolute;
  inset: -22px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 107, 74, 0.267), transparent 70%);
  animation: vr-glow 2.2s ease-in-out infinite;
  pointer-events: none;
}

/* Outer decorative ring — spins */
.vinyl-outer-ring {
  position: absolute;
  top: -20px;
  left: -20px;
  width: 200px;
  height: 200px;
  animation: vr-spin 12s linear infinite;
  pointer-events: none;
}

/* Main vinyl disc — spins */
.vinyl-disc {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, rgb(255, 245, 220), rgb(251, 238, 211));
  border: 4px solid rgb(14, 4, 32);
  box-shadow:
    rgb(255, 107, 74) 0 0 22px,
    rgba(255, 107, 74, 0.45) 0 0 44px,
    rgba(255, 107, 74, 0.2) 0 0 80px;
  animation: vr-spin 8s linear infinite;
  overflow: hidden;
}

/* Needle arm (black bar above the disc) */
.needle-arm {
  position: absolute;
  top: -20px;
  left: 50%;
  transform: translateX(-50%);
  width: 4px;
  height: 22px;
  background: rgb(14, 4, 32);
  border-radius: 2px;
}

/* Glowing orange needle head */
.needle-head {
  position: absolute;
  top: -28px;
  left: 50%;
  transform: translateX(-50%);
  width: 12px;
  height: 12px;
  border-radius: 6px;
  background: var(--vr-orange);
  box-shadow: var(--vr-orange) 0 0 14px, var(--vr-orange-glow) 0 0 28px;
  animation: vr-pulse 1.4s ease-in-out infinite;
}

/* Flanking teal waveform panels */
.wave-panel {
  position: absolute;
  top: 38%;
  width: 36px;
  height: 36px;
  border-radius: 18px;
  background: rgb(14, 4, 32);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  z-index: 2;
}
.wave-left  { left:  -26px; }
.wave-right { right: -26px; }

.wave-bar {
  width: 4px;
  background: var(--vr-teal);
  border-radius: 2px;
  animation: vr-wave-pulse ease-in-out infinite;
  height: 22px;
}

/* ── Title area ──────────────────────────────────────────────────────── */
.judge-title {
  font-family: var(--vr-font-ui);
  font-size: 40px;
  color: var(--vr-cream);
  letter-spacing: 0.5px;
  text-align: center;
  line-height: 1.05;
  margin: 0 0 10px;
}

.judge-subtitle {
  font-size: 13px;
  color: var(--vr-cream-dim);
  text-align: center;
  max-width: 540px;
  line-height: 1.55;
  margin: 0 0 26px;
}

/* ── Step row ────────────────────────────────────────────────────────── */
.step-row {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 12px 18px;
  background: rgb(14, 4, 32);
  border: 2px solid var(--vr-border);
  border-radius: 14px;
}

.step-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.step-circle {
  width: 22px;
  height: 22px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--vr-font-ui);
  font-size: 10px;
  transition: background 0.4s, color 0.4s, box-shadow 0.4s;
}
.step-done {
  background: var(--vr-teal);
  color: rgb(14, 4, 32);
  box-shadow: rgba(63, 208, 201, 0.5) 0 0 10px;
}
.step-active {
  background: var(--vr-orange);
  color: rgb(14, 4, 32);
  box-shadow: rgba(255, 107, 74, 0.5) 0 0 10px;
  animation: vr-pulse 1.4s ease-in-out infinite;
}
.step-pending {
  background: rgba(255, 245, 220, 0.15);
  color: rgba(255, 245, 220, 0.4);
}

.step-label {
  font-family: var(--vr-font-ui);
  font-size: 11px;
  letter-spacing: 1px;
  transition: color 0.4s;
  white-space: nowrap;
}
.label-live { color: var(--vr-teal); }
.label-dim  { color: rgba(255, 245, 220, 0.35); }

.step-connector {
  width: 22px;
  height: 2px;
  margin-bottom: 16px;   /* aligns with circle row */
  align-self: flex-start;
  margin-top: 11px;
  background: rgba(255, 245, 220, 0.15);
  transition: background 0.4s;
}
.connector-done { background: var(--vr-teal); }

/* ── Decorative bottom dots ──────────────────────────────────────────── */
.bottom-dots {
  position: absolute;
  bottom: 56px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
}
.dot-blip {
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background: var(--vr-orange);
  opacity: 0.5;
  animation: vr-marquee-blink 1.4s ease infinite;
}

/* ── JUDGE SAYS bottom bar ───────────────────────────────────────────── */
.judge-bar {
  position: absolute;
  bottom: 24px;
  left: 32px;
  right: 32px;
  padding: 10px 16px;
  background: rgb(14, 4, 32);
  border: 2px solid rgba(255, 107, 74, 0.4);
  border-radius: 999px;
  display: flex;
  align-items: center;
  gap: 12px;
  overflow: hidden;
}

.bar-label {
  font-family: var(--vr-font-ui);
  font-size: 11px;
  color: var(--vr-orange);
  background: rgba(255, 107, 74, 0.133);
  padding: 3px 8px;
  border-radius: 999px;
  letter-spacing: 1.5px;
  white-space: nowrap;
  flex-shrink: 0;
}

.bar-text {
  flex: 1;
  font-family: var(--vr-font-body);
  font-size: 13px;
  color: rgba(255, 245, 220, 0.8);
  font-style: italic;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar-name {
  font-style: normal;
  font-weight: 600;
  color: var(--vr-cream);
  margin-right: 4px;
}

/* ── Transition: comment cycling ─────────────────────────────────────── */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.35s ease, transform 0.35s ease;
}
.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
