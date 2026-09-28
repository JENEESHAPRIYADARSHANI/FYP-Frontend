import { API_BASE_URL } from "./api.js";

let currentAudio = null;

function findSinhalaVoice() {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  return voices.find((voice) => voice.lang?.toLowerCase().startsWith("si"));
}

function stopSpeaking() {
  window.speechSynthesis?.cancel();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

// Speaks a Sinhala sign label aloud. Uses the browser's own Sinhala voice
// when one is installed; otherwise falls back to the backend's /api/tts,
// since most desktop browsers ship no Sinhala voice at all. A new sign
// interrupts the previous one so the audio never lags behind the signing.
export async function speakSinhala(text) {
  if (!text) return;
  stopSpeaking();

  const voice = findSinhalaVoice();
  if (voice) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    window.speechSynthesis.speak(utterance);
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/tts?text=${encodeURIComponent(text)}`);
    if (!response.ok) return;
    const url = URL.createObjectURL(await response.blob());
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    currentAudio = audio;
    await audio.play();
  } catch {
    // Offline or autoplay blocked — the sign still shows as text, so the
    // call carries on without voice rather than surfacing an error.
  }
}
