import { ref } from 'vue';
// Simple MediaRecorder wrapper (MVP)
export function useAudioRecorder() {
  const isRecording = ref(false);
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
        resolve(blob);
      };
      mediaRecorder.value.stop();
    });
  }
  return { isRecording, start, stop };
}

