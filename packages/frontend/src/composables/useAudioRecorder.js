import { ref } from 'vue';
// Simple MediaRecorder wrapper (MVP) with pause/resume
export function useAudioRecorder() {
  const isRecording = ref(false);
  const isPaused = ref(false);
  const mediaRecorder = ref(null);
  const chunks = ref([]);

  async function start() {
    if (isRecording.value) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    mr.ondataavailable = e => { if (e.data.size) chunks.value.push(e.data); };
    mr.start();
    mediaRecorder.value = mr;
    isRecording.value = true;
    isPaused.value = false;
  }

  function pause() {
    if (!isRecording.value || isPaused.value || !mediaRecorder.value) return;
    mediaRecorder.value.pause();
    isPaused.value = true;
  }

  function resume() {
    if (!isRecording.value || !isPaused.value || !mediaRecorder.value) return;
    mediaRecorder.value.resume();
    isPaused.value = false;
  }

  async function stop() {
    if (!isRecording.value || !mediaRecorder.value) return null;
    return new Promise(resolve => {
      mediaRecorder.value.onstop = () => {
        const blob = new Blob(chunks.value, { type: 'audio/webm' });
        chunks.value = [];
        mediaRecorder.value.stream.getTracks().forEach(t => t.stop());
        mediaRecorder.value = null;
        isRecording.value = false;
        isPaused.value = false;
        resolve(blob);
      };
      mediaRecorder.value.stop();
    });
  }
  return { isRecording, isPaused, start, pause, resume, stop };
}
