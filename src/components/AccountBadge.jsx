import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useLanguage } from "../context/LanguageContext.jsx";

// Roles every Keycloak user carries by default — noise, not information, so
// the dropdown only shows roles someone actually assigned (teacher/student).
const SYSTEM_ROLES = new Set(["offline_access", "uma_authorization", "default-roles-hastha"]);

// The one place account identity is shown — reused in the top-right corner
// of Home, Lobby, and the in-call topbar (same placement pattern as
// ThemeSwitch/LanguageSwitch) so who's signed in is always visible, not just
// on the landing page. Icon-only: hovering reveals the email, clicking opens
// a small menu with full identity + sign out — nothing is shown permanently
// except the avatar itself, keeping the header uncluttered.
// Renders nothing until Keycloak has finished its silent-SSO check, to avoid
// a "Sign in" flash for someone already logged in.
export default function AccountBadge({ className = "" }) {
  const { t } = useLanguage();
  const { initialized, authenticated, user, login, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeIfOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeIfOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  if (!initialized) return null;

  if (!authenticated) {
    return (
      <button className={`btn btn-ghost ${className}`.trim()} onClick={() => login()}>
        {t("home.signIn")}
      </button>
    );
  }

  const displayName = user?.name ?? user?.email ?? "?";
  const initial = displayName.trim().charAt(0).toUpperCase();
  const roles = (user?.roles ?? []).filter((role) => !SYSTEM_ROLES.has(role));

  return (
    <div className={`account-menu ${className}`.trim()} ref={rootRef}>
      <button
        className="account-avatar-btn"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={displayName}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span className="account-avatar" aria-hidden="true">{initial}</span>
        {!menuOpen && user?.email && <span className="account-tooltip">{user.email}</span>}
      </button>

      {menuOpen && (
        <div className="account-dropdown" role="menu">
          <div className="account-dropdown-header">
            <span className="account-avatar account-avatar-lg" aria-hidden="true">{initial}</span>
            <div className="account-dropdown-identity">
              <strong>{displayName}</strong>
              {user?.email && <span>{user.email}</span>}
            </div>
          </div>

          {roles.length > 0 && (
            <div className="account-dropdown-roles">
              {roles.map((role) => (
                <span key={role} className="role-tag tag-teacher">{role}</span>
              ))}
            </div>
          )}

          <button className="btn btn-ghost btn-block" role="menuitem" onClick={() => logout()}>
            {t("home.signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
