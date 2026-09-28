import { useCallback, useEffect, useRef, useState } from "react";
import { SIGNALING_WS_BASE } from "../services/api.js";

// Connects to /ws/signal/{roomCode} and exposes a pub/sub interface over it.
// `send`/`subscribe` are stable across renders so consumers (usePeerConnection)
// can safely depend on them without re-running effects on every render.
export function useSignalingSocket(roomCode) {
  const wsRef = useRef(null);
  const listenersRef = useRef(new Set());
  const [status, setStatus] = useState("connecting"); // connecting | joined | room-full | closed
  const [role, setRole] = useState(null);

  useEffect(() => {
    if (!roomCode) return;

    // React StrictMode deliberately mounts every effect twice in dev
    // (mount -> cleanup -> mount) to surface exactly this kind of bug: opening
    // the socket synchronously here would make a *real* connection to the
    // server on the first, phantom mount, then close() it on cleanup — but
    // ws.close() only requests a close, it doesn't confirm the server has
    // processed it before the second mount's connection reaches the room. In
    // a room capped at exactly 2 peers (see room_manager.py), that leaves no
    // slack at all: the phantom connection can still be counted against the
    // cap when the real, second peer tries to join moments later, and their
    // join gets rejected as "room already full" even though only two people
    // are actually trying to use it. See AuthContext.jsx for the same class
    // of StrictMode issue on the Keycloak side.
    //
    // Deferring the actual `new WebSocket(...)` by one tick fixes this at
    // the root instead of racing the server: StrictMode's cleanup runs
    // synchronously, in the same tick, before the timeout ever fires, so the
    // phantom mount's socket is never opened at all — no connection is ever
    // made to the server for it, so there's nothing for the room to
    // count. The second, real mount's timeout is the only one that survives
    // to actually connect.
    let cancelled = false;
    let ws;
    const openTimer = setTimeout(() => {
      if (cancelled) return;
      ws = new WebSocket(`${SIGNALING_WS_BASE}/ws/signal/${roomCode}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "joined") {
          setRole(message.role);
          setStatus("joined");
        } else if (message.type === "room-full") {
          setStatus("room-full");
        }
        listenersRef.current.forEach((listener) => listener(message));
      };

      ws.onclose = () => {
        setStatus((current) => (current === "room-full" ? current : "closed"));
      };
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(openTimer);
      ws?.close();
      wsRef.current = null;
    };
  }, [roomCode]);

  const send = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const subscribe = useCallback((listener) => {
    listenersRef.current.add(listener);
    return () => listenersRef.current.delete(listener);
  }, []);

  return { status, role, send, subscribe };
}
