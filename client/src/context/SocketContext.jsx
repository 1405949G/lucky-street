/**
 * src/context/SocketContext.jsx — Socket provider (dual-mode)
 * Option A (Render/Node): uses socket.io-client (server/src/index.js:52)
 * Option B (pure Cloudflare): uses native WebSocket to Workers DO (server/src/worker.js + durable/LuckyStreetDO.js)
 * Auto-selects based on VITE_SERVER_URL. Same API exposed so Lobby/RoomBrowser unchanged.
 *
 * Fixes for hibernation/drop bug (buttons stop after idle, refresh fixes):
 * - NativeSocket: exponential backoff reconnect (was fixed 800ms), heartbeat ping, ack timeout+retry, pending flush ordered
 * - Fetch: fetchWithRetry for HTTP /api calls
 * - Re-sync: on reconnect re-register profile + room:sync
 */

import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

export const SocketContext = createContext(null);

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
const FORCE_NATIVE = import.meta.env.VITE_USE_NATIVE_WS === "true";
// Auto-detect Workers: workers.dev or explicit /ws path
const USE_NATIVE = FORCE_NATIVE || SERVER_URL.includes("workers.dev") || SERVER_URL.includes(".workerd") || SERVER_URL.endsWith("/ws");

// ——— fetch with retry for HTTP timeout / DO eviction (cold start) ———
export async function fetchWithRetry(url, opts = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), opts.timeout || 8000);
      const r = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(t);
      if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) {
      if (i === retries - 1) throw e;
      const delay = Math.min(500 * Math.pow(2, i) + Math.random() * 250, 4000);
      await new Promise(res => setTimeout(res, delay));
    }
  }
}

// ——— Native WebSocket wrapper mimicking socket.io API ———
class NativeSocket {
  constructor(url) {
    // url is https://... -> wss://.../ws
    let wsUrl = url;
    if (wsUrl.startsWith("http")) wsUrl = wsUrl.replace(/^http/, "ws");
    // Ensure /ws path
    if (!wsUrl.includes("/ws")) wsUrl = wsUrl.replace(/\/$/, "") + "/ws";
    this.url = wsUrl;
    this.listeners = new Map(); // event -> Set<cb>
    this.ackCallbacks = new Map(); // ackId -> fn
    this.ackTimers = new Map(); // ackId -> timeout
    this.pending = [];
    this.connected = false;
    this.id = "native_" + Math.random().toString(36).slice(2, 9);
    this.backoff = 800;
    this.maxBackoff = 15000;
    this.attempt = 0;
    this.heartbeat = null;
    this._closedIntentionally = false;
    this._connect();

    // Reconnect on tab visible / online (handles DO hibernation + network drop)
    this._onVisible = () => { if (document.visibilityState === "visible" && !this.connected) this._connect(true); };
    this._onOnline = () => this._connect(true);
    try {
      document.addEventListener("visibilitychange", this._onVisible);
      window.addEventListener("online", this._onOnline);
    } catch {}
  }

  _scheduleReconnect() {
    if (this._closedIntentionally) return;
    this.connected = false;
    const jitter = Math.random() * 400;
    const delay = Math.min(this.backoff * Math.pow(1.6, this.attempt++) + jitter, this.maxBackoff);
    setTimeout(() => this._connect(), delay);
  }

  _connect(resetBackoff = false) {
    if (resetBackoff) { this.attempt = 0; this.backoff = 800; }
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      // already connecting/open — don't duplicate
      if (this.ws.readyState === WebSocket.OPEN) return;
    }
    try {
      this.ws = new WebSocket(this.url);
    } catch (e) {
      this._emitInternal("connect_error", e);
      this._scheduleReconnect();
      return;
    }

