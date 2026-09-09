// Whether to run Sinhala Sign Language recognition during a call. This is a
// self-service, per-device preference — never gated by a Keycloak role.
// Realm roles (teacher/student) aren't reliably present (e.g. a brand-new
// Google sign-in has none until an admin assigns one), so tying a core
// feature to them would silently break for real users. A visible toggle the
// person controls themselves is simpler and doesn't depend on admin upkeep.
const SSL_PREFERENCE_KEY = "hastha-ssl-recognition-enabled";

export function loadSslPreference() {
  try {
    const raw = localStorage.getItem(SSL_PREFERENCE_KEY);
    return raw === null ? true : JSON.parse(raw);
  } catch {
    return true;
  }
}

export function saveSslPreference(enabled) {
  try {
    localStorage.setItem(SSL_PREFERENCE_KEY, JSON.stringify(enabled));
  } catch {
    // Private browsing / storage disabled — the toggle still works for this
    // session, it just won't be remembered next time.
  }
}
