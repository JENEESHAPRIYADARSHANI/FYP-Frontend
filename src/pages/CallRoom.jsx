import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useSignalingSocket } from "../hooks/useSignalingSocket.js";
import { usePeerConnection } from "../hooks/usePeerConnection.js";
import { useLandmarkStream } from "../hooks/useLandmarkStream.js";
import { useLanguage } from "../context/LanguageContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useProfile } from "../context/ProfileContext.jsx";
import LanguageSwitch from "../components/LanguageSwitch.jsx";
import ThemeSwitch from "../components/ThemeSwitch.jsx";
import AccountBadge from "../components/AccountBadge.jsx";
import RenameControl from "../components/RenameControl.jsx";
import CopyLinkButton from "../components/CopyLinkButton.jsx";
import UserAvatar from "../components/UserAvatar.jsx";
import { loadSslPreference, saveSslPreference } from "../utils/sslPreference.js";
import { createCallRecorder, downloadRecording } from "../services/recordingService.js";
import Whiteboard from "../components/Whiteboard.jsx";
import { useSpeechCaptions, speechRecognitionSupported } from "../hooks/useSpeechCaptions.js";
import { speakSinhala } from "../services/speechService.js";
import {
  MicIcon,
  CameraIcon,
  ShareIcon,
  ParticipantsIcon,
  ChatIcon,
  MoreIcon,
  LeaveIcon,
  SettingsIcon,
  WhiteboardIcon,
  RecordIcon,
  SwapIcon,
  HandIcon,
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
  const location = useLocation();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { profile, saveProfile } = useProfile();

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteThumbVideoRef = useRef(null);
  const timerRef = useRef(null);
  const recordTimerRef = useRef(null);
  const screenStreamRef = useRef(null);
  const lastCameraDeviceIdRef = useRef(null);
  const recorderRef = useRef(null);

  const [localStream, setLocalStream] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  // Seeded from the Lobby's toggle when arriving via the normal join flow;
  // falls back to the saved per-device preference if the room URL was
  // opened directly. Never gated by a Keycloak role — see sslPreference.js.
  const [recognitionOn, setRecognitionOn] = useState(
    () => location.state?.sslEnabled ?? loadSslPreference()
  );
  const [rightPanelTab, setRightPanelTab] = useState("ssl");
  const [signFocus, setSignFocus] = useState(false);
  // Which feed is in the big "stage" slot vs the small corner slot — the
  // Zoom-style "swap"/"pin" feature. With only ever two people in a Hastha
  // call, pinning one is the same operation as swapping the other into the
  // corner, so one piece of state covers both. Purely local UI state, never
  // sent to the peer: each person can arrange their own view independently,
  // exactly like Zoom/Meet.
  const [mainView, setMainView] = useState("remote"); // "remote" | "local"
  // A manual drag-resize of the corner tile, in pixels — null means "use
  // whatever the accessibility Self-view-size setting/CSS default says".
  // Cleared whenever that setting changes (see the effect below it) so the
  // two controls don't fight: picking a preset always wins over a stale drag.
  const [pipWidth, setPipWidth] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [a11y, setA11y] = useState(loadA11ySettings);
  const [remoteIsSigning, setRemoteIsSigning] = useState(false);
  // Whether the peer's own camera is on — distinct from `remoteStream`
  // existing at all (connected vs. not). Assume on until told otherwise:
  // there's a brief window after connecting before their first camera-state
  // message arrives, and defaulting to "on" means that window shows a black
  // video frame rather than an avatar flash that immediately disappears.
  const [remoteCameraOn, setRemoteCameraOn] = useState(true);
  const [remoteIdentity, setRemoteIdentity] = useState(null); // { displayName, picture }
  const [sslHistory, setSslHistory] = useState([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteIsSharing, setRemoteIsSharing] = useState(false);
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [remoteIsRecording, setRemoteIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  // Teacher hears the student's signs spoken aloud (voiceOn), and the student
  // sees the teacher's speech as live captions (liveCaption). One direction
  // each way by design — see the two effects below.
  const [voiceOn, setVoiceOn] = useState(true);
  const [liveCaption, setLiveCaption] = useState(null); // { text, at }
  const [peerSign, setPeerSign] = useState(null); // { sign, signSi, at }
  const [chatMessages, setChatMessages] = useState([]); // { id, from: "me"|"peer", text, at }
  const [chatDraft, setChatDraft] = useState("");
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const voiceOnRef = useRef(true);
  const lastSentSignRef = useRef(null);
  const chatListRef = useRef(null);
  const rightPanelTabRef = useRef(rightPanelTab);

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

  // Keep the saved preference in sync if it's changed mid-call, so the
  // in-call toggle and the Lobby toggle always agree next time.
  useEffect(() => {
    saveSslPreference(recognitionOn);
  }, [recognitionOn]);

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

  // Tell the peer whenever our own camera flips, so they can show our
  // avatar in place of a black video frame — the Meet/Zoom-style behavior.
  useEffect(() => {
    send({ type: "camera-state", on: cameraOn });
  }, [cameraOn, send]);

  // Tell the peer who we are (name + Google picture, if signed in with
  // Google), so that avatar has something real to show. Re-sent whenever
  // either value changes — display name via a rename, or the profile
  // finishing its initial load after the signaling connection is already up.
  useEffect(() => {
    send({
      type: "identity",
      displayName: profile?.display_name || user?.name || null,
      picture: user?.picture || null,
    });
  }, [profile?.display_name, user?.name, user?.picture, send]);

  useEffect(() => {
    voiceOnRef.current = voiceOn;
    if (!voiceOn) window.speechSynthesis?.cancel();
  }, [voiceOn]);

  useEffect(() => {
    rightPanelTabRef.current = rightPanelTab;
    if (rightPanelTab === "chat") setUnreadChatCount(0);
  }, [rightPanelTab]);

  // Scroll to the newest message whenever the chat log grows.
  useEffect(() => {
    if (chatListRef.current) {
      chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Student -> teacher: send each newly recognized sign once. `prediction`
  // is re-created on every inference while the same sign is held, so we
  // compare against the last sent sign rather than firing per update.
  useEffect(() => {
    if (role !== "student") return;
    if (!prediction) {
      lastSentSignRef.current = null;
      return;
    }
    if (lastSentSignRef.current === prediction.sign) return;
    lastSentSignRef.current = prediction.sign;
    send({ type: "sign-recognized", sign: prediction.sign, signSi: prediction.signSi });
  }, [prediction, role, send]);

  // Teacher -> student: transcribe the teacher's microphone in Sinhala and
  // relay the text as it's spoken (interim results too, so captions keep up).
  useSpeechCaptions({
    active: role === "teacher" && micOn && Boolean(localStream),
    lang: "si-LK",
    onText: (text, isFinal) => send({ type: "caption", text, final: isFinal }),
  });

  // Captions and signs are momentary — fade them out once speech/signing stops.
  useEffect(() => {
    if (!liveCaption) return;
    const timer = setTimeout(() => setLiveCaption(null), 5000);
    return () => clearTimeout(timer);
  }, [liveCaption]);

  useEffect(() => {
    if (!peerSign) return;
    const timer = setTimeout(() => setPeerSign(null), 5000);
    return () => clearTimeout(timer);
  }, [peerSign]);

  useEffect(() => {
    const unsubscribe = subscribe((message) => {
      if (message.type === "sign-recognized") {
        setPeerSign({ sign: message.sign, signSi: message.signSi, at: Date.now() });
        if (voiceOnRef.current) speakSinhala(message.signSi || message.sign);
      }
      if (message.type === "caption") {
        setLiveCaption({ text: message.text, at: Date.now() });
      }
      if (message.type === "signing-state") setRemoteIsSigning(Boolean(message.isSigning));
      if (message.type === "screen-share-state") setRemoteIsSharing(Boolean(message.sharing));
      if (message.type === "recording-state") setRemoteIsRecording(Boolean(message.recording));
      if (message.type === "whiteboard-toggle") setWhiteboardOpen(Boolean(message.open));
      if (message.type === "camera-state") setRemoteCameraOn(Boolean(message.on));
      if (message.type === "identity") {
        setRemoteIdentity({ displayName: message.displayName, picture: message.picture });
      }
      if (message.type === "chat-message") {
        setChatMessages((msgs) => [
          ...msgs,
          { id: `${Date.now()}-${Math.random()}`, from: "peer", text: message.text, at: Date.now() },
        ]);
        if (rightPanelTabRef.current !== "chat") {
          setUnreadChatCount((n) => n + 1);
        }
      }
      if (message.type === "peer-left") {
        setLiveCaption(null);
        setPeerSign(null);
        setRemoteIsSigning(false);
        setRemoteIsSharing(false);
        setRemoteIsRecording(false);
        setRemoteCameraOn(true);
        setRemoteIdentity(null);
      }
      // A peer who (re)joins starts with no idea who we are or whether our
      // camera is on — our own "identity"/"camera-state" effects only fire
      // when OUR data changes, not when THEY reconnect, so without this the
      // still-connected side never catches a fresh/reconnected peer up.
      if (message.type === "peer-joined") {
        send({
          type: "identity",
          displayName: profile?.display_name || user?.name || null,
          picture: user?.picture || null,
        });
        send({ type: "camera-state", on: cameraOn });
      }
    });
    return unsubscribe;
  }, [subscribe, send, profile?.display_name, user?.name, user?.picture, cameraOn]);

  // Recording timer, counted only while actively recording.
  useEffect(() => {
    if (!isRecording) {
      setRecordSeconds(0);
      return;
    }
    recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    return () => clearInterval(recordTimerRef.current);
  }, [isRecording]);

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

  const sendChatMessage = (event) => {
    event.preventDefault();
    const text = chatDraft.trim();
    if (!text) return;
    send({ type: "chat-message", text });
    setChatMessages((msgs) => [...msgs, { id: `${Date.now()}-${Math.random()}`, from: "me", text, at: Date.now() }]);
    setChatDraft("");
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
    if (isRecording) {
      recorderRef.current?.stop().then((blob) => blob && downloadRecording(blob, roomCode));
      recorderRef.current = null;
    }
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
    send({ type: "screen-share-state", sharing: false });
  };

  // Both sides can share independently and at the same time — each peer has
  // its own outgoing video sender in the connection, so replacing your track
  // never affects what the other person is currently sending. The only thing
  // missing without the "sharing" signal below is the other person knowing
  // it's happening at all.
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
      send({ type: "screen-share-state", sharing: true });
    } catch {
      // User cancelled the screen/window picker — nothing to do.
    }
  };

  // A preset (Standard/Large) picked in Accessibility Settings should always
  // win over a leftover manual drag from earlier — otherwise choosing
  // "Standard" there could silently do nothing if a drag had already set an
  // explicit pixel width.
  useEffect(() => {
    setPipWidth(null);
  }, [a11y.selfViewSize]);

  const swapMainView = () => {
    setMainView((current) => (current === "remote" ? "local" : "remote"));
  };

  // Drag-to-resize the corner tile, bounded so it can never outgrow the main
  // stage or shrink past being useful. Pointer Events (not mouse-only) so
  // this also works on a touchscreen, and the move/up listeners live on
  // `window` rather than the handle itself so the drag keeps tracking even
  // if the pointer slips off the small handle mid-drag.
  const PIP_MIN_WIDTH = 140;
  const PIP_MAX_WIDTH = 360;
  // The width a fresh drag starts from — whatever's on screen right now,
  // whether that's an earlier manual size or the accessibility preset's
  // default. Read directly off pipWidth's closure (not a ref): this handler
  // is a plain function recreated every render, so it always sees the
  // current value without needing one.
  const basePipWidth = pipWidth ?? (a11y.selfViewSize === "large" ? 280 : 200);
  const startPipResize = (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = basePipWidth;
    const onMove = (moveEvent) => {
      // The corner tile is right-anchored (.call-thumbnails justifies its
      // content to the end), so its right edge never moves — growing it can
      // only mean extending leftward, hence subtracting the pointer's
      // rightward movement rather than adding it. The handle sits at the
      // top-left corner (see the JSX) precisely so the drag direction reads
      // naturally: pull left/up and away from the tile to enlarge it.
      const next = startWidth - (moveEvent.clientX - startX);
      setPipWidth(Math.min(PIP_MAX_WIDTH, Math.max(PIP_MIN_WIDTH, next)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Shared, not local: either person opening the whiteboard opens it for
  // both, the way a real shared whiteboard should behave. The canvas itself
  // stays mounted at all times (just visually hidden) so drawings survive
  // toggling it off and back on mid-call.
  const toggleWhiteboard = () => {
    setWhiteboardOpen((open) => {
      const next = !open;
      send({ type: "whiteboard-toggle", open: next });
      return next;
    });
  };

  // Recording is entirely local to whoever starts it — there's no media
  // server to record to, so this composites both video feeds onto a canvas
  // and downloads a .webm when stopped. The other participant is told via
  // "recording-state" purely for transparency/consent; they can't stop it.
  const toggleRecording = async () => {
    if (isRecording) {
      const blob = await recorderRef.current?.stop();
      recorderRef.current = null;
      setIsRecording(false);
      send({ type: "recording-state", recording: false });
      if (blob) downloadRecording(blob, roomCode);
      return;
    }
    if (!localStream) return;
    recorderRef.current = createCallRecorder({
      localVideoEl: localVideoRef.current,
      remoteVideoEl: remoteVideoRef.current,
      localStream,
      remoteStream,
    });
    setIsRecording(true);
    send({ type: "recording-state", recording: true });
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

  // The signaling connection died unexpectedly — a dropped Wi-Fi/mobile
  // connection, most commonly, not a deliberate Leave (that navigates away
  // immediately, unmounting this component before any status could render
  // here at all) and not the other person leaving normally (that's a
  // "peer-left" message over a connection that's still very much open, so
  // signalStatus stays "joined" the whole time). There's genuinely nothing
  // usable left to show behind this — no video or audio is flowing — so
  // this replaces the call the same way the room-full screen above does,
  // rather than floating a dismissible banner over a dead call. Rejoining
  // just reloads this same URL: every connection here (signaling, the
  // camera, the peer connection) is set up fresh from scratch on mount
  // anyway, so re-running that from a clean slate is more robust than
  // trying to manually patch a half-torn-down WebRTC session back together.
  if (signalStatus === "closed") {
    return (
      <div className="call-room call-room-blocked">
        <div className="blocked-card">
          <span className="dot dot-danger" />
          <h1>{t("call.connectionLostTitle")}</h1>
          <p>{t("call.connectionLostDesc")}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            {t("call.rejoinMeeting")}
          </button>
        </div>
      </div>
    );
  }

  const statusKey = connectionState in STATUS_KEY ? connectionState : "connecting";
  const otherRoleLabel = role === "teacher" ? t("call.student") : role === "student" ? t("call.teacher") : t("call.participant");

  // Swapping only means something once there are genuinely two feeds to
  // choose between — with the peer not yet connected, "local" would have
  // nothing to trade places with, so the stage always shows the waiting
  // state and the corner always shows you, regardless of a stale mainView.
  const swapAvailable = Boolean(remoteStream) && !whiteboardOpen;
  const showLocalAsMain = swapAvailable && mainView === "local";

  // The remote feed's own content — video, camera-off avatar, activity
  // badges, identity chip — independent of whether it's currently rendered
  // in the big stage or the small corner tile. `big` only changes whether
  // the Sign Focus control (hide the other tile for a cleaner view) makes
  // sense to offer here.
  function renderRemoteFeed(big) {
    if (!remoteStream) {
      return (
        <div className="call-waiting">
          <span className="call-waiting-ring" />
          <p>{t("call.waiting")}</p>
        </div>
      );
    }
    return (
      <>
        {/* Stays mounted even with the camera off, only hidden — the same
            reasoning as the whiteboard stage below: unmounting it would drop
            the srcObject binding set by the `[remoteStream]` effect, which
            only re-runs when the *stream* changes, not on a remount (which
            now also happens on a manual swap, not just a camera toggle). */}
        <video ref={remoteVideoRef} autoPlay playsInline hidden={!remoteCameraOn} />
        {!remoteCameraOn && (
          <div className="call-remote-camera-off">
            <UserAvatar
              picture={remoteIdentity?.picture}
              name={remoteIdentity?.displayName || otherRoleLabel}
              size={big ? 96 : 56}
              className="user-avatar-img call-off-avatar-img call-off-avatar-initial"
            />
          </div>
        )}
        <div className="call-remote-badges">
          {remoteIsSigning && (
            <span className="call-signing-badge">
              <span className="dot" /> {t("call.signingBadge")}
            </span>
          )}
          {remoteIsSharing && (
            <span className="call-signing-badge call-sharing-badge">
              <span className="dot" /> {t("call.peerSharing")}
            </span>
          )}
        </div>
        {big && (
          <button className="sign-focus-btn" aria-pressed={signFocus} onClick={() => setSignFocus((v) => !v)}>
            ⤢ {t("call.signFocus")}
          </button>
        )}
        <span className="call-speaker-chip">
          <span className={`dot ${statusKey === "connected" ? "dot-ok" : "dot-warn"}`} />
          {otherRoleLabel}
        </span>
      </>
    );
  }

  // Same idea for the local feed: your own video, your camera-off avatar,
  // the mic/name tag — rendered the same way whichever slot it's currently in.
  function renderLocalFeed(big) {
    return (
      <>
        <video
          ref={(el) => {
            // This element unmounts/remounts on a camera toggle *and* now on
            // a swap too, which drops the DOM-level srcObject binding — a
            // plain ref only fires on mount, with nothing to rebind it
            // afterwards, so set it right here rather than relying on a
            // separate effect. Guarded on identity: this inline callback
            // gets a new function reference every render, so React
            // re-invokes it on every re-render of CallRoom, not just on
            // mount/remount — reassigning srcObject to the *same* stream on
            // an already-playing video briefly flashes/blacks it out in
            // Chromium. Only assign when the stream actually changed.
            localVideoRef.current = el;
            if (el && localStream && el.srcObject !== localStream) {
              el.srcObject = localStream;
            }
          }}
          autoPlay
          muted
          playsInline
          hidden={!cameraOn}
          className="mirrored"
        />
        {!cameraOn && (
          <div className="call-local-off">
            <UserAvatar
              picture={user?.picture}
              name={profile?.display_name || user?.name}
              size={big ? 96 : 56}
              className="user-avatar-img call-off-avatar-img call-off-avatar-initial"
            />
          </div>
        )}
        {big && swapAvailable && (
          <button className="sign-focus-btn" aria-pressed={signFocus} onClick={() => setSignFocus((v) => !v)}>
            ⤢ {t("call.signFocus")}
          </button>
        )}
        <span className="call-local-tag">
          <span className={`dot ${micOn ? "dot-ok" : "dot-danger"}`} />
          {t("call.you")}
        </span>
      </>
    );
  }

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
        <CopyLinkButton roomCode={roomCode} />
        {isScreenSharing && (
          <button className="pill call-sharing-pill" onClick={stopScreenShare}>
            <span className="dot dot-ok" />
            {t("call.youAreSharing")}
          </button>
        )}
        {(isRecording || remoteIsRecording) && (
          <span className="pill call-recording-pill">
            <span className="dot dot-danger" />
            {isRecording ? `${t("call.recordingIndicator")} · ${formatDuration(recordSeconds)}` : t("call.peerRecording")}
          </span>
        )}
        <span className="call-topbar-spacer" />
        <AccountBadge />
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
        <div className={`call-video-area${signFocus ? " sign-focus" : ""}${whiteboardOpen ? " whiteboard-open" : ""}`}>
          {/* Both stay mounted at all times (toggled with `hidden`, not
              conditional rendering) so the whiteboard's canvas bitmap and the
              remote <video>'s srcObject both survive switching back and forth. */}
          <div className="call-remote" hidden={whiteboardOpen}>
            {showLocalAsMain ? renderLocalFeed(true) : renderRemoteFeed(true)}
            {swapAvailable && (
              <button
                type="button"
                className="swap-view-btn swap-view-btn-main"
                onClick={swapMainView}
                title={t("call.swapView")}
                aria-label={t("call.swapView")}
              >
                <SwapIcon />
              </button>
            )}
          </div>

          <div className="call-whiteboard-stage" hidden={!whiteboardOpen}>
            <Whiteboard send={send} subscribe={subscribe} t={t} />
          </div>

          {a11y.captionsOn && !whiteboardOpen && (
            <div className={`call-caption caption-bg-${a11y.captionBg}`} style={{ "--caption-font-size": CAPTION_SIZES[a11y.captionSize] }}>
              <span className="caption-tag">
                {role === "teacher" ? t("call.peerSigned") : t("call.captionTag")}
              </span>
              <p>
                {role === "teacher"
                  ? peerSign
                    ? `${peerSign.signSi || peerSign.sign}${peerSign.signSi ? ` (${peerSign.sign})` : ""}`
                    : t("call.signVoicePlaceholder")
                  : liveCaption?.text ?? t("call.captionPlaceholder")}
              </p>
            </div>
          )}

          <div className="call-thumbnails">
            {whiteboardOpen && remoteStream && (
              <div className="call-local call-remote-thumb">
                <video
                  ref={(el) => {
                    // Same reassign-on-every-render guard as the local
                    // camera tile below — see that comment.
                    remoteThumbVideoRef.current = el;
                    if (el && remoteStream && el.srcObject !== remoteStream) {
                      el.srcObject = remoteStream;
                    }
                  }}
                  autoPlay
                  playsInline
                />
                <span className="call-local-tag">
                  <span className={`dot ${statusKey === "connected" ? "dot-ok" : "dot-warn"}`} />
                  {otherRoleLabel}
                </span>
              </div>
            )}
            {!whiteboardOpen && (
              <div
                className={`call-local${a11y.selfViewSize === "large" ? " self-view-large" : ""}`}
                style={pipWidth ? { width: `${pipWidth}px` } : undefined}
              >
                {showLocalAsMain ? renderRemoteFeed(false) : renderLocalFeed(false)}
                {swapAvailable && (
                  <button
                    type="button"
                    className="swap-view-btn swap-view-btn-pip"
                    onClick={swapMainView}
                    title={t("call.swapView")}
                    aria-label={t("call.swapView")}
                  >
                    <SwapIcon />
                  </button>
                )}
                <button
                  type="button"
                  className="pip-resize-handle"
                  onPointerDown={startPipResize}
                  title={t("call.resizeView")}
                  aria-label={t("call.resizeView")}
                />
              </div>
            )}
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
                {unreadChatCount > 0 && (
                  <span className="call-panel-tab-badge">{unreadChatCount}</span>
                )}
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
                    <UserAvatar
                      picture={user?.picture}
                      name={profile?.display_name || user?.name}
                      className="participant-avatar"
                    />
                    <div className="panel-row-label">
                      <RenameControl
                        displayName={profile?.display_name || t("call.you")}
                        onRename={(newName) =>
                          saveProfile({
                            displayName: newName,
                            cameraDefault: profile?.camera_default ?? true,
                            micDefault: profile?.mic_default ?? true,
                          })
                        }
                      />
                      <span>{roleLabel(role)}</span>
                    </div>
                    <span className={`dot ${micOn ? "dot-ok" : "dot-danger"}`} />
                  </div>
                  <div className="panel-row">
                    <UserAvatar
                      picture={remoteIdentity?.picture}
                      name={remoteIdentity?.displayName || otherRoleLabel}
                      className="participant-avatar"
                    />
                    <div className="panel-row-label">
                      <strong>{remoteIdentity?.displayName || otherRoleLabel}</strong>
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

                  {role === "teacher" && (
                    <>
                      <div className="panel-row">
                        <div className="panel-row-label">
                          <strong>{t("call.voiceOutput")}</strong>
                          <span>{voiceOn ? t("call.on") : t("call.off")}</span>
                        </div>
                        <button
                          className="switch"
                          aria-pressed={voiceOn}
                          aria-label={t("call.voiceOutput")}
                          onClick={() => setVoiceOn((v) => !v)}
                        />
                      </div>
                      {!speechRecognitionSupported && (
                        <div className="ssl-empty">{t("call.captionsUnsupported")}</div>
                      )}
                    </>
                  )}

                  {prediction ? (
                    <div className="ssl-output-card">
                      <span className="ssl-output-eyebrow">{t("call.recognizedSign")}</span>
                      <span className="ssl-output-sign">"{prediction.sign}"</span>
                      {prediction.signSi && (
                        <span className="ssl-output-sign-si">{prediction.signSi}</span>
                      )}
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
                    <div className={`ssl-empty ssl-empty-main${sslHistory.length === 0 ? " ssl-empty-fill" : ""}`}>
                      <HandIcon />
                      <p>{recognitionOn ? t("call.sslEmptyOn") : t("call.sslEmptyOff")}</p>
                    </div>
                  )}

                  {sslHistory.length > 0 && (
                    <>
                      <div className="ssl-history-heading">{t("call.recentRecognitions")}</div>
                      <div className="ssl-history-list">
                        {sslHistory.map((entry) => (
                          <div className="ssl-history-row" key={entry.at}>
                            <span>
                              "{entry.sign}"
                              {entry.signSi && <em>{entry.signSi}</em>}
                            </span>
                            <time>{entry.time}</time>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              {rightPanelTab === "chat" && (
                <div className="chat-panel">
                  <div className="chat-messages" ref={chatListRef}>
                    {chatMessages.length === 0 ? (
                      <div className="panel-placeholder chat-empty">
                        <strong>{t("call.chatEmptyTitle")}</strong>
                        <p>{t("call.chatEmptyDesc")}</p>
                      </div>
                    ) : (
                      chatMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`chat-bubble-row ${msg.from === "me" ? "chat-bubble-row-me" : ""}`}
                        >
                          <div className={`chat-bubble ${msg.from === "me" ? "chat-bubble-me" : "chat-bubble-peer"}`}>
                            <span className="chat-bubble-text">{msg.text}</span>
                            <time className="chat-bubble-time">
                              {new Date(msg.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </time>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <form className="chat-input-row" onSubmit={sendChatMessage}>
                    <input
                      type="text"
                      className="chat-input"
                      value={chatDraft}
                      onChange={(event) => setChatDraft(event.target.value)}
                      placeholder={t("call.chatInputPlaceholder")}
                      aria-label={t("call.chatInputPlaceholder")}
                    />
                    <button type="submit" className="chat-send-btn" disabled={!chatDraft.trim()}>
                      {t("call.send")}
                    </button>
                  </form>
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
          className="dock-btn dock-btn-accent"
          aria-pressed={whiteboardOpen}
          onClick={toggleWhiteboard}
          title={t("call.whiteboardToggle")}
          aria-label={t("call.whiteboardToggle")}
        >
          <WhiteboardIcon />
        </button>
        <button
          className={`dock-btn${isRecording ? " dock-btn-recording" : ""}`}
          aria-pressed={isRecording}
          onClick={toggleRecording}
          title={isRecording ? t("call.stopRecording") : t("call.startRecording")}
          aria-label={isRecording ? t("call.stopRecording") : t("call.startRecording")}
        >
          <RecordIcon />
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
          className="dock-btn dock-btn-with-badge"
          aria-pressed={rightPanelTab === "chat"}
          aria-label={t("call.chatToggle")}
          title={t("call.tabChat")}
          onClick={() => togglePanel("chat")}
        >
          <ChatIcon />
          {unreadChatCount > 0 && rightPanelTab !== "chat" && <span className="dock-btn-badge" />}
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
              <span className="settings-field-label">{t("settings.themeHint")}</span>
              <ThemeSwitch />
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
