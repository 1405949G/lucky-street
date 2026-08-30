/**
 * server/src/utils.js — pure helpers
 */

// 4-char alphanumeric (A-Z, 0-9), avoid ambiguous I/O
const ALPHANUM = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";

export function generateRoomId(existingIds = new Set()) {
  // crypto-strong if available
  let id;
  let attempt = 0;
  do {
    id = "";
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const buf = new Uint32Array(4);
      crypto.getRandomValues(buf);
      for (let i = 0; i < 4; i++) id += ALPHANUM[buf[i] % ALPHANUM.length];
    } else {
      for (let i = 0; i < 4; i++) id += ALPHANUM[Math.floor(Math.random() * ALPHANUM.length)];
    }
    attempt++;
    if (attempt > 50) throw new Error("Room ID collision overflow");
  } while (existingIds.has(id));
  return id;
}

export function isValidRoomId(id) {
  return typeof id === "string" && /^[A-Z0-9]{4}$/.test(id);
}

export function sanitizeName(raw) {
  const name = String(raw || "").trim();
  if (!name) throw new Error("Name cannot be empty");
  if (name.length > 20) throw new Error("Name too long (max 20)");
  // Allow letters, numbers, space, ' - _
  if (!/^[\p{L}\p{N} _'\-.]+$/u.test(name)) throw new Error("Name contains invalid characters");
  return name;
}

// Simple password hashing placeholder — not cryptographically secure, but avoids plaintext in memory logs.
// In production, use bcrypt/argon2.
export function hashPassword(pwd) {
  if (!pwd) return null;
  // tiny djb2
  let h = 5381;
  for (let i = 0; i < pwd.length; i++) h = ((h << 5) + h) ^ pwd.charCodeAt(i);
  return "h_" + (h >>> 0).toString(36);
}

export function verifyPassword(pwd, hash) {
  if (!hash) return true; // no password set
  if (!pwd) return false;
  return hashPassword(pwd) === hash;
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
