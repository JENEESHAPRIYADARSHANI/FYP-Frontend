import { useEffect, useRef, useState } from "react";
import { createPeerConnection } from "../services/peerService.js";

// Drives one RTCPeerConnection from signaling messages relayed by the
// FastAPI WebSocket. The teacher (whoever was already in the room) is told
// to be the offer initiator when the second peer joins; everyone else just
// reacts to whatever arrives over `subscribe`.
export function usePeerConnection({ localStream, send, subscribe }) {
  const pcRef = useRef(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [connectionState, setConnectionState] = useState("new");

  useEffect(() => {
    if (!localStream || !send || !subscribe) return;

    const pc = createPeerConnection();
    pcRef.current = pc;

    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        send({ type: "ice-candidate", candidate: event.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState);
    };

    const unsubscribe = subscribe(async (message) => {
      try {
        if (message.type === "peer-joined" && message.initiator) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          send({ type: "offer", sdp: pc.localDescription });
        } else if (message.type === "offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send({ type: "answer", sdp: pc.localDescription });
        } else if (message.type === "answer") {
          await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
        } else if (message.type === "ice-candidate") {
          await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
        } else if (message.type === "peer-left") {
          setRemoteStream(null);
        }
      } catch (err) {
        console.error("usePeerConnection: failed to handle", message.type, err);
      }
    });

    return () => {
      unsubscribe();
      pc.close();
      pcRef.current = null;
    };
  }, [localStream, send, subscribe]);

  return { remoteStream, connectionState };
}
