import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext.jsx";
import LanguageSwitch from "../components/LanguageSwitch.jsx";
import ThemeSwitch from "../components/ThemeSwitch.jsx";
import HasthaLogo from "../components/HasthaLogo.jsx";

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
  const [joinCode, setJoinCode] = useState("");

  const startClass = () => {
    const code = generateRoomCode();
    navigate(`/join/${code}`);
  };

  const joinClass = (event) => {
    event.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code) navigate(`/join/${code}`);
  };

  return (
    <div className="home">
      <header className="home-brand">
        <HasthaLogo badge size={32} />
        <span className="brand-name">{t("home.brand")}</span>
        <span className="home-brand-spacer" />
        <div className="header-controls">
          <ThemeSwitch />
          <LanguageSwitch />
        </div>
      </header>

      <main className="home-hero">
        <h1>{t("home.title")}</h1>
        <p className="home-lede">{t("home.lede")}</p>

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
