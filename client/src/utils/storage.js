/**
 * src/utils/storage.js — Client-Side Identity & Profile Caching
 * Spec 1: localStorage persistence, bypass onboarding on return/refresh
 */

const KEY = "luckyStreet:profile";
const LEGACY_VEIL_STREET = "veil-street:myName"; // not used but example

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p.username !== "string" || !p.username.trim()) return null;
    // avatar can be string (color hex or base64 data url) or null
    return {
      username: String(p.username).trim(),
      avatar: p.avatar || null, // base64 or hex
      avatarType: p.avatarType || (p.avatar && p.avatar.startsWith("data:") ? "image" : "color"),
      updatedAt: p.updatedAt || Date.now()
    };
  } catch {
    return null;
  }
}

export function saveProfile(profile) {
  try {
    const payload = {
      username: String(profile.username).trim(),
      avatar: profile.avatar || null,
      avatarType: profile.avatarType || "color",
      updatedAt: Date.now()
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
    return payload;
  } catch (e) {
    console.warn("[storage] save failed", e);
    return null;
  }
}

export function clearProfile() {
  try { localStorage.removeItem(KEY); } catch {}
}

export function hasProfile() {
  return !!loadProfile();
}
