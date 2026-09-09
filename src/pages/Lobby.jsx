import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext.jsx";
import LanguageSwitch from "../components/LanguageSwitch.jsx";
import ThemeSwitch from "../components/ThemeSwitch.jsx";
import AccountBadge from "../components/AccountBadge.jsx";
import { loadSslPreference, saveSslPreference } from "../utils/sslPreference.js";

// Pre-call lobby: camera/mic preview + device picker before joining the room.
// This only touches local media (getUserMedia) — no signaling/backend yet.
export default function Lobby() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [devices, setDevices] = useState({ cameras: [], mics: [] });
  const [selectedCamera, setSelectedCamera] = useState("");
  const [selectedMic, setSelectedMic] = useState("");
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [error, setError] = useState(null);
  const [sslEnabled, setSslEnabled] = useState(loadSslPreference);

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

  const toggleSsl = () => {
    setSslEnabled((on) => {
      const next = !on;
      saveSslPreference(next);
      return next;
    });
  };

  const join = () => {
    navigate(`/call/${roomCode}`, { state: { sslEnabled } });
  };

  return (
    <div className="lobby">
      <header className="lobby-top">
        <button className="icon-btn" aria-label={t("lobby.back")} onClick={() => navigate("/")}>
          ←
        </button>
        <span className="pill">
          <span className="dot dot-ok" />
          {t("lobby.room")} · {roomCode}
        </span>
        <div className="header-controls">
          <ThemeSwitch />
          <LanguageSwitch />
          <AccountBadge />
        </div>
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
              <strong>{t("lobby.errorHeading")}</strong>
              <p>{error}</p>
            </div>
          )}
        </div>

        <aside className="lobby-panel">
          <h1>{t("lobby.ready")}</h1>
          <p>{t("lobby.checkDevices")}</p>

          <div className="lobby-toggles">
            <button
              className="btn btn-ghost"
              onClick={toggleMic}
              aria-pressed={micOn}
            >
              {micOn ? `🎤 ${t("lobby.micOn")}` : `🔇 ${t("lobby.micOff")}`}
            </button>
            <button
              className="btn btn-ghost"
              onClick={toggleCamera}
              aria-pressed={cameraOn}
            >
              {cameraOn ? `📷 ${t("lobby.cameraOn")}` : `🚫 ${t("lobby.cameraOff")}`}
            </button>
          </div>

          <div className="lobby-devices">
            <label>
              {t("lobby.cameraLabel")}
              <select
                className="field"
                value={selectedCamera}
                onChange={(e) => setSelectedCamera(e.target.value)}
              >
                {devices.cameras.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || t("lobby.cameraFallback")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("lobby.micLabel")}
              <select
                className="field"
                value={selectedMic}
                onChange={(e) => setSelectedMic(e.target.value)}
              >
                {devices.mics.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || t("lobby.micFallback")}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="lobby-ssl">
            <div className="panel-row">
              <div className="panel-row-label">
                <strong>{t("lobby.sslToggleLabel")}</strong>
                <span>{sslEnabled ? t("call.on") : t("call.off")}</span>
              </div>
              <button
                className="switch"
                aria-pressed={sslEnabled}
                aria-label={t("lobby.sslToggleLabel")}
                onClick={toggleSsl}
              />
            </div>
            <p className="lobby-ssl-hint">{t("lobby.sslToggleDesc")}</p>
          </div>

          <button
            className="btn btn-primary btn-block lobby-join"
            onClick={join}
            disabled={!!error}
          >
            {t("lobby.join")}
          </button>
        </aside>
      </div>
    </div>
  );
}
