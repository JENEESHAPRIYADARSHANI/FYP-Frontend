import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { DEFAULT_LANGUAGE, LANGUAGES, translations } from "../i18n/translations.js";

const STORAGE_KEY = "signconnect-language";
const LanguageContext = createContext(null);

function loadLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && translations[stored] ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

// Looks up "call.tabParticipants"-style dotted keys in the active language's
// dictionary, falling back to English so a missing/partial translation never
// renders a blank label.
function resolve(dict, key) {
  return key.split(".").reduce((node, part) => node?.[part], dict);
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(loadLanguage);

  const setLanguage = useCallback((lang) => {
    if (!translations[lang]) return;
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* localStorage unavailable — preference just won't persist */
    }
  }, []);

  const t = useCallback(
    (key) => resolve(translations[language], key) ?? resolve(translations[DEFAULT_LANGUAGE], key) ?? key,
    [language]
  );

  const value = useMemo(
    () => ({ language, setLanguage, t, languages: LANGUAGES }),
    [language, setLanguage, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
