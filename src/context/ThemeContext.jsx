import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "hastha-theme";
const THEMES = ["light", "dark"];
const ThemeContext = createContext(null);

function loadTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(stored) ? stored : "light";
  } catch {
    return "light";
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(loadTheme);

  // Applied to <html> (not just some app root) so it holds regardless of
  // which route is mounted — Home, Lobby, and Call all share one <html>.
  // This is always an explicit choice (see index.css); it never reads
  // prefers-color-scheme, which is what made the app diverge from the
  // approved Figma screenshots when it was automatic.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const setTheme = useCallback((next) => {
    if (!THEMES.includes(next)) return;
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* localStorage unavailable — preference just won't persist */
    }
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
