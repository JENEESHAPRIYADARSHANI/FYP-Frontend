import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useProfile } from "../context/ProfileContext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import HasthaLogo from "../components/HasthaLogo.jsx";

// Shown exactly once, right after a person's very first sign-in (see
// OnboardingGate in App.jsx — it renders this in place of whatever route
// they actually landed on, until a profile row exists). Sets the display
// name and camera/mic defaults saved to their account; renaming later reuses
// the same PUT endpoint from the call room's participant menu instead of
// this screen. Deliberately reuses the Lobby's visual layout (same
// two-column preview + panel), since this is the same kind of "before you go
// in" screen Zoom/Meet show, just once per account instead of once per call.
export default function Onboarding() {
  const { user } = useAuth();
  const { saveProfile } = useProfile();
  const { t } = useLanguage();
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [name, setName] = useState(user?.name ?? "");
  const [cameraDefault, setCameraDefault] = useState(true);
  const [micDefault, setMicDefault] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Camera/microphone permission denied.");
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await saveProfile({ displayName: trimmed, cameraDefault, micDefault });
      // No navigation needed — OnboardingGate re-renders the real route the
      // moment the ProfileContext's `profile.exists` flips to true.
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="lobby">
      <header className="lobby-top">
        <span className="pill">
          <HasthaLogo size={20} />
          {t("home.brand")}
        </span>
        <span className="home-brand-spacer" />
      </header>

      <div className="lobby-main">
        <div className="lobby-preview-card">
          <video ref={videoRef} autoPlay muted playsInline />
          {error && (
            <div className="lobby-error">
              <strong>{t("onboarding.errorHeading")}</strong>
              <p>{error}</p>
            </div>
          )}
        </div>

        <aside className="lobby-panel">
          <h1>{t("onboarding.title")}</h1>
          <p>{t("onboarding.subtitle")}</p>

          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="lobby-devices">
              <label>
                {t("onboarding.nameLabel")}
                <input
                  className="field"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("onboarding.namePlaceholder")}
                  maxLength={60}
                  autoFocus
                  required
                />
              </label>
            </div>
            <p className="lobby-ssl-hint">{t("onboarding.nameHint")}</p>

            <div className="panel-row">
              <div className="panel-row-label">
                <strong>{t("onboarding.cameraDefaultLabel")}</strong>
                <span>{t("onboarding.cameraDefaultDesc")}</span>
              </div>
              <button
                type="button"
                className="switch"
                aria-pressed={cameraDefault}
                aria-label={t("onboarding.cameraDefaultLabel")}
                onClick={() => setCameraDefault((v) => !v)}
              />
            </div>

            <div className="panel-row">
              <div className="panel-row-label">
                <strong>{t("onboarding.micDefaultLabel")}</strong>
                <span>{t("onboarding.micDefaultDesc")}</span>
              </div>
              <button
                type="button"
                className="switch"
                aria-pressed={micDefault}
                aria-label={t("onboarding.micDefaultLabel")}
                onClick={() => setMicDefault((v) => !v)}
              />
            </div>

            <button className="btn btn-primary btn-block lobby-join" type="submit" disabled={saving || !name.trim()}>
              {saving ? t("onboarding.saving") : t("onboarding.continueBtn")}
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}
