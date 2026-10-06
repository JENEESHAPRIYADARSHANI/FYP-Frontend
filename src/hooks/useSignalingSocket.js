import { useCallback, useEffect, useRef, useState } from "react";
import { SIGNALING_WS_BASE } from "../services/api.js";

// Connects to /ws/signal/{roomCode} and exposes a pub/sub interface over it.
// `send`/`subscribe` are stable across renders so consumers (usePeerConnection)
// can safely depend on them without re-running effects on every render.
export function useSignalingSocket(roomCode) {
  const wsRef = useRef(null);
  const listenersRef = useRef(new Set());
  // Every message this socket has ever received, so a listener that
  // subscribes *after* a message already arrived still gets it — see the
  // "listenersRef.current.forEach" line below and the subscribe() replay.
  // Without this, the WebRTC offer/ice-candidates get lost for good the
  // moment the receiving side's usePeerConnection subscribes even slightly
  // late (e.g. its own getUserMedia() is still resolving), and the call
  // sits at "Waiting for the other participant" forever with no retry —
  // this was reproduced live: the offer and every ICE candidate reached the
  // server and got relayed just fine, but the other side never answered
  // because nothing was listening yet when they arrived.
  const historyRef = useRef([]);
  // The send-side mirror of historyRef above: messages queued here when
  // send() is called before the socket has actually opened, flushed in
  // order the moment it does. Found by a real bug — CallRoom announces its
  // own identity (name + picture) in an effect keyed on the profile
  // finishing its fetch, which can resolve before this socket's own
  // deferred open (see the setTimeout below) completes; without this queue,
  // that send() was silently dropped by the `readyState === OPEN` check
  // below, and since nothing ever retried it, the peer was permanently
  // stuck showing a role label instead of a name.
  const pendingSendRef = useRef([]);
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

      ws.onopen = () => {
        const queued = pendingSendRef.current;
        pendingSendRef.current = [];
        for (const message of queued) ws.send(JSON.stringify(message));
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "joined") {
          setRole(message.role);
          setStatus("joined");
        } else if (message.type === "room-full") {
          setStatus("room-full");
        }
        historyRef.current.push(message);
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
      historyRef.current = [];
      pendingSendRef.current = [];
    };
  }, [roomCode]);

  const send = useCallback((message) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    } else if (!ws || ws.readyState === WebSocket.CONNECTING) {
      // No socket object yet at all (still inside the deferred-open
      // setTimeout(0) window — see the effect above) counts the same as
      // "connecting": either way it's about to open, so queue rather than
      // drop. Only a genuinely CLOSING/CLOSED socket has nothing left to
      // flush into.
      pendingSendRef.current.push(message);
    }
  }, []);

  const subscribe = useCallback((listener) => {
    listenersRef.current.add(listener);
    // Catch up a late subscriber on everything it missed. Re-delivering the
    // occasional signing-state/screen-share-state message a second time is
    // harmless (the next real update corrects it a moment later); silently
    // dropping the offer or an ICE candidate is not — that's the failure
    // this replay exists to prevent.
    for (const message of historyRef.current) listener(message);
    return () => listenersRef.current.delete(listener);
  }, []);

  return { status, role, send, subscribe };
}
