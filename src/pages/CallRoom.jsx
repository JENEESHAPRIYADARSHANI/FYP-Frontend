import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSignalingSocket } from "../hooks/useSignalingSocket.js";
import { usePeerConnection } from "../hooks/usePeerConnection.js";
import { useLandmarkStream } from "../hooks/useLandmarkStream.js";

const STATUS_LABEL = {
  connected: "Connected",
  connecting: "Connecting",
  new: "Connecting",
  disconnected: "Reconnecting",
  failed: "Reconnecting",
  closed: "Call ended",
};

export default function CallRoom() {
  const { roomCode } = useParams();
  const navigate = useNavigate();

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const [localStream, setLocalStream] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);

  const { status: signalStatus, send, subscribe } = useSignalingSocket(roomCode);
  const { remoteStream, connectionState } = usePeerConnection({
    localStream,
    send,
    subscribe,
  });
  const { prediction } = useLandmarkStream({
    videoRef: localVideoRef,
    active: Boolean(localStream) && cameraOn,
  });

  useEffect(() => {
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        setLocalStream(stream);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      setLocalStream((stream) => {
        stream?.getTracks().forEach((track) => track.stop());
        return null;
      });
    };
  }, []);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream ?? null;
    }
  }, [remoteStream]);

  const toggleMic = () => {
    localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setMicOn((on) => !on);
  };

  const toggleCamera = () => {
    localStream?.getVideoTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setCameraOn((on) => !on);
  };

  const leave = () => {
    localStream?.getTracks().forEach((track) => track.stop());
    navigate("/");
  };

  if (signalStatus === "room-full") {
    return (
      <div className="call-room call-room-blocked">
        <div className="blocked-card">
          <span className="dot dot-danger" />
          <h1>This room already has two participants.</h1>
          <p>Ask your teacher for a new room code, or start your own class.</p>
          <button className="btn btn-primary" onClick={() => navigate("/")}>
            Return home
          </button>
        </div>
      </div>
    );
  }

  const statusKey = connectionState in STATUS_LABEL ? connectionState : "connecting";
  const statusDot = statusKey === "connected" ? "dot-ok" : "dot-warn";

  return (
    <div className="call-room">
      <div className="call-remote">
        {remoteStream ? (
          <video ref={remoteVideoRef} autoPlay playsInline />
        ) : (
          <div className="call-waiting">
            <span className="call-waiting-ring" />
            <p>Waiting for the other participant to join…</p>
          </div>
        )}
      </div>

      <span className="pill call-status">
        <span className={`dot ${statusDot}`} />
        {STATUS_LABEL[statusKey]}
      </span>
      <span className="pill call-roomchip">{roomCode}</span>

      <div className="call-caption">
        <span className="caption-tag">Voice</span>
        <p>"...could you repeat the last sign, please..."</p>
      </div>

      {prediction && (
        <div className="call-signout">
          <span className="signout-tag">Sign</span>
          <strong>{prediction.sign}</strong>
          <span className="signout-confidence">
            {Math.round(prediction.confidence * 100)}% confidence
          </span>
        </div>
      )}

      <div className="call-local">
        {cameraOn ? (
          <video ref={localVideoRef} autoPlay muted playsInline />
        ) : (
          <div className="call-local-off">
            <span className="avatar-placeholder" />
          </div>
        )}
        <span className="call-local-tag">You</span>
      </div>

      <div className="call-dock">
        <button className="dock-btn" onClick={toggleMic} aria-pressed={micOn}>
          {micOn ? "🎤" : "🔇"}
        </button>
        <button className="dock-btn" onClick={toggleCamera} aria-pressed={cameraOn}>
          {cameraOn ? "📷" : "🚫"}
        </button>
        <span className="dock-divider" />
        <button className="dock-btn dock-btn-danger" onClick={leave} aria-label="Leave call">
          ⏻
        </button>
      </div>
    </div>
  );
}
