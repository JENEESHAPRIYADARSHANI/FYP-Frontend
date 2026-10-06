import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import LanguageSwitch from "../components/LanguageSwitch.jsx";
import ThemeSwitch from "../components/ThemeSwitch.jsx";
import HasthaLogo from "../components/HasthaLogo.jsx";
import AccountBadge from "../components/AccountBadge.jsx";
import { API_BASE_URL } from "../services/api.js";

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default function Home() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { authenticated, login, authFetch } = useAuth();
  const [joinCode, setJoinCode] = useState("");
  const [backendCheck, setBackendCheck] = useState(null);

  // Debug-only affordance: proves the Keycloak token actually round-trips to
  // the FastAPI backend and back. Not part of the core join flow.
  const verifyBackend = async () => {
    setBackendCheck({ status: "checking" });
    try {
      const response = await authFetch(`${API_BASE_URL}/api/me`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || response.statusText);
      setBackendCheck({ status: "ok", user: body.user });
    } catch (err) {
      setBackendCheck({ status: "error", message: err.message });
    }
  };

  // Requiring sign-in before either action, the same way Zoom/Meet require a
  // logged-in host and attendee, is a deliberate change from this app's
  // earlier design (anonymous room-code joining). login() redirects to
  // Keycloak and comes straight back to this same page, so the room code
  // (for join) or a fresh one (for start) still gets created right after.
  const startClass = () => {
    if (!authenticated) {
      login();
      return;
    }
    const code = generateRoomCode();
    navigate(`/join/${code}`);
  };

  const joinClass = (event) => {
    event.preventDefault();
    if (!authenticated) {
      login();
      return;
    }
    const code = joinCode.trim().toUpperCase();
    if (code) navigate(`/join/${code}`);
  };

  return (
    <div className="home">
      <header className="home-brand">
        <HasthaLogo size={44} />
        <span className="brand-name">{t("home.brand")}</span>
        <span className="home-brand-spacer" />
        <div className="header-controls">
          <ThemeSwitch />
          <LanguageSwitch />
          <AccountBadge />
        </div>
      </header>

      <main className="home-hero">
        <h1>{t("home.title")}</h1>
        <p className="home-lede">{t("home.lede")}</p>

        {authenticated && (
          <div className="backend-check">
            {/* <button className="btn btn-ghost" onClick={verifyBackend}>
              Verify backend connection
            </button>
            */}
            {backendCheck?.status === "checking" && <span> Checking…</span>}
            {backendCheck?.status === "ok" && (
              <span>
                {" "}
                Backend verified token for {backendCheck.user.name} (roles:{" "}
                {backendCheck.user.roles.join(", ") || "none"})
              </span>
            )}
            {backendCheck?.status === "error" && (
              <span> {backendCheck.message}</span>
            )}
          </div>
        )}

        <div className="home-cards">
          <article className="role-card role-teacher">
            <span className="role-tag tag-teacher">{t("home.teacherTag")}</span>
            <h2>{t("home.startTitle")}</h2>
            <p>{t("home.startDesc")}</p>
            <button className="btn btn-primary" onClick={startClass}>
              {t("home.startBtn")}
            </button>
          </article>

          <article className="role-card role-student">
            <span className="role-tag tag-student">{t("home.studentTag")}</span>
            <h2>{t("home.joinTitle")}</h2>
            <p>{t("home.joinDesc")}</p>
            <form onSubmit={joinClass}>
              <input
                className="field"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                placeholder={t("home.roomCodePlaceholder")}
                maxLength={6}
              />
              <button className="btn btn-primary" type="submit">
                {t("home.joinBtn")}
              </button>
            </form>
          </article>
        </div>
      </main>
    </div>
  );
}
