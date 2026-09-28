import { useEffect, useRef, useState } from "react";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { SIGNALING_WS_BASE } from "../services/api.js";

// Must match the version actually installed (package-lock.json) so the WASM
// binary fetched from the CDN matches the JS bindings bundled by Vite.
const TASKS_VISION_VERSION = "0.10.35";
const WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// Must match SSL_Research_Project/configuration/landmark_config.py exactly:
// 21 landmarks x (x, y, z) x 2 hands, left hand first, zero-filled if absent.
const LANDMARKS_PER_HAND = 21;
const COORDS_PER_LANDMARK = 3;
const FEATURES_PER_HAND = LANDMARKS_PER_HAND * COORDS_PER_LANDMARK; // 63
const WINDOW_SIZE = 80; // SEQUENCE_LENGTH the model was trained on
const SEND_INTERVAL_MS = 400; // throttle inference requests
const MIN_FRAMES_TO_SEND = 15; // don't bother predicting on a near-empty window
const SMOOTHING_STREAK = 2; // consecutive agreeing predictions before display
const MISS_FRAMES_TO_CLEAR = 15; // ~consecutive no-hand video frames before clearing a shown sign
const MISS_MESSAGES_TO_CLEAR = 3; // ~consecutive unrecognized inferences before clearing a shown sign

let handLandmarkerPromise = null;
function getHandLandmarker() {
  if (!handLandmarkerPromise) {
    handLandmarkerPromise = FilesetResolver.forVisionTasks(WASM_BASE_URL).then(
      (vision) =>
        HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numHands: 2,
        })
    );
  }
  return handLandmarkerPromise;
}

const EMPTY_HAND = new Array(FEATURES_PER_HAND).fill(0);

function extractFrameFeatures(result) {
  let left = EMPTY_HAND;
  let right = EMPTY_HAND;
  let anyHand = false;

  result.landmarks?.forEach((landmarks, i) => {
    const label = result.handedness?.[i]?.[0]?.categoryName; // "Left" | "Right"
    const coords = landmarks.flatMap((point) => [point.x, point.y, point.z]);
    if (label === "Left") {
      left = coords;
      anyHand = true;
    } else if (label === "Right") {
      right = coords;
      anyHand = true;
    }
  });

  return { frame: [...left, ...right], anyHand };
}