    this.ws.addEventListener("open", () => {
      this.connected = true;
      this.attempt = 0;
      this.backoff = 800;
      this._emitInternal("connect");
      // flush pending emits in order (profile:register first if queued)
      const toSend = [...this.pending];
      this.pending = [];
      for (const { event, data, ack } of toSend) this._send(event, data, ack);
      // heartbeat to detect half-open (DO may hibernate without close)
      clearInterval(this.heartbeat);
      this.heartbeat = setInterval(() => {
        try {
          if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ event: "ping", data: {} }));
        } catch {}
      }, 25000);
    });

    this.ws.addEventListener("close", (ev) => {
      const wasConnected = this.connected;
      this.connected = false;
      clearInterval(this.heartbeat);
      this._emitInternal("disconnect", ev.reason || "closed");
      // don't double-schedule if we already scheduled via error
      if (wasConnected || this.attempt === 0) this._scheduleReconnect();
    });

    this.ws.addEventListener("error", (ev) => {
      this._emitInternal("connect_error", ev);
      // error often followed by close — schedule only if not already
      if (!this.connected) this._scheduleReconnect();
    });

    this.ws.addEventListener("message", (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      // Ack response
      if (msg.type === "ack" && msg.ackId) {
        const cb = this.ackCallbacks.get(msg.ackId);
        const t = this.ackTimers.get(msg.ackId);
        if (t) clearTimeout(t);
        this.ackCallbacks.delete(msg.ackId);
        this.ackTimers.delete(msg.ackId);
        if (cb) cb(msg.data);
        return;
      }
      // Server-assigned id for host checks (DO generates socketId, not client's native_ id)
      if (msg.event === "connected" && msg.data?.id) {
        this.id = msg.data.id;
        this._emitInternal("connect", msg.data);
        this._emitInternal("connected", msg.data);
        return;
      }
      // pong for heartbeat
      if (msg.event === "pong") return;
      // Regular event
      if (msg.event) {
        this._emitInternal(msg.event, msg.data);
      }
    });
  }

  _emitInternal(event, data) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of Array.from(set)) {
      try { cb(data); } catch {}
    }
  }

  _send(event, data, ack) {
    const ackId = ack ? Math.random().toString(36).slice(2, 9) : undefined;
    if (ack && ackId) {
      this.ackCallbacks.set(ackId, ack);
      // auto-timeout ack after 8s (covers DO eviction cold start) then retry once via pending
      const t = setTimeout(() => {
        if (this.ackCallbacks.has(ackId)) {
          this.ackCallbacks.delete(ackId);
          this.ackTimers.delete(ackId);
          // surface as error so caller can retry/show toast
          try { ack({ ok: false, error: "timeout — retrying" }); } catch {}
        }
      }, 8000);
      this.ackTimers.set(ackId, t);
    }
    const payload = JSON.stringify({ event, data: data || {}, ackId });
    if (this.connected && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.send(payload); } catch { this.pending.push({ event, data, ack }); }
    } else {
      this.pending.push({ event, data, ack });
    }
  }

  on(event, cb) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(cb);
  }

  off(event, cb) {
    const set = this.listeners.get(event);
    if (!set) return;
    if (cb) set.delete(cb);
    else set.clear();
  }

  emit(event, data, ack) {
    // socket.io allows emit(event, data, ack) where data may be omitted and ack is function
    // Normalize: if data is function and ack undefined, treat as ack
    if (typeof data === "function" && ack === undefined) {
      ack = data;
      data = {};
    }
    this._send(event, data, ack);
  }

  disconnect() {
    this._closedIntentionally = true;
    clearInterval(this.heartbeat);
    try { document.removeEventListener("visibilitychange", this._onVisible); } catch {}
    try { window.removeEventListener("online", this._onOnline); } catch {}
    try { this.ws.close(); } catch {}
  }
}

