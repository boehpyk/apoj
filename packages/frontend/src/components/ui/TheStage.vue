<template>
  <!-- Full-screen page wrapper with radial background -->
  <div class="vr-page">
    <!-- Scaled stage panel -->
    <div class="vr-stage" ref="stageEl">

      <!-- Starfield SVG -->
      <svg class="sparkles" preserveAspectRatio="none" viewBox="0 0 100 100">
        <circle v-for="(s, i) in sparkles" :key="i"
          :cx="s.cx" :cy="s.cy" :r="s.r" fill="#FFF5DC" :opacity="s.o" />
      </svg>

      <!-- Corner: vinyl record top-left -->
      <div class="corner-vinyl">
        <svg viewBox="0 0 100 100" width="64" height="64">
          <defs>
            <radialGradient id="vinyl-bg" cx="40%" cy="35%" r="60%">
              <stop offset="0%"   stop-color="#8B5CF6"/>
              <stop offset="50%"  stop-color="#3B1F6B"/>
              <stop offset="100%" stop-color="#1A0930"/>
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="48" fill="url(#vinyl-bg)"/>
          <!-- Grooves -->
          <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,245,220,.07)" stroke-width="1.5"/>
          <circle cx="50" cy="50" r="34" fill="none" stroke="rgba(255,245,220,.07)" stroke-width="1.5"/>
          <circle cx="50" cy="50" r="26" fill="none" stroke="rgba(255,245,220,.07)" stroke-width="1.5"/>
          <circle cx="50" cy="50" r="18" fill="none" stroke="rgba(255,245,220,.07)" stroke-width="1.5"/>
          <!-- Label -->
          <circle cx="50" cy="50" r="12" fill="#FF2F87" opacity="0.9"/>
          <circle cx="50" cy="50" r="3"  fill="#07020F"/>
        </svg>
      </div>

      <!-- Corner: teal orb top-right -->
      <div class="corner-orb">
        <svg viewBox="0 0 100 100" width="56" height="56">
          <defs>
            <radialGradient id="orb-bg" cx="35%" cy="30%" r="65%">
              <stop offset="0%"   stop-color="#7FFFF4"/>
              <stop offset="50%"  stop-color="#3FD0C9"/>
              <stop offset="100%" stop-color="#0D7A75"/>
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="46" fill="url(#orb-bg)" opacity="0.9"/>
          <circle cx="35" cy="32" r="10" fill="rgba(255,255,255,.25)"/>
        </svg>
      </div>

      <!-- Page content slot -->
      <slot />

      <!-- Feedback button -->
      <button class="feedback-trigger" @click="showFeedback = true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        Feedback
      </button>

      <FeedbackModal v-model="showFeedback" />

      <!-- Bottom decorative marquee -->
      <div class="status-bar">
        <div class="marquee-track">
          <span
            v-for="i in 40" :key="i"
            class="marquee-dot"
            :style="{ animationDelay: ((i-1) * 0.08) + 's' }"
          ></span>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import FeedbackModal from './FeedbackModal.vue';

defineProps({});

const showFeedback = ref(false);

const stageEl = ref(null);

