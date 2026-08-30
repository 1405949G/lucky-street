/**
 * src/context/SocketContext.jsx — Socket provider (dual-mode)
 * Option A (Render/Node): uses socket.io-client (server/src/index.js:52)
 * Option B (pure Cloudflare): uses native WebSocket to Workers DO (server/src/worker.js + durable/LuckyStreetDO.js)
 * Auto-selects based on VITE_SERVER_URL. Same API exposed so Lobby/RoomBrowser unchanged.
 */

import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

export const SocketContext = createContext(null);

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
const FORCE_NATIVE = import.meta.env.VITE_USE_NATIVE_WS === "true";
// Auto-detect Workers: workers.dev or explicit /ws path
const USE_NATIVE = FORCE_NATIVE || SERVER_URL.includes("workers.dev") || SERVER_URL.includes(".workerd") || SERVER_URL.endsWith("/ws");

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
    this.pending = [];
    this.connected = false;
    this.id = "native_" + Math.random().toString(36).slice(2, 9);
    this._connect();
  }

  _connect() {
    try {
      this.ws = new WebSocket(this.url);
    } catch (e) {
      this._emitInternal("connect_error", e);
      return;
    }

    this.ws.addEventListener("open", () => {
      this.connected = true;
      this._emitInternal("connect");
      // flush pending emits
      for (const { event, data, ack } of this.pending) this._send(event, data, ack);
      this.pending = [];
    });

    this.ws.addEventListener("close", (ev) => {
      this.connected = false;
      this._emitInternal("disconnect", ev.reason || "closed");
      // auto-reconnect after 800ms like socket.io
      setTimeout(() => this._connect(), 800);
    });

    this.ws.addEventListener("error", (ev) => {
      this._emitInternal("connect_error", ev);
    });

    this.ws.addEventListener("message", (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      // Ack response
      if (msg.type === "ack" && msg.ackId) {
        const cb = this.ackCallbacks.get(msg.ackId);
        if (cb) {
          this.ackCallbacks.delete(msg.ackId);
          cb(msg.data);
        }
        return;
      }
      // Server-assigned id for host checks (DO generates socketId, not client's native_ id)
      if (msg.event === "connected" && msg.data?.id) {
        this.id = msg.data.id;
        this._emitInternal("connect", msg.data);
        this._emitInternal("connected", msg.data);
        return;
      }
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
    if (ack && ackId) this.ackCallbacks.set(ackId, ack);
    const payload = JSON.stringify({ event, data: data || {}, ackId });
    if (this.connected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
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
        timeout: 10000,
      });
    }
    socketRef.current = s;
    setSocket(s);

    function onConnect() {
      setConnected(true);
      setSocketError(null);
      console.log("[socket] connected", s.id || "native");
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

    // Native socket also emits 'open' as connect; unify
    if (useNativeRef.current) {
      // NativeSocket already uses 'connect'/'disconnect', so above covers
      // For initial state, wait for open
      const check = setInterval(() => {
        if (s.connected) {
          setConnected(true);
          clearInterval(check);
        }
      }, 100);
      setTimeout(() => clearInterval(check), 5000);
    }

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

  const registerProfile = useCallback((p = profile) => {
    const s = socketRef.current;
    if (!s || !p?.username) return;
    s.emit("profile:register", { username: p.username, avatar: p.avatar }, (res) => {
      if (res?.ok) {
        setProfileStatus("ok");
        setProfileError(null);
      } else {
        setProfileStatus("error");
        setProfileError(res?.error || "Registration failed");
      }
    });
  }, [profile]);

  useEffect(() => {
    if (!socket || !profile?.username) return;
    if (!connected) return;
    registerProfile(profile);
  }, [socket, profile, connected, registerProfile]);

  useEffect(() => {
    if (!socket) return;
    function onConn() {
      if (profile?.username) registerProfile(profile);
    }
    socket.on("connect", onConn);
    return () => socket.off("connect", onConn);
  }, [socket, profile, registerProfile]);

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
