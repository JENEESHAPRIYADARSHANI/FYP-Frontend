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

    const ws = new WebSocket(`${SIGNALING_WS_BASE}/ws/signal/${roomCode}`);
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

    return () => {
      ws.close();
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