// Sparkle positions — fixed set matching the design
const sparkles = [
  { cx:  0, cy: 13, r: 0.60, o: 0.25 },
  { cx: 37, cy: 86, r: 1.10, o: 0.45 },
  { cx: 74, cy: 59, r: 0.80, o: 0.65 },
  { cx: 11, cy: 32, r: 1.30, o: 0.35 },
  { cx: 48, cy:  5, r: 1.00, o: 0.55 },
  { cx: 85, cy: 78, r: 0.70, o: 0.25 },
  { cx: 22, cy: 51, r: 1.20, o: 0.45 },
  { cx: 59, cy: 24, r: 0.90, o: 0.65 },
  { cx: 96, cy: 97, r: 0.60, o: 0.35 },
  { cx: 33, cy: 70, r: 1.10, o: 0.55 },
  { cx: 70, cy: 43, r: 0.80, o: 0.25 },
  { cx:  7, cy: 16, r: 1.30, o: 0.45 },
  { cx: 44, cy: 89, r: 1.00, o: 0.65 },
  { cx: 81, cy: 62, r: 0.70, o: 0.35 },
  { cx: 18, cy: 35, r: 1.20, o: 0.55 },
  { cx: 55, cy:  8, r: 0.90, o: 0.25 },
  { cx: 92, cy: 81, r: 0.60, o: 0.45 },
  { cx: 29, cy: 54, r: 1.10, o: 0.65 },
  { cx: 66, cy: 27, r: 0.80, o: 0.35 },
  { cx:  3, cy:  0, r: 1.30, o: 0.55 },
  { cx: 40, cy: 73, r: 1.00, o: 0.25 },
  { cx: 77, cy: 46, r: 0.70, o: 0.45 },
  { cx: 14, cy: 19, r: 1.20, o: 0.65 },
  { cx: 51, cy: 92, r: 0.90, o: 0.35 },
  { cx: 88, cy: 65, r: 0.60, o: 0.55 },
  { cx: 25, cy: 38, r: 1.10, o: 0.25 },
  { cx: 62, cy: 11, r: 0.80, o: 0.45 },
  { cx: 99, cy: 84, r: 1.30, o: 0.65 },
  { cx: 36, cy: 57, r: 1.00, o: 0.35 },
  { cx: 73, cy: 30, r: 0.70, o: 0.55 },
  { cx: 10, cy:  3, r: 1.20, o: 0.25 },
  { cx: 47, cy: 76, r: 0.90, o: 0.45 },
  { cx: 84, cy: 49, r: 0.60, o: 0.65 },
  { cx: 21, cy: 22, r: 1.10, o: 0.35 },
  { cx: 58, cy: 95, r: 0.80, o: 0.55 },
  { cx:  5, cy: 68, r: 1.30, o: 0.25 },
  { cx: 64, cy: 41, r: 0.70, o: 0.45 },
  { cx: 90, cy: 14, r: 1.00, o: 0.65 },
  { cx: 31, cy: 87, r: 0.90, o: 0.35 },
  { cx: 78, cy: 60, r: 0.60, o: 0.55 },
];

// Scale stage to fit viewport
function scaleStage() {
  if (!stageEl.value) return;
  const scaleX = window.innerWidth  / 1280;
  const scaleY = window.innerHeight / 800;
  const s = Math.min(1, scaleX, scaleY);
  stageEl.value.style.transform = `scale(${s})`;
}

onMounted(() => {
  scaleStage();
  window.addEventListener('resize', scaleStage);
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', scaleStage);
});
</script>

<style scoped>
.vr-page {
  position: fixed;
  inset: 0;
  background: radial-gradient(ellipse at center, #1A0930 0%, #07020F 80%);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.vr-stage {
  position: relative;
  width: 1280px;
  height: 800px;
  transform-origin: center center;
  border-radius: 24px;
  overflow: hidden;
  background:
    radial-gradient(at center top,    rgba(58,27,92,.333)   0%, transparent 55%),
    radial-gradient(at center bottom, rgba(255,47,135,.133) 0%, transparent 60%)
    rgb(24, 10, 46);
  box-shadow:
    0 0 0 6px #0E0420,
    0 0 0 8px #3A1B5C,
    0 30px 80px rgba(0,0,0,.6),
    0 0 120px rgba(255,47,135,.18);
  color: #FFF5DC;
  font-family: "Space Grotesk", system-ui, sans-serif;
}

.sparkles {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

/* Corner decorations */
.corner-vinyl {
  position: absolute;
  top: 28px;
  left: 28px;
  transform: rotate(-15deg);
  animation: vr-float 5s ease-in-out infinite;
  pointer-events: none;
}

.corner-orb {
  position: absolute;
  top: 24px;
  right: 28px;
  animation: vr-float 6s ease-in-out 1s infinite;
  pointer-events: none;
}

/* Feedback button */
.feedback-trigger {
  position: absolute;
  bottom: 50px;
  right: 24px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 10px 18px;
  background: rgba(63, 208, 201, 0.1);
  border: 1.5px solid rgba(63, 208, 201, 0.45);
  border-radius: 20px;
  color: rgba(255, 245, 220, 0.75);
  font-family: "Bowlby One SC", "Bowlby One", Impact, sans-serif;
  font-size: 12px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s, box-shadow 0.15s;
  box-shadow: rgba(63, 208, 201, 0.12) 0 0 14px;
  z-index: 10;
}
.feedback-trigger:hover {
  color: #FFF5DC;
  border-color: #3FD0C9;
  background: rgba(63, 208, 201, 0.2);
  box-shadow: rgba(63, 208, 201, 0.3) 0 0 20px;
}

/* Bottom decorative marquee */
.status-bar {
  position: absolute;
  bottom: 24px;
  left: 32px;
  right: 32px;
}

.marquee-track {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.marquee-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #FFE066;
  box-shadow: #FFE066 0 0 8px, rgba(255,224,102,.533) 0 0 16px;
  animation: vr-marquee-blink 1.6s ease infinite;
}
</style>
