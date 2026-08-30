/**
 * server/src/users.js - Ephemeral Identity Database (Name Lifecycle Management)
 * Spec 2:
 *  - Usernames globally unique across active sessions (case-insensitive)
 *  - In-memory Map tracking current names
 *  - GC: on disconnect start 5-min timer; if no reconnect, free name
 *
 * Design mirrors Redis TTL pattern but in-process.
 * Key: lowercased username -> { socketId, username (original case), avatar, timer, expiresAt }
 * Also tracks socketId -> lowerName for reverse lookup.
 */

const GC_MS = 5 * 60 * 1000; // 5 minutes (spec)
// For dev/testing, override via env GC_MS e.g., GC_MS=10000
const GC_MS_EFFECTIVE = Number(process.env.GC_MS) || GC_MS;

class UserRegistry {
  constructor({ gcMs = GC_MS_EFFECTIVE, onExpire = null } = {}) {
    this.gcMs = gcMs;
    this.onExpire = onExpire; // callback(lowerName, username)
    /** Map<lowerName, { socketId, username, avatar, timer, expiresAt, disconnectedAt }> */
    this.byName = new Map();
    /** Map<socketId, lowerName> */
    this.bySocket = new Map();
  }

  /**
   * Attempt to claim a username for a socket.
   * Throws if duplicate (taken by another active socket).
   * If same socket reclaims same name (reconnect), allow and cancel GC.
   * If name was in GC grace period (timer set), allow reconnect to reclaim and cancel timer.
   */
  register(socketId, username, avatar = null) {
    const trimmed = String(username).trim();
    if (!trimmed) throw new Error("Username required");
    const lower = trimmed.toLowerCase();
    const existing = this.byName.get(lower);

    if (existing) {
      // Same socket re-registering same name -> refresh, cancel timer
      if (existing.socketId === socketId) {
        if (existing.timer) {
          clearTimeout(existing.timer);
          existing.timer = null;
          existing.expiresAt = null;
          existing.disconnectedAt = null;
        }
        existing.username = trimmed; // update case if changed
        if (avatar !== undefined) existing.avatar = avatar;
        this.bySocket.set(socketId, lower);
        return existing;
      }
      // Different socket but name is in GC grace -> allow reclaim (owner reconnect)
      // Spec says 5-min grace before freeing for others; we treat any reclaim within grace as owner returning.
      // Tradeoff: without auth token, stealing during grace would also succeed - acceptable for party lobby where friends cooperate.
      // To be stricter, require explicit profile:reconnect with token; for now we allow register to reclaim gracefully.
      if (existing.timer) {
        console.log(`[users] grace reclaim "${trimmed}" old=${existing.socketId} new=${socketId}`);
        clearTimeout(existing.timer);
        const oldSocket = existing.socketId;
        if (oldSocket !== socketId) {
          this.bySocket.delete(oldSocket);
        }
        existing.socketId = socketId;
        existing.username = trimmed;
        if (avatar !== undefined) existing.avatar = avatar;
        existing.timer = null;
        existing.expiresAt = null;
        existing.disconnectedAt = null;
        existing.connected = true;
        this.bySocket.set(socketId, lower);
        return existing;
      }
      // Active duplicate - reject
      throw new Error(`Username "${trimmed}" is already taken. Choose another.`);
    }

    // If this socket previously held a different name, free it (rename flow)
    const prevLower = this.bySocket.get(socketId);
    if (prevLower && prevLower !== lower) {
      const prev = this.byName.get(prevLower);
      if (prev && prev.socketId === socketId) {
        if (prev.timer) clearTimeout(prev.timer);
        this.byName.delete(prevLower);
      }
    }

    const entry = {
      socketId,
      username: trimmed,
      avatar,
      timer: null,
      expiresAt: null,
      disconnectedAt: null,
      connected: true,
    };
    this.byName.set(lower, entry);
    this.bySocket.set(socketId, lower);
    return entry;
  }

