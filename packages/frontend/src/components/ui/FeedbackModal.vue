<template>
  <Teleport to="body">
    <Transition name="fb-fade">
      <div v-if="modelValue" class="fb-backdrop" @click.self="close">
        <div class="fb-modal" role="dialog" aria-modal="true" aria-label="Send feedback">

          <div class="fb-header">
            <div class="fb-title">Send Feedback</div>
            <button class="fb-close" @click="close" aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <!-- Success state -->
          <div v-if="submitted" class="fb-body fb-success">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3FD0C9" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M8 12l3 3 5-5"/>
            </svg>
            <p class="fb-success-title">Got it, thanks!</p>
            <p class="fb-success-body">Your feedback helps us make the game better.</p>
            <button class="fb-btn-secondary" @click="close">Close</button>
          </div>

          <!-- Form state -->
          <div v-else class="fb-body">
            <div class="fb-type-row">
              <button
                v-for="t in TYPES"
                :key="t.value"
                class="fb-type-btn"
                :class="{ active: type === t.value }"
                @click="type = t.value"
              >{{ t.label }}</button>
            </div>

            <!-- Honeypot: invisible to humans, bots fill it in -->
            <input v-model="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" class="fb-hp" />

            <label class="fb-label">What's on your mind?</label>
            <textarea
              v-model="message"
              class="fb-textarea"
              placeholder="Describe the bug or your idea…"
              rows="5"
              maxlength="2000"
            />
            <div class="fb-char-count">{{ message.length }} / 2000</div>

            <p v-if="error" class="fb-error">{{ error }}</p>

            <button
              class="fb-btn-primary"
              :disabled="!message.trim() || sending"
              @click="submit"
            >{{ sending ? 'Sending…' : 'Send Feedback' }}</button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';

const props = defineProps({ modelValue: { type: Boolean, default: false } });
const emit = defineEmits(['update:modelValue']);

const route = useRoute();

const TYPES = [
  { value: 'bug',        label: 'Bug Report' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'other',      label: 'Other' },
];

const type      = ref('bug');
const message   = ref('');
const hp        = ref('');
const sending   = ref(false);
const submitted = ref(false);
const error     = ref(null);

watch(() => props.modelValue, (open) => {
  if (open) { type.value = 'bug'; message.value = ''; hp.value = ''; error.value = null; submitted.value = false; }
});

function close() { emit('update:modelValue', false); }

async function submit() {
  error.value  = null;
  sending.value = true;
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message.value, type: type.value, page: route.path, hp: hp.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send');
    submitted.value = true;
  } catch (e) {
    error.value = e.message;
  } finally {
    sending.value = false;
  }
}

function onKey(e) { if (e.key === 'Escape' && props.modelValue) close(); }
onMounted(() => document.addEventListener('keydown', onKey));
onUnmounted(() => document.removeEventListener('keydown', onKey));
</script>

<style scoped>
.fb-backdrop {
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

.fb-modal {
  width: 100%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  background: rgb(14, 4, 32);
  border: 2px solid rgb(58, 27, 92);
  border-radius: 20px;
  box-shadow:
    rgba(63, 208, 201, 0.15) 0 0 40px,
    rgba(0, 0, 0, 0.6) 0 24px 60px;
  overflow: hidden;
}

.fb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid rgba(58, 27, 92, 0.6);
}

.fb-title {
  font-family: "Bowlby One SC", "Bowlby One", Impact, sans-serif;
  font-size: 20px;
  letter-spacing: 1px;
  color: #FFF5DC;
}

.fb-close {
  background: transparent;
  border: none;
  color: rgba(255, 245, 220, 0.5);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  transition: color 0.12s, background 0.12s;
  line-height: 0;
}
.fb-close:hover {
  color: #FFF5DC;
  background: rgba(255, 255, 255, 0.06);
}

