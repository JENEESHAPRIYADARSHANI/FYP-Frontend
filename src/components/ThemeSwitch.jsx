import { useTheme } from "../context/ThemeContext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";
import { SunIcon, MoonIcon } from "./icons.jsx";

// Compact Light/Dark switch, reused on Home, Lobby, and inside the in-call
// Accessibility Settings modal — same placement pattern as LanguageSwitch,
// since both are "pick it before you even join a call" preferences.
// Icon-only: the aria-label carries the meaning text used to show, so
// screen readers and tooltips still get it, it's just not painted on-screen.
export default function ThemeSwitch({ className = "" }) {
  const { theme, setTheme } = useTheme();
  const { t } = useLanguage();

  return (
    <div className={`segmented theme-switch icon-only ${className}`.trim()} role="group" aria-label={t("settings.sectionTheme")}>
      <button aria-pressed={theme === "light"} aria-label={t("settings.light")} title={t("settings.light")} onClick={() => setTheme("light")}>
        <SunIcon />
      </button>
      <button aria-pressed={theme === "dark"} aria-label={t("settings.dark")} title={t("settings.dark")} onClick={() => setTheme("dark")}>
        <MoonIcon />
      </button>
    </div>
  );
}
