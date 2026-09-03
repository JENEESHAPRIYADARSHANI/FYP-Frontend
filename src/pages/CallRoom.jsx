import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSignalingSocket } from "../hooks/useSignalingSocket.js";
import { usePeerConnection } from "../hooks/usePeerConnection.js";
import { useLandmarkStream } from "../hooks/useLandmarkStream.js";
import { useLanguage } from "../context/LanguageContext.jsx";
import LanguageSwitch from "../components/LanguageSwitch.jsx";
import {
  MicIcon,
  CameraIcon,
  ShareIcon,
  ParticipantsIcon,
  ChatIcon,
  MoreIcon,
  LeaveIcon,
  SettingsIcon,
} from "../components/icons.jsx";

const STATUS_KEY = {
  connected: "call.statusConnected",
  connecting: "call.statusConnecting",
  new: "call.statusConnecting",
  disconnected: "call.statusReconnecting",
  failed: "call.statusReconnecting",
  closed: "call.statusEnded",
};

const CAPTION_SIZES = { small: "0.85rem", medium: "1.05rem", large: "1.3rem" };
const A11Y_STORAGE_KEY = "signconnect-a11y-settings-v1";
const DEFAULT_A11Y = {
  captionsOn: true,
  captionSize: "medium",
  captionBg: "dark",
  selfViewSize: "standard",
  highContrast: false,
};
const MAX_SSL_HISTORY = 5;

function loadA11ySettings() {
  try {
    const raw = localStorage.getItem(A11Y_STORAGE_KEY);
    return raw ? { ...DEFAULT_A11Y, ...JSON.parse(raw) } : DEFAULT_A11Y;
  } catch {
    return DEFAULT_A11Y;
  }
}

function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatClock(date) {
  return date.toTimeString().slice(0, 8);
}