  /**
   * Update username/avatar for a socket (rename self).
   * Enforces uniqueness.
   */
  update(socketId, newUsername, newAvatar) {
    const currentLower = this.bySocket.get(socketId);
    if (!currentLower) throw new Error("No active session - register first");
    const current = this.byName.get(currentLower);
    if (!current) throw new Error("Session not found");

    if (newUsername && newUsername.trim().toLowerCase() !== currentLower) {
      const newTrimmed = String(newUsername).trim();
      const newLower = newTrimmed.toLowerCase();
      if (this.byName.has(newLower)) {
        const other = this.byName.get(newLower);
        if (!other.timer) throw new Error(`Username "${newTrimmed}" is already taken`);
        // grace period - still reserved
        throw new Error(`Username "${newTrimmed}" is reserved (grace period)`);
      }
      // Move entry
      if (current.timer) clearTimeout(current.timer);
      this.byName.delete(currentLower);
      current.username = newTrimmed;
      current.timer = null;
      current.expiresAt = null;
      this.byName.set(newLower, current);
      this.bySocket.set(socketId, newLower);
    } else if (newUsername) {
      // Same name different case - update display
      current.username = String(newUsername).trim();
    }

    if (newAvatar !== undefined) current.avatar = newAvatar;
    return current;
  }

  /**
   * Called on socket disconnect - start GC timer
   */
  handleDisconnect(socketId) {
    const lower = this.bySocket.get(socketId);
    if (!lower) return null;
    const entry = this.byName.get(lower);
    if (!entry) {
      this.bySocket.delete(socketId);
      return null;
    }
    // Mark disconnected but keep reserved
    entry.connected = false;
    entry.disconnectedAt = Date.now();
    entry.expiresAt = Date.now() + this.gcMs;
    // Start timer
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      // Only expire if still disconnected and not reclaimed by same socketId
      const cur = this.byName.get(lower);
      if (cur && cur.socketId === socketId && !cur.connected) {
        this.byName.delete(lower);
        this.bySocket.delete(socketId);
        if (this.onExpire) this.onExpire(lower, cur.username);
        console.log(`[users] GC expired "${cur.username}" (${lower}) after ${this.gcMs}ms`);
      }
    }, this.gcMs);
    // Do NOT delete bySocket yet - keep so reconnect can cancel
    // But we need to allow socketId reuse? For new socket with same username, we check timer existence.
    return entry;
  }

  /**
   * Called on reconnect (or new socket claiming same name within grace) - cancel timer
   */
  handleReconnect(socketId, username) {
    // If client reconnects with same username but new socketId, we treat as reclaim attempt
    // register() already handles grace check; this helper is for explicit reconnect event
    const lower = String(username).trim().toLowerCase();
    const entry = this.byName.get(lower);
    if (!entry) return null;
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
      entry.expiresAt = null;
      entry.disconnectedAt = null;
      entry.connected = true;
      // Update socketId to new socket
      const oldSocket = entry.socketId;
      if (oldSocket !== socketId) {
        this.bySocket.delete(oldSocket);
        entry.socketId = socketId;
        this.bySocket.set(socketId, lower);
      } else {
        entry.connected = true;
      }
      return entry;
    }
    return null;
  }

  /**
   * Force remove (e.g., on rename or explicit logout)
   */
  removeBySocket(socketId) {
    const lower = this.bySocket.get(socketId);
    if (!lower) return;
    const entry = this.byName.get(lower);
    if (entry) {
      if (entry.timer) clearTimeout(entry.timer);
      // Only delete if owned by this socket
      if (entry.socketId === socketId) this.byName.delete(lower);
    }
    this.bySocket.delete(socketId);
  }

  has(username) {
    const lower = String(username).trim().toLowerCase();
    const e = this.byName.get(lower);
    return !!e && !e.timer; // active only
  }

  isReserved(username) {
    const lower = String(username).trim().toLowerCase();
    const e = this.byName.get(lower);
    return !!e && !!e.timer;
  }

  getBySocket(socketId) {
    const lower = this.bySocket.get(socketId);
    if (!lower) return null;
    return this.byName.get(lower) || null;
  }

  getByName(username) {
    const lower = String(username).trim().toLowerCase();
    return this.byName.get(lower) || null;
  }

  listActive() {
    const out = [];
    for (const [lower, e] of this.byName) {
      if (!e.timer) out.push({ username: e.username, socketId: e.socketId, avatar: e.avatar });
    }
    return out;
  }

  /** For debugging / admin */
  debugState() {
    return {
      gcMs: this.gcMs,
      count: this.byName.size,
      entries: [...this.byName.entries()].map(([k, v]) => ({
        lower: k,
        username: v.username,
        socketId: v.socketId,
        hasTimer: !!v.timer,
        connected: v.connected,
        expiresAt: v.expiresAt
      }))
    };
  }
}

export default UserRegistry;