.fb-body {
  padding: 20px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* Type buttons */
.fb-type-row {
  display: flex;
  gap: 8px;
}

.fb-type-btn {
  flex: 1;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1.5px solid rgba(58, 27, 92, 0.8);
  background: rgba(24, 10, 46, 0.7);
  color: rgba(255, 245, 220, 0.5);
  font-family: "Bowlby One SC", "Bowlby One", Impact, sans-serif;
  font-size: 11px;
  letter-spacing: 0.8px;
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s, background 0.12s;
}
.fb-type-btn:hover {
  border-color: rgba(63, 208, 201, 0.4);
  color: rgba(255, 245, 220, 0.8);
}
.fb-type-btn.active {
  border-color: #3FD0C9;
  background: rgba(63, 208, 201, 0.1);
  color: #3FD0C9;
}

/* Honeypot — invisible to humans, present in DOM for bots */
.fb-hp {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

/* Label */
.fb-label {
  font-family: "Bowlby One SC", "Bowlby One", Impact, sans-serif;
  font-size: 11px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: rgba(255, 245, 220, 0.5);
  margin-bottom: -6px;
}

/* Textarea */
.fb-textarea {
  width: 100%;
  box-sizing: border-box;
  background: rgba(24, 10, 46, 0.8);
  border: 1.5px solid rgba(58, 27, 92, 0.8);
  border-radius: 12px;
  color: #FFF5DC;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  padding: 12px 14px;
  resize: vertical;
  outline: none;
  transition: border-color 0.12s;
}
.fb-textarea:focus {
  border-color: #3FD0C9;
}
.fb-textarea::placeholder {
  color: rgba(255, 245, 220, 0.3);
}

.fb-char-count {
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 11px;
  color: rgba(255, 245, 220, 0.3);
  text-align: right;
  margin-top: -8px;
}

.fb-error {
  font-size: 12px;
  color: #FF2F87;
  margin: -4px 0;
}

/* Submit button */
.fb-btn-primary {
  width: 100%;
  padding: 14px;
  background: #3FD0C9;
  border: none;
  border-radius: 12px;
  color: rgb(14, 4, 32);
  font-family: "Bowlby One SC", "Bowlby One", Impact, sans-serif;
  font-size: 14px;
  letter-spacing: 1px;
  cursor: pointer;
  transition: filter 0.12s, transform 0.1s;
  box-shadow: rgba(63, 208, 201, 0.3) 0 4px 16px;
}
.fb-btn-primary:hover:not(:disabled) {
  filter: brightness(1.1);
  transform: translateY(-1px);
}
.fb-btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Success */
.fb-success {
  align-items: center;
  text-align: center;
  padding: 32px 24px 28px;
}

.fb-success-title {
  font-family: "Bowlby One SC", "Bowlby One", Impact, sans-serif;
  font-size: 20px;
  letter-spacing: 0.5px;
  color: #FFF5DC;
  margin: 0;
}

.fb-success-body {
  font-size: 14px;
  color: rgba(255, 245, 220, 0.6);
  margin: 0;
  line-height: 1.5;
}

.fb-btn-secondary {
  padding: 10px 28px;
  background: transparent;
  border: 1.5px solid rgba(58, 27, 92, 0.8);
  border-radius: 10px;
  color: rgba(255, 245, 220, 0.6);
  font-family: "Bowlby One SC", "Bowlby One", Impact, sans-serif;
  font-size: 12px;
  letter-spacing: 1px;
  cursor: pointer;
  margin-top: 4px;
  transition: border-color 0.12s, color 0.12s;
}
.fb-btn-secondary:hover {
  border-color: rgba(255, 245, 220, 0.3);
  color: #FFF5DC;
}

/* Transition */
.fb-fade-enter-active,
.fb-fade-leave-active {
  transition: opacity 0.18s ease;
}
.fb-fade-enter-active .fb-modal,
.fb-fade-leave-active .fb-modal {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.fb-fade-enter-from,
.fb-fade-leave-to { opacity: 0; }
.fb-fade-enter-from .fb-modal { transform: translateY(12px) scale(0.97); }
.fb-fade-leave-to .fb-modal { transform: translateY(8px) scale(0.98); }
</style>