export default function CallRoom() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const timerRef = useRef(null);
  const screenStreamRef = useRef(null);
  const lastCameraDeviceIdRef = useRef(null);

  const [localStream, setLocalStream] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [recognitionOn, setRecognitionOn] = useState(true);
  const [rightPanelTab, setRightPanelTab] = useState("ssl");
  const [signFocus, setSignFocus] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [a11y, setA11y] = useState(loadA11ySettings);
  const [remoteIsSigning, setRemoteIsSigning] = useState(false);
  const [sslHistory, setSslHistory] = useState([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const { status: signalStatus, role, send, subscribe } = useSignalingSocket(roomCode);
  const { remoteStream, connectionState, replaceVideoTrack } = usePeerConnection({
    localStream,
    send,
    subscribe,
  });
  const { prediction, isSigning } = useLandmarkStream({
    videoRef: localVideoRef,
    active: Boolean(localStream) && cameraOn && recognitionOn,
  });

  function roleLabel(r) {
    if (r === "teacher") return t("call.teacher");
    if (r === "student") return t("call.student");
    return t("call.participant");
  }

  // Camera/mic acquisition.
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

  // Persist accessibility preferences across sessions.
  useEffect(() => {
    try {
      localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(a11y));
    } catch {
      /* localStorage unavailable (private mode, quota) — settings just won't persist */
    }
  }, [a11y]);

  // Call duration, counted only while actually connected.
  useEffect(() => {
    if (connectionState !== "connected") {
      clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [connectionState]);

  // Tell the other peer whenever our own hand-detection state flips, so they
  // can show a "Signing" badge on your video — mirrors the same signal they
  // send us for theirs.
  useEffect(() => {
    send({ type: "signing-state", isSigning });
  }, [isSigning, send]);

  useEffect(() => {
    const unsubscribe = subscribe((message) => {
      if (message.type === "signing-state") setRemoteIsSigning(Boolean(message.isSigning));
      if (message.type === "peer-left") setRemoteIsSigning(false);
    });
    return unsubscribe;
  }, [subscribe]);

  // Keep a short, timestamped log of confirmed recognitions for the SSL panel.
  useEffect(() => {
    if (!prediction) return;
    setSslHistory((history) => {
      if (history[0]?.sign === prediction.sign && Date.now() - history[0]?.at < 4000) {
        return history; // same sign still showing — don't spam duplicate rows
      }
      const entry = { ...prediction, at: Date.now(), time: formatClock(new Date()) };
      return [entry, ...history].slice(0, MAX_SSL_HISTORY);
    });
  }, [prediction]);

  const toggleMic = () => {
    localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
    });
    setMicOn((on) => !on);
  };

  // Actually stops the hardware track on "off" (not just track.enabled =
  // false) so the camera's physical indicator light turns off — muting alone
  // leaves the device captured and the LED lit, which is a real privacy
  // concern to get right, especially building for children. Re-enabling
  // re-requests the same physical camera and feeds the fresh track back into
  // both the self-view element and the peer connection.
  const toggleCamera = async () => {
    if (cameraOn) {
      const track = localStream?.getVideoTracks()[0];
      const deviceId = track?.getSettings().deviceId;
      lastCameraDeviceIdRef.current = deviceId;
      if (track) {
        track.stop();
        localStream.removeTrack(track);
      }
      await replaceVideoTrack(null);
      setCameraOn(false);
      return;
    }
    try {
      const deviceId = lastCameraDeviceIdRef.current;
      const freshStream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      const newTrack = freshStream.getVideoTracks()[0];
      localStream?.addTrack(newTrack);
      await replaceVideoTrack(newTrack);
      setCameraOn(true);
    } catch {
      // Permission revoked or camera unavailable — stay off rather than
      // leaving the toggle in an inconsistent state.
    }
  };

  const leave = () => {
    localStream?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    navigate("/");
  };

  // Screen share swaps the outgoing WebRTC video track only — localVideoRef
  // (and therefore the self-view tile and SSL hand-landmark detection, which
  // reads from that same element) keeps showing your camera throughout, so
  // signing recognition never stops just because you're sharing your screen.
  const stopScreenShare = () => {
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    const camTrack = localStream?.getVideoTracks()[0];
    if (camTrack) replaceVideoTrack(camTrack);
    setIsScreenSharing(false);
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      stopScreenShare();
      return;
    }
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      screenStreamRef.current = screenStream;
      await replaceVideoTrack(screenTrack);
      // The browser's own "Stop sharing" control ends the track directly —
      // catch that so our toggle state doesn't go stale.
      screenTrack.onended = stopScreenShare;
      setIsScreenSharing(true);
    } catch {
      // User cancelled the screen/window picker — nothing to do.
    }
  };

  const togglePanel = (tab) => {
    setRightPanelTab((current) => (current === tab ? null : tab));
  };

  const setA11yField = (field, value) => {
    setA11y((current) => ({ ...current, [field]: value }));
  };

  if (signalStatus === "room-full") {
    return (
      <div className="call-room call-room-blocked">
        <div className="blocked-card">
          <span className="dot dot-danger" />
          <h1>{t("call.roomFullTitle")}</h1>
          <p>{t("call.roomFullDesc")}</p>
          <button className="btn btn-primary" onClick={() => navigate("/")}>
            {t("call.returnHome")}
          </button>
        </div>
      </div>
    );
  }

  const statusKey = connectionState in STATUS_KEY ? connectionState : "connecting";
  const otherRoleLabel = role === "teacher" ? t("call.student") : role === "student" ? t("call.teacher") : t("call.participant");

  return (
    <div className={`call-room${a11y.highContrast ? " high-contrast" : ""}`}>
      <header className="call-topbar">
        <div className="call-topbar-title">
          <strong>{t("call.room")} · {roomCode}</strong>
          <span className="call-topbar-status">
            <span className={`dot ${statusKey === "connected" ? "dot-ok" : "dot-warn"}`} />
            {t(STATUS_KEY[statusKey])}
            {statusKey === "connected" && ` · ${formatDuration(elapsedSeconds)}`}
          </span>
        </div>
        {isScreenSharing && (
          <button className="pill call-sharing-pill" onClick={stopScreenShare}>
            <span className="dot dot-ok" />
            {t("call.youAreSharing")}
          </button>
        )}
        <span className="call-topbar-spacer" />
        <button
          className="icon-btn"
          aria-label={t("call.settingsOpen")}
          title={t("call.settingsOpen")}
          onClick={() => setSettingsOpen(true)}
        >
          <SettingsIcon />
        </button>
      </header>

      <div className="call-body">
        <div className={`call-video-area${signFocus ? " sign-focus" : ""}`}>
          <div className="call-remote">
            {remoteStream ? (
              <>
                <video ref={remoteVideoRef} autoPlay playsInline />
                {remoteIsSigning && (
                  <span className="call-signing-badge">
                    <span className="dot" /> {t("call.signingBadge")}
                  </span>
                )}
                <button
                  className="sign-focus-btn"
                  aria-pressed={signFocus}
                  onClick={() => setSignFocus((v) => !v)}
                >
                  ⤢ {t("call.signFocus")}
                </button>
                <span className="call-speaker-chip">
                  <span className={`dot ${statusKey === "connected" ? "dot-ok" : "dot-warn"}`} />
                  {otherRoleLabel}
                </span>
              </>
            ) : (
              <div className="call-waiting">
                <span className="call-waiting-ring" />
                <p>{t("call.waiting")}</p>
              </div>
            )}
          </div>

          {a11y.captionsOn && (
            <div className={`call-caption caption-bg-${a11y.captionBg}`} style={{ "--caption-font-size": CAPTION_SIZES[a11y.captionSize] }}>
              <span className="caption-tag">{t("call.captionTag")}</span>
              <p>{t("call.captionPlaceholder")}</p>
            </div>
          )}

          <div className="call-thumbnails">
            <div className={`call-local${a11y.selfViewSize === "large" ? " self-view-large" : ""}`}>
              {cameraOn ? (
                <video
                  ref={(el) => {
                    // This element unmounts/remounts each time cameraOn
                    // flips (see the placeholder div below), which drops the
                    // DOM-level srcObject binding — a plain ref only fires on
                    // mount, with nothing to rebind it afterwards, so set it
                    // right here rather than relying on a separate effect.
                    localVideoRef.current = el;
                    if (el && localStream) el.srcObject = localStream;
                  }}
                  autoPlay
                  muted
                  playsInline
                />
              ) : (
                <div className="call-local-off">
                  <span className="avatar-placeholder" />
                </div>
              )}
              <span className="call-local-tag">
                <span className={`dot ${micOn ? "dot-ok" : "dot-danger"}`} />
                {t("call.you")}
              </span>
            </div>
          </div>
        </div>

        {rightPanelTab && (
          <aside className="call-panel">
            <div className="call-panel-tabs" role="tablist">
              <button
                className="call-panel-tab"
                role="tab"
                aria-selected={rightPanelTab === "participants"}
                onClick={() => setRightPanelTab("participants")}
              >
                {t("call.tabParticipants")}
              </button>
              <button
                className="call-panel-tab"
                role="tab"
                aria-selected={rightPanelTab === "ssl"}
                onClick={() => setRightPanelTab("ssl")}
              >
                {t("call.tabSsl")}
              </button>
              <button
                className="call-panel-tab"
                role="tab"
                aria-selected={rightPanelTab === "chat"}
                onClick={() => setRightPanelTab("chat")}
              >
                {t("call.tabChat")}
              </button>
              <button
                className="call-panel-tab"
                role="tab"
                aria-selected={rightPanelTab === "transcript"}
                onClick={() => setRightPanelTab("transcript")}
              >
                {t("call.tabTranscript")}
              </button>
              <button
                className="call-panel-close"
                aria-label={t("call.closePanel")}
                onClick={() => setRightPanelTab(null)}
              >
                ✕
              </button>
            </div>

            <div className="call-panel-body">
              {rightPanelTab === "participants" && (
                <>
                  <div className="panel-heading">{t("call.participantsHeading")}</div>
                  <div className="panel-row">
                    <div className="panel-row-label">
                      <strong>{t("call.you")}</strong>
                      <span>{roleLabel(role)}</span>
                    </div>
                    <span className={`dot ${micOn ? "dot-ok" : "dot-danger"}`} />
                  </div>
                  <div className="panel-row">
                    <div className="panel-row-label">
                      <strong>{otherRoleLabel}</strong>
                      <span>{remoteStream ? t("call.connected") : t("call.waitingToJoin")}</span>
                    </div>
                    <span className={`dot ${remoteStream ? "dot-ok" : "dot-warn"}`} />
                  </div>
                </>
              )}

              {rightPanelTab === "ssl" && (
                <>
                  <div>
                    <div className="panel-heading">{t("call.sslHeading")}</div>
                    <p className="panel-sub">{t("call.sslSub")}</p>
                  </div>

                  <div className="panel-row">
                    <div className="panel-row-label">
                      <strong>{t("call.recognition")}</strong>
                      <span>{recognitionOn ? t("call.on") : t("call.off")}</span>
                    </div>
                    <button
                      className="switch"
                      aria-pressed={recognitionOn}
                      aria-label={t("call.recognition")}
                      onClick={() => setRecognitionOn((v) => !v)}
                    />
                  </div>

                  {prediction ? (
                    <div className="ssl-output-card">
                      <span className="ssl-output-eyebrow">{t("call.recognizedSign")}</span>
                      <span className="ssl-output-sign">"{prediction.sign}"</span>
                      <div className="ssl-confidence-track">
                        <div
                          className="ssl-confidence-fill"
                          style={{ width: `${Math.round(prediction.confidence * 100)}%` }}
                        />
                      </div>
                      <span className="ssl-confidence-label">
                        {t("call.confidence")}: {Math.round(prediction.confidence * 100)}%
                      </span>
                    </div>
                  ) : (
                    <div className="ssl-empty">
                      {recognitionOn ? t("call.sslEmptyOn") : t("call.sslEmptyOff")}
                    </div>
                  )}

                  {sslHistory.length > 0 && (
                    <>
                      <div className="ssl-history-heading">{t("call.recentRecognitions")}</div>
                      <div className="ssl-history-list">
                        {sslHistory.map((entry) => (
                          <div className="ssl-history-row" key={entry.at}>
                            <span>"{entry.sign}"</span>
                            <time>{entry.time}</time>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              {rightPanelTab === "chat" && (
                <div className="panel-placeholder">
                  <strong>{t("call.chatSoonTitle")}</strong>
                  <p>{t("call.chatSoonDesc")}</p>
                </div>
              )}

              {rightPanelTab === "transcript" && (
                <div className="panel-placeholder">
                  <strong>{t("call.transcriptSoonTitle")}</strong>
                  <p>{t("call.transcriptSoonDesc")}</p>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      <div className="call-dock">
        <button className="dock-btn dock-btn-mute" onClick={toggleMic} aria-pressed={micOn} aria-label={t("call.micToggle")}>
          <MicIcon slash={!micOn} />
        </button>
        <button className="dock-btn dock-btn-mute" onClick={toggleCamera} aria-pressed={cameraOn} aria-label={t("call.cameraToggle")}>
          <CameraIcon slash={!cameraOn} />
        </button>
        <button
          className="dock-btn dock-btn-accent"
          aria-pressed={a11y.captionsOn}
          aria-label={t("call.captionsToggle")}
          title="CC"
          onClick={() => setA11yField("captionsOn", !a11y.captionsOn)}
        >
          CC
        </button>
        <button
          className="dock-btn dock-btn-accent"
          aria-pressed={isScreenSharing}
          onClick={toggleScreenShare}
          title={isScreenSharing ? t("call.stopScreenShare") : t("call.screenShareToggle")}
          aria-label={isScreenSharing ? t("call.stopScreenShare") : t("call.screenShareToggle")}
        >
          <ShareIcon />
        </button>
        <button
          className="dock-btn dock-btn-ssl"
          aria-pressed={rightPanelTab === "ssl"}
          aria-label={t("call.sslToggle")}
          title="SSL"
          onClick={() => togglePanel("ssl")}
        >
          SSL
        </button>
        <button
          className="dock-btn"
          aria-pressed={rightPanelTab === "participants"}
          aria-label={t("call.participantsToggle")}
          title={t("call.tabParticipants")}
          onClick={() => togglePanel("participants")}
        >
          <ParticipantsIcon />
        </button>
        <button
          className="dock-btn"
          aria-pressed={rightPanelTab === "chat"}
          aria-label={t("call.chatToggle")}
          title={t("call.tabChat")}
          onClick={() => togglePanel("chat")}
        >
          <ChatIcon />
        </button>
        <button className="dock-btn" aria-label={t("call.moreOptions")} title={t("call.settingsOpen")} onClick={() => setSettingsOpen(true)}>
          <MoreIcon />
        </button>
        <span className="dock-divider" />
        <button className="dock-btn dock-btn-danger" onClick={leave} aria-label={t("call.leaveCall")}>
          <LeaveIcon />
        </button>
      </div>

      {settingsOpen && (
        <div className="settings-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-head">
              <div>
                <h2>{t("settings.title")}</h2>
                <p>{t("settings.subtitle")}</p>
              </div>
              <button className="icon-btn" aria-label={t("settings.close")} onClick={() => setSettingsOpen(false)}>
                ✕
              </button>
            </div>

            <div className="settings-section">
              <span className="settings-section-title">{t("settings.sectionLanguage")}</span>
              <span className="settings-field-label">{t("settings.languageHint")}</span>
              <LanguageSwitch />
            </div>

            <div className="settings-section">
              <span className="settings-section-title">{t("settings.sectionCaptions")}</span>
              <span className="settings-field-label">{t("settings.captionSize")}</span>
              <div className="segmented" role="group" aria-label={t("settings.captionSize")}>
                {[
                  ["small", t("settings.small")],
                  ["medium", t("settings.medium")],
                  ["large", t("settings.large")],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={a11y.captionSize === value}
                    onClick={() => setA11yField("captionSize", value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="settings-field-label">{t("settings.captionBackground")}</span>
              <div className="segmented" role="group" aria-label={t("settings.captionBackground")}>
                {[
                  ["light", t("settings.light")],
                  ["dark", t("settings.dark")],
                  ["contrast", t("settings.highContrastOpt")],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={a11y.captionBg === value}
                    onClick={() => setA11yField("captionBg", value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-section">
              <span className="settings-section-title">{t("settings.sectionSignVideo")}</span>
              <span className="settings-field-label">{t("settings.selfViewSize")}</span>
              <div className="segmented" role="group" aria-label={t("settings.selfViewSize")}>
                {[
                  ["standard", t("settings.standard")],
                  ["large", t("settings.largeOpt")],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={a11y.selfViewSize === value}
                    onClick={() => setA11yField("selfViewSize", value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-section">
              <span className="settings-section-title">{t("settings.sectionDisplay")}</span>
              <div className="settings-toggle-row">
                <div className="panel-row-label">
                  <strong>{t("settings.highContrastMode")}</strong>
                  <span>{t("settings.highContrastDesc")}</span>
                </div>
                <button
                  className="switch"
                  aria-pressed={a11y.highContrast}
                  aria-label={t("settings.highContrastMode")}
                  onClick={() => setA11yField("highContrast", !a11y.highContrast)}
                />
              </div>
            </div>

            <button className="btn btn-primary btn-block" onClick={() => setSettingsOpen(false)}>
              {t("settings.done")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
