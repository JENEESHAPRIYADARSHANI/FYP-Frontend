import { useTheme } from "../context/ThemeContext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";

// Compact Light/Dark switch, reused on Home, Lobby, and inside the in-call
// Accessibility Settings modal — same placement pattern as LanguageSwitch,
// since both are "pick it before you even join a call" preferences.
export default function ThemeSwitch({ className = "" }) {
  const { theme, setTheme } = useTheme();
  const { t } = useLanguage();

  return (
    <div className={`segmented theme-switch ${className}`.trim()} role="group" aria-label={t("settings.sectionTheme")}>
      <button aria-pressed={theme === "light"} onClick={() => setTheme("light")}>
        ☀ {t("settings.light")}
      </button>
      <button aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>
        ☾ {t("settings.dark")}
      </button>
    </div>
  );
}
