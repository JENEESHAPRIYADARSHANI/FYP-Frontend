# SSL Connect — Frontend

Real-time video conferencing between a hearing and a Deaf/hard-of-hearing
participant in a single room, with live sign-language recognition running
on the signer's side. Built as the frontend for a Final Year Project on
Sign Language Learning (SSL).

React + Vite client that:

- Sets up a peer-to-peer video/audio call over WebRTC, with a lightweight
  FastAPI WebSocket server handling signaling (offer/answer/ICE exchange)
  and room membership (max two participants per room).
- Runs [MediaPipe Hand Landmarker](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker)
  in-browser on the local camera feed, buffers a rolling window of hand
  landmarks, and streams them to the backend over a second WebSocket for
  sign classification.
- Surfaces the recognized sign, with a confidence threshold and streak-based
  smoothing to avoid flicker from an always-on, unsegmented prediction window.

This repo is the frontend only. It expects a companion FastAPI backend
(model inference + WebRTC signaling) running alongside it — see
[Configuration](#configuration).

## Tech stack

- [React 19](https://react.dev/) + [React Router](https://reactrouter.com/)
- [Vite](https://vite.dev/) for dev server and bundling
- [@mediapipe/tasks-vision](https://www.npmjs.com/package/@mediapipe/tasks-vision) for in-browser hand landmark detection
- Native `RTCPeerConnection` / WebSocket APIs (no external WebRTC library)
- [oxlint](https://oxc.rs/) for linting

## Getting started

```bash
npm install
npm run dev
```

The dev server runs at `http://localhost:5173` and expects the backend
(see Configuration) reachable at `ws://localhost:8000` by default.

### Scripts

| Command           | Description                          |
| ------------------ | ------------------------------------ |
| `npm run dev`       | Start the Vite dev server with HMR   |
| `npm run build`     | Production build to `dist/`          |
| `npm run preview`   | Preview the production build locally |
| `npm run lint`      | Run oxlint                           |

## Configuration

The signaling/landmark WebSocket base URL is read from an environment
variable, falling back to a local backend:

```bash
# .env.local
VITE_SIGNALING_WS_URL=ws://localhost:8000
```

## How a call works

1. **Home** — a teacher starts a class (generates a room code) or a
   student joins one (enters a code).
2. **Lobby** (`/join/:roomCode`) — camera/mic check before entering the room.
3. **Call room** (`/call/:roomCode`) — `useSignalingSocket` joins
   `/ws/signal/:roomCode`; `usePeerConnection` negotiates the
   `RTCPeerConnection` from those signaling messages; `useLandmarkStream`
   runs hand detection on the local video feed and streams windows of
   landmarks to `/ws/landmarks` for classification.

The local camera preview is mirrored for display only (the standard
self-view convention used by Meet/Zoom/Teams) — the raw, unmirrored frame
is what's fed to hand-landmark detection and what's sent to the remote
peer, so recognition and the other participant's view are unaffected.

## Project structure

```
src/
├── pages/            Home, Lobby, CallRoom — route-level views
├── hooks/
│   ├── useSignalingSocket.js   WebSocket pub/sub for room signaling
│   ├── usePeerConnection.js    RTCPeerConnection lifecycle
│   └── useLandmarkStream.js    Hand detection + prediction streaming
└── services/
    ├── api.js            Shared config (WS base URL)
    └── peerService.js    RTCPeerConnection factory
```
