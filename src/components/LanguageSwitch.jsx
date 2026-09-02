import { useLanguage } from "../context/LanguageContext.jsx";

// Compact English/Sinhala switch, reused on Home, Lobby, and inside the
// in-call Accessibility Settings modal so the choice is reachable wherever
// the user is in the app, not buried one screen deep.
export default function LanguageSwitch({ className = "" }) {
  const { language, setLanguage, languages } = useLanguage();

  return (
    <div className={`segmented language-switch ${className}`.trim()} role="group" aria-label="Language">
      {Object.entries(languages).map(([code, meta]) => (
        <button key={code} aria-pressed={language === code} onClick={() => setLanguage(code)}>
          {meta.nativeLabel}
        </button>
      ))}
    </div>
  );
}
