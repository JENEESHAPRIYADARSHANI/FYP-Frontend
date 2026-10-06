import { useEffect, useRef, useState } from "react";
import { FilesetResolver, HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import { SIGNALING_WS_BASE } from "../services/api.js";

// Must match the version actually installed (package-lock.json) so the WASM
// binary fetched from the CDN matches the JS bindings bundled by Vite.
const TASKS_VISION_VERSION = "0.10.35";
const WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
// Same "latest" float16 assets ssl_features.py's own MODEL_URLS points training
// at (see backend/app/services/ssl_features.py) — kept identical on purpose so
// the live app's landmark detector matches what the models were trained on.
const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";
const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

// The 13 pose points the word model was trained on (ssl_features.py POSE_IDX):
// nose, left eye, right eye, left ear, right ear, mouth left, mouth right,
// left shoulder, right shoulder, left elbow, right elbow, left wrist, right wrist.
const POSE_IDX = [0, 2, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

const WINDOW_SIZE = 72; // rolling buffer of raw frames sent per window (~2.4s at the throttle below)
// The new models resample by real elapsed time (rel_t), not by frame count,
// so this doesn't need to hit any exact fps the way the old model did — but
// it still needs *a* cap, since running two MediaPipe models (pose + hands)
// on every single animation-frame tick (60+/s) would needlessly compete with
// WebRTC's own encode/decode for CPU during a call.
const SAMPLE_INTERVAL_MS = 40; // ~25 samples/s cap
const SEND_INTERVAL_MS = 400; // throttle inference requests
const MIN_FRAMES_TO_SEND = 15; // don't bother predicting on a near-empty window
const SMOOTHING_STREAK = 2; // consecutive agreeing predictions before display
const MISS_FRAMES_TO_CLEAR = 15; // ~consecutive no-hand video frames before clearing a shown sign
const MISS_MESSAGES_TO_CLEAR = 3; // ~consecutive unrecognized inferences before clearing a shown sign

let landmarkersPromise = null;
function getLandmarkers() {
  if (!landmarkersPromise) {
    landmarkersPromise = FilesetResolver.forVisionTasks(WASM_BASE_URL).then(async (vision) => {
      const [handLandmarker, poseLandmarker] = await Promise.all([
        HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numHands: 2,
        }),
        PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numPoses: 1,
        }),
      ]);
      return { handLandmarker, poseLandmarker };
    });
    // Both the WASM binary and the two model files load from external CDNs
    // (see WASM_BASE_URL/HAND_MODEL_URL/POSE_MODEL_URL above). If any fetch
    // fails — a firewall, an ad-blocker, or just no route to that host — this
    // promise rejects, detectLoop below never starts, and that failure would
    // otherwise be completely silent: the socket still connects, the call
    // still looks normal, and recognition just never produces anything,
    // forever, with nothing in the console to say why. Logging it here at
    // least makes that failure visible. Reset the cached promise on failure
    // so a retry (e.g. rejoining the call after the network recovers) can
    // try loading again instead of being stuck replaying the same rejected
    // promise.
    landmarkersPromise.catch((err) => {
      console.error(
        "useLandmarkStream: failed to load MediaPipe pose/hand landmarkers (sign recognition will not work this session):",
        err
      );
      landmarkersPromise = null;
    });
  }
  return landmarkersPromise;
}

// Captures the raw pose + hand landmarks straight from MediaPipe, with no
// wrist-relative math and no mirroring applied client side. The backend's
// ssl_features.py/hand_features.py (the exact files the models were trained
// against) do all of that normalisation server side from this raw data — see
// app/services/sign_models.py. This also means there's nothing here that can
// silently drift from what the models actually expect: the only feature math
// that exists lives in one place, in Python, shared with training.
//
// Landmark detection runs on the raw, unmirrored camera stream (the CSS
// mirror on the self-view <video> is a display-only transform, it doesn't
// touch the pixels MediaPipe sees) — the training videos were never flipped
// either (see ssl_features.py's extract_video/LandmarkExtractor, no cv2.flip
// anywhere), so no manual 1-x correction is applied here, unlike the old
// hand-only model this replaced.
function captureFrame(handResult, poseResult) {
  let pose = null;
  const poseLm = poseResult.landmarks?.[0];
  if (poseLm) {
    pose = POSE_IDX.map((i) => [poseLm[i].x, poseLm[i].y]);
  }

  const hands = [];
  let anyHand = false;
  handResult.landmarks?.forEach((landmarks, i) => {
    const handedness = handResult.handedness?.[i]?.[0]?.categoryName; // "Left" | "Right"
    if (!handedness) return;
    hands.push({ landmarks: landmarks.map((p) => [p.x, p.y, p.z]), handedness });
    anyHand = true;
  });

  return { frame: { pose, hands }, anyHand };
}

// Captures pose + hand landmarks from a live <video> element, buffers a
// rolling window of raw frames, and streams it to /ws/landmarks for
// classification against both the word model and the hand model.
//
// Runs continuously rather than on a manual trigger (per project decision),
// so noise is filtered on both ends: the backend marks a window
// `recognized: false` when neither model confidently matches a trained sign
// (see sign_models.py), those are dropped, and a sign must then repeat
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
        // Neither model confidently matched a trained sign — let the streak
        // lapse rather than holding a stale prediction up. A single miss
        // doesn't clear the panel (that would flicker on ordinary gaps
        // between windows); several in a row means recognition has
        // genuinely gone quiet, so the last shown sign stops being true and
        // needs to go away rather than sit there indefinitely.
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

    getLandmarkers().then(({ handLandmarker, poseLandmarker }) => {
      if (cancelled) return;

      let lastSampleAt = 0;

      const detectLoop = () => {
        const video = videoRef.current;
        const now = performance.now();
        if (video && video.readyState >= 2 && now - lastSampleAt >= SAMPLE_INTERVAL_MS) {
          lastSampleAt = now;
          const handResult = handLandmarker.detectForVideo(video, now);
          const poseResult = poseLandmarker.detectForVideo(video, now);
          const { frame, anyHand } = captureFrame(handResult, poseResult);

          const buffer = bufferRef.current;
          buffer.push({ t: now / 1000, ...frame });
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
        const hasHandInBuffer = buffer.some((f) => f.hands.length > 0);
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
