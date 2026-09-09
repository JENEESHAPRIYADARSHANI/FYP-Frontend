import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import keycloak from "../services/keycloak.js";

const AuthContext = createContext(null);

function readUser(kc) {
  if (!kc.authenticated || !kc.tokenParsed) return null;
  return {
    id: kc.tokenParsed.sub,
    name: kc.tokenParsed.name || kc.tokenParsed.preferred_username,
    email: kc.tokenParsed.email,
    roles: kc.tokenParsed.realm_access?.roles ?? [],
  };
}

// Wraps keycloak-js in the same Context shape as Theme/Language, so the rest
// of the app consumes it the same way. Uses "check-sso" (silent, via the
// hidden iframe in public/silent-check-sso.html) rather than
// "login-required" — signing in stays a deliberate action (the "Sign in"
// button), not something that hijacks the room-code flow that already works
// without an account. Not gating any route on this yet; it's wired up so
// the backend integration is testable end to end.
export function AuthProvider({ children }) {
  const [initialized, setInitialized] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  // `keycloak` is a module-level singleton, and keycloak-js refuses to be
  // init()'d twice on the same instance. React StrictMode (see main.jsx)
  // deliberately mounts effects twice in dev to surface bugs like this one —
  // a ref (unlike a plain local variable) survives that mount → cleanup →
  // mount cycle, so it's the right tool to make sure init() actually starts
  // once. Deliberately NOT using a "cancelled on cleanup" guard around the
  // .then()/.catch() below: this provider lives for the app's whole
  // lifetime, so there's no real unmount to guard against — and StrictMode's
  // *phantom* cleanup (which still runs once, even though the ref above
  // stops a second init() call) would otherwise flip that flag and cause
  // the real init()'s eventual resolution to be silently discarded, which is
  // exactly the bug that had "already signed in" never show up: no error,
  // `initialized` just never became true.
  const initStartedRef = useRef(false);

  useEffect(() => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    keycloak
      .init({
        onLoad: "check-sso",
        silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
        pkceMethod: "S256",
        // The session-monitoring iframe (separate from the silent-SSO check
        // above) polls a Keycloak endpoint that validates the `origin` query
        // param against the client's Web Origins — easy to misconfigure
        // (ours was), and increasingly unreliable anyway as browsers
        // restrict third-party iframe cookie access. We don't need
        // multi-tab "logged out elsewhere" detection badly enough to depend
        // on it; updateToken() already handles real expiry.
        checkLoginIframe: false,
      })
      .then((auth) => {
        setAuthenticated(auth);
        setUser(readUser(keycloak));
        setInitialized(true);
      })
      .catch((err) => {
        console.error("Keycloak init failed", err);
        setInitialized(true);
      });

    keycloak.onAuthSuccess = () => setUser(readUser(keycloak));
    keycloak.onAuthLogout = () => {
      setAuthenticated(false);
      setUser(null);
    };
    // Refresh proactively; if the refresh token itself has expired, send the
    // user back through login rather than silently failing later requests.
    keycloak.onTokenExpired = () => {
      keycloak.updateToken(30).catch(() => keycloak.login());
    };
  }, []);

  const login = useCallback((options) => keycloak.login(options), []);
  const logout = useCallback(
    (options) => keycloak.logout({ redirectUri: window.location.origin, ...options }),
    []
  );

  // Attaches a fresh Bearer token to a fetch call, refreshing first if it's
  // close to expiring — the one thing every protected API call needs.
  const authFetch = useCallback(async (url, options = {}) => {
    await keycloak.updateToken(30).catch(() => {});
    const headers = new Headers(options.headers);
    if (keycloak.token) headers.set("Authorization", `Bearer ${keycloak.token}`);
    return fetch(url, { ...options, headers });
  }, []);

  const value = useMemo(
    () => ({ initialized, authenticated, user, login, logout, authFetch }),
    [initialized, authenticated, user, login, logout, authFetch]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
