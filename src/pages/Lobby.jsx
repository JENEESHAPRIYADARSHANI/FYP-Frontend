import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

// Pre-call lobby: camera/mic preview + device picker before joining the room.
// This only touches local media (getUserMedia) — no signaling/backend yet.
export default function Lobby() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [devices, setDevices] = useState({ cameras: [], mics: [] });
  const [selectedCamera, setSelectedCamera] = useState("");
  const [selectedMic, setSelectedMic] = useState("");
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;

        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const cameras = allDevices.filter((d) => d.kind === "videoinput");
        const mics = allDevices.filter((d) => d.kind === "audioinput");
        setDevices({ cameras, mics });
        setSelectedCamera(stream.getVideoTracks()[0]?.getSettings().deviceId ?? "");
        setSelectedMic(stream.getAudioTracks()[0]?.getSettings().deviceId ?? "");
      } catch (err) {
        if (!cancelled) setError(err.message || "Camera/microphone permission denied.");
      }
    }

    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const toggleMic = () => {
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setMicOn((on) => !on);
  };

  const toggleCamera = () => {
    streamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setCameraOn((on) => !on);
  };

  const join = () => {
    // Phase 2 wires this to the actual call room + signaling connection.
    navigate(`/call/${roomCode}`);
  };

  return (
    <div className="lobby">
      <header className="lobby-top">
        <button className="icon-btn" aria-label="Back to home" onClick={() => navigate("/")}>
          ←
        </button>
        <span className="pill">
          <span className="dot dot-ok" />
          ROOM · {roomCode}
        </span>
      </header>

      <div className="lobby-main">
        <div className="lobby-preview-card">
          <video ref={videoRef} autoPlay muted playsInline />
          {!cameraOn && !error && (
            <div className="lobby-camera-off">
              <span className="avatar-placeholder" />
            </div>
          )}
          {error && (
            <div className="lobby-error">
              <strong>Camera/microphone access needed</strong>
              <p>{error}</p>
            </div>
          )}
        </div>

        <aside className="lobby-panel">
          <h1>Ready to join?</h1>
          <p>Check your camera and microphone before you go in.</p>

          <div className="lobby-toggles">
            <button
              className="btn btn-ghost"
              onClick={toggleMic}
              aria-pressed={micOn}
            >
              {micOn ? "🎤 Mic on" : "🔇 Mic off"}
            </button>
            <button
              className="btn btn-ghost"
              onClick={toggleCamera}
              aria-pressed={cameraOn}
            >
              {cameraOn ? "📷 Camera on" : "🚫 Camera off"}
            </button>
          </div>

          <div className="lobby-devices">
            <label>
              Camera
              <select
                className="field"
                value={selectedCamera}
                onChange={(e) => setSelectedCamera(e.target.value)}
              >
                {devices.cameras.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || "Camera"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Microphone
              <select
                className="field"
                value={selectedMic}
                onChange={(e) => setSelectedMic(e.target.value)}
              >
                {devices.mics.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || "Microphone"}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            className="btn btn-primary btn-block lobby-join"
            onClick={join}
            disabled={!!error}
          >
            Join
          </button>
        </aside>
      </div>
    </div>
  );
}