// Captures hand landmarks from a live <video> element (the raw, unmirrored
// frame — mirroring is applied only via CSS for display, so detection stays
// consistent with how the training dataset was extracted), buffers a rolling
// window, and streams it to /ws/landmarks for classification.
//
// Runs continuously rather than on a manual trigger (per project decision),
// so noise is filtered on both ends: the backend marks a window
// `recognized: false` when it doesn't confidently match any trained sign
// (low softmax confidence and/or too far from every class centroid — see
// model_service.py), those are dropped, and a sign must then repeat
// SMOOTHING_STREAK times in a row before it's surfaced, to avoid flicker
// from an unsegmented, always-on window. Symmetrically, a shown sign is
// cleared back to "nothing recognized" once hands leave the frame or
// recognition stops matching for a few beats in a row — without this, the
// panel would keep displaying the first thing it ever recognized for the
// rest of the call, long after it stopped being true.
export function useLandmarkStream({ videoRef, active }) {
  const wsRef = useRef(null);
  const bufferRef = useRef([]);
  const streakRef = useRef({ classId: null, count: 0 });
  const missFramesRef = useRef(0);
  const missMessagesRef = useRef(0);
  const isSigningRef = useRef(false);
  const [prediction, setPrediction] = useState(null); // { sign, signSi, confidence }
  const [isSigning, setIsSigning] = useState(false); // hands currently detected in frame

  useEffect(() => {
    if (!active || !videoRef.current) return;

    let cancelled = false;
    let rafId;
    let sendTimerId;
    let ws;

    function handlePredictionMessage(event) {
      const message = JSON.parse(event.data);
      if (message.type !== "prediction") return;

      const streak = streakRef.current;
      if (!message.recognized) {
        // Backend didn't confidently match any trained sign — let the
        // streak lapse rather than holding a stale prediction up. A single
        // miss doesn't clear the panel (that would flicker on ordinary
        // gaps between windows); several in a row means recognition has
        // genuinely gone quiet, so the last shown sign stops being true
        // and needs to go away rather than sit there indefinitely.
        streakRef.current = { classId: null, count: 0 };
        missMessagesRef.current += 1;
        if (missMessagesRef.current >= MISS_MESSAGES_TO_CLEAR) {
          setPrediction(null);
        }
        return;
      }
      missMessagesRef.current = 0;

      if (streak.classId === message.class_id) {
        streak.count += 1;
      } else {
        streakRef.current = { classId: message.class_id, count: 1 };
      }

      if (streakRef.current.count >= SMOOTHING_STREAK) {
        setPrediction({
          sign: message.sign,
          signSi: message.sign_si,
          confidence: message.confidence,
        });
      }
    }

    // Deferred by one tick so React StrictMode's dev-only mount -> cleanup ->
    // mount double-invoke never opens a real connection for the phantom
    // first mount — see useSignalingSocket.js for the full explanation of
    // why (same underlying issue, found while chasing a "room already full"
    // bug on that socket). Harmless here either way since /ws/landmarks has
    // no peer cap, but avoiding a pointless duplicate connection either way.
    const openTimer = setTimeout(() => {
      if (cancelled) return;
      ws = new WebSocket(`${SIGNALING_WS_BASE}/ws/landmarks`);
      wsRef.current = ws;
      ws.onmessage = handlePredictionMessage;
    }, 0);

    getHandLandmarker().then((handLandmarker) => {
      if (cancelled) return;

      const detectLoop = () => {
        const video = videoRef.current;
        if (video && video.readyState >= 2) {
          const result = handLandmarker.detectForVideo(video, performance.now());
          const { frame, anyHand } = extractFrameFeatures(result);

          const buffer = bufferRef.current;
          buffer.push(frame);
          if (buffer.length > WINDOW_SIZE) buffer.shift();

          if (anyHand !== isSigningRef.current) {
            isSigningRef.current = anyHand;
            setIsSigning(anyHand);
          }

          if (anyHand) {
            missFramesRef.current = 0;
          } else {
            // Idle: let the streak lapse instead of holding a stale sign up,
            // and clear whatever was last shown once hands have been out of
            // frame for a bit — a shown sign should mean "this is what I'm
            // seeing right now," not "this is the last thing I ever saw."
            streakRef.current = { classId: null, count: 0 };
            missFramesRef.current += 1;
            if (missFramesRef.current >= MISS_FRAMES_TO_CLEAR) {
              setPrediction(null);
            }
          }
        }
        rafId = requestAnimationFrame(detectLoop);
      };
      rafId = requestAnimationFrame(detectLoop);

      sendTimerId = setInterval(() => {
        const buffer = bufferRef.current;
        const hasHandInBuffer = buffer.some((frame) => frame.some((v) => v !== 0));
        if (
          ws?.readyState === WebSocket.OPEN &&
          buffer.length >= MIN_FRAMES_TO_SEND &&
          hasHandInBuffer
        ) {
          ws.send(JSON.stringify({ type: "window", frames: buffer }));
        }
      }, SEND_INTERVAL_MS);
    });

    return () => {
      cancelled = true;
      clearTimeout(openTimer);
      cancelAnimationFrame(rafId);
      clearInterval(sendTimerId);
      ws?.close();
      wsRef.current = null;
      bufferRef.current = [];
      streakRef.current = { classId: null, count: 0 };
      missFramesRef.current = 0;
      missMessagesRef.current = 0;
      isSigningRef.current = false;
      setIsSigning(false);
    };
  }, [active, videoRef]);

  return { prediction, isSigning };
}
