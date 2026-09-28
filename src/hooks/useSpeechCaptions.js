import { useEffect, useRef } from "react";

const SpeechRecognitionImpl =
  typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export const speechRecognitionSupported = Boolean(SpeechRecognitionImpl);

// Turns the local microphone into live text using the browser's built-in
// speech recognition (Chrome/Edge), calling onText(text, isFinal) as the
// person speaks. Recognition sessions end on their own after silence, so it
// restarts itself for as long as `active` stays true.
export function useSpeechCaptions({ active, lang = "si-LK", onText }) {
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => {
    if (!active || !SpeechRecognitionImpl) return;

    let stopped = false;
    let restartTimer;
    const recognition = new SpeechRecognitionImpl();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0].transcript.trim();
        if (text) onTextRef.current(text, result.isFinal);
      }
    };

    recognition.onerror = (event) => {
      // Permission denied / service blocked won't fix itself on retry.
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        stopped = true;
      }
    };

    recognition.onend = () => {
      if (!stopped) restartTimer = setTimeout(() => !stopped && safeStart(), 250);
    };

    const safeStart = () => {
      try {
        recognition.start();
      } catch {
        // start() throws if a session is already running — safe to ignore.
      }
    };
    safeStart();

    return () => {
      stopped = true;
      clearTimeout(restartTimer);
      recognition.onend = null;
      recognition.abort();
    };
  }, [active, lang]);
}