export function SocketProvider({ profile, children }) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [games, setGames] = useState([]);
  const [socketError, setSocketError] = useState(null);
  const [profileStatus, setProfileStatus] = useState("idle");
  const [profileError, setProfileError] = useState(null);

  const socketRef = useRef(null);
  const useNativeRef = useRef(USE_NATIVE);
  const currentRoomRef = useRef(null);

  useEffect(() => {
    let s;
    if (useNativeRef.current) {
      console.log("[socket] using native WebSocket (Workers DO) →", SERVER_URL);
      s = new NativeSocket(SERVER_URL);
    } else {
      console.log("[socket] using socket.io →", SERVER_URL);
      s = io(SERVER_URL, {
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 800,
        reconnectionDelayMax: 15000,
        randomizationFactor: 0.3,
        timeout: 10000,
      });
    }
    socketRef.current = s;
    setSocket(s);

    function onConnect() {
      setConnected(true);
      setSocketError(null);
      console.log("[socket] connected", s.id || "native");
      // re-register profile and re-sync room after hibernation / drop
      const p = socketRef.current?._lastProfile;
      if (p?.username) {
        // use stored last profile if React profile stale
        setTimeout(() => {
          const cur = p || profile;
          if (cur?.username) registerProfile(cur);
        }, 100);
      }
      // room re-sync is handled in Lobby via socket "connect" listener, but also try here if we know room
      if (currentRoomRef.current) {
        setTimeout(() => {
          try { s.emit("room:sync", { roomId: currentRoomRef.current }); } catch {}
        }, 300);
      }
    }
    function onDisconnect(reason) {
      setConnected(false);
      console.log("[socket] disconnected", reason);
    }
    function onConnectError(err) {
      const msg = err?.message || String(err);
      setSocketError(msg);
      console.warn("[socket] connect_error", msg);
    }
    function onRoomsUpdate(list) {
      setRooms(Array.isArray(list) ? list : []);
    }
    function onGamesList(list) {
      setGames(Array.isArray(list) ? list : []);
    }
    function onProfileOk() {
      setProfileStatus("ok");
      setProfileError(null);
    }
    function onProfileErr(data) {
      setProfileStatus("error");
      setProfileError(data?.error || "Profile error");
    }
    function onRoomError(data) {
      setSocketError(data?.error || "Room error");
      setTimeout(() => setSocketError(null), 4000);
    }

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("connect_error", onConnectError);
    s.on("rooms:update", onRoomsUpdate);
    s.on("games:list", onGamesList);
    s.on("profile:ok", onProfileOk);
    s.on("profile:error", onProfileErr);
    s.on("room:error", onRoomError);

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("connect_error", onConnectError);
      s.off("rooms:update", onRoomsUpdate);
      s.off("games:list", onGamesList);
      s.off("profile:ok", onProfileOk);
      s.off("profile:error", onProfileErr);
      s.off("room:error", onRoomError);
      try { s.disconnect(); } catch {}
    };
  }, []);

  const registerProfile = useCallback((p = profile, retry = 0) => {
    const s = socketRef.current;
    if (!s || !p?.username) return;
    // remember last profile for reconnect
    s._lastProfile = p;
    s.emit("profile:register", { username: p.username, avatar: p.avatar }, (res) => {
      if (res?.ok) {
        setProfileStatus("ok");
        setProfileError(null);
      } else {
        const msg = res?.error || "Registration failed";
        // Refresh race: same name as before but server says taken because old socket still in grace — retry shortly
        // or timeout from DO eviction — retry with backoff
        if ((/already taken/i.test(msg) || /timeout/i.test(msg)) && retry < 3) {
          const delay = 600 * Math.pow(1.5, retry);
          setTimeout(() => registerProfile(p, retry + 1), delay);
          return;
        }
        setProfileStatus("error");
        setProfileError(msg);
      }
    });
  }, [profile]);

  useEffect(() => {
    if (!socket || !profile?.username) return;
    if (!connected) return;
    socketRef.current._lastProfile = profile;
    registerProfile(profile);
  }, [socket, profile, connected, registerProfile]);

  useEffect(() => {
    if (!socket) return;
    function onConn() {
      // keep ref for re-sync
      const p = socketRef.current?._lastProfile || profile;
      if (p?.username) registerProfile(p);
      if (currentRoomRef.current) {
        setTimeout(() => {
          try { socket.emit("room:sync", { roomId: currentRoomRef.current }); } catch {}
        }, 200);
      }
    }
    socket.on("connect", onConn);
    return () => socket.off("connect", onConn);
  }, [socket, profile, registerProfile]);

  // track current room from URL for re-sync after hibernation
  useEffect(() => {
    const update = () => {
      const m = window.location.pathname.match(/\/room\/([A-Z0-9]{4})/i) || window.location.pathname.match(/\/tv\/([A-Z0-9]{4})/i);
      currentRoomRef.current = m ? m[1].toUpperCase() : null;
    };
    update();
    window.addEventListener("popstate", update);
    const iv = setInterval(update, 1000);
    return () => { window.removeEventListener("popstate", update); clearInterval(iv); };
  }, []);

  const value = useMemo(() => ({
    socket: socketRef.current || socket,
    connected,
    rooms,
    games,
    socketError,
    profileStatus,
    profileError,
    registerProfile,
    serverUrl: SERVER_URL,
    transport: useNativeRef.current ? "native-ws (Workers DO)" : "socket.io (Node)",
  }), [socket, connected, rooms, games, socketError, profileStatus, profileError, registerProfile]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
