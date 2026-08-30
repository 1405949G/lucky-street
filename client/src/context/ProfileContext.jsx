/**
 * src/context/ProfileContext.jsx — wraps localStorage identity
 * Provides { profile, setProfile, clear, showOnboarding, setShowOnboarding }
 * Syncs with localStorage and exposes helper to validate.
 */

import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";
import * as storage from "../utils/storage.js";

export const ProfileContext = createContext(null);

export function ProfileProvider({ children }) {
  const [profile, setProfileState] = useState(() => storage.loadProfile());
  const [showOnboarding, setShowOnboarding] = useState(() => !storage.loadProfile());

  // When profile updated externally (e.g., other tab), sync
  useEffect(() => {
    function onStorage(e) {
      if (e.key === "luckyStreet:profile") {
        setProfileState(storage.loadProfile());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setProfile = useCallback((next) => {
    const saved = storage.saveProfile(next);
    if (saved) setProfileState(saved);
    setShowOnboarding(false);
    return saved;
  }, []);

  const clear = useCallback(() => {
    storage.clearProfile();
    setProfileState(null);
    setShowOnboarding(true);
  }, []);

  // Helper to check if profile exists for direct room link blocking
  const hasProfile = !!profile && !!profile.username;

  const value = useMemo(() => ({
    profile,
    setProfile,
    clear,
    hasProfile,
    showOnboarding,
    setShowOnboarding
  }), [profile, setProfile, clear, hasProfile, showOnboarding]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}
