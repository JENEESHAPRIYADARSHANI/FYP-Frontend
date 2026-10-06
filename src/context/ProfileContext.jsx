import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { API_BASE_URL } from "../services/api.js";

const ProfileContext = createContext(null);

// The saved display name + camera/mic defaults from the one-time onboarding
// screen (see pages/Onboarding.jsx), kept separate from AuthContext because
// this is app data (backend/Postgres), not Keycloak identity. `loading`
// stays true until the very first fetch resolves, so nothing renders an
// onboarding gate — or its absence — based on a guess.
export function ProfileProvider({ children }) {
  const { initialized, authenticated, authFetch } = useAuth();
  const [profile, setProfile] = useState(null); // null until loaded; {exists:false} or the saved row after
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!authenticated) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await authFetch(`${API_BASE_URL}/api/profile`);
      setProfile(await response.json());
    } catch {
      // Backend unreachable — treat as "unknown" rather than forcing
      // onboarding on top of a connection error the person can't fix there.
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [authenticated, authFetch]);

  useEffect(() => {
    if (!initialized) return;
    refresh();
  }, [initialized, refresh]);

  const saveProfile = useCallback(
    async ({ displayName, cameraDefault, micDefault }) => {
      const response = await authFetch(`${API_BASE_URL}/api/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName,
          camera_default: cameraDefault,
          mic_default: micDefault,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || "Could not save profile");
      }
      const saved = await response.json();
      setProfile(saved);
      return saved;
    },
    [authFetch]
  );

  // Onboarding is only meaningful once we actually know the answer — while
  // still loading, or while signed out, this is false rather than an
  // undefined/true flash.
  const needsOnboarding = authenticated && !loading && profile?.exists === false;

  const value = useMemo(
    () => ({ profile, loading, needsOnboarding, saveProfile, refresh }),
    [profile, loading, needsOnboarding, saveProfile, refresh]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within a ProfileProvider");
  return ctx;
}
