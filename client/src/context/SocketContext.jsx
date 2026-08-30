/**
 * src/context/SocketContext.jsx — Socket.io provider
 * Connects once, handles profile:register handshake, reconnection, rooms updates.
 * Exposes { socket, connected, rooms, games, registerProfile, error }
 */

import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

export const SocketContext = createContext(null);

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

export function SocketProvider({ profile, children }) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [games, setGames] = useState([]);
  const [socketError, setSocketError] = useState(null);
  const [profileStatus, setProfileStatus] = useState("idle"); // idle | ok | error
  const [profileError, setProfileError] = useState(null);

  const socketRef = useRef(null);

  // Create socket once
  useEffect(() => {
    const s = io(SERVER_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      timeout: 10000
    });
    socketRef.current = s;
    setSocket(s);

    function onConnect() {
      setConnected(true);
      setSocketError(null);
      console.log("[socket] connected", s.id);
    }
    function onDisconnect(reason) {
      setConnected(false);
      console.log("[socket] disconnected", reason);
    }
    function onConnectError(err) {
      setSocketError(err.message);
      console.warn("[socket] connect_error", err.message);
    }
    function onRoomsUpdate(list) {
      setRooms(Array.isArray(list) ? list : []);
    }
    function onGamesList(list) {
      setGames(Array.isArray(list) ? list : []);
    }
    function onProfileOk(data) {
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
      s.disconnect();
    };
  }, []);

  // Whenever profile becomes available or socket reconnects, register
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

  // Also on connect, if profile exists, ensure register
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
    serverUrl: SERVER_URL
  }), [socket, connected, rooms, games, socketError, profileStatus, profileError, registerProfile]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
