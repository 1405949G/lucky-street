/**
 * Lobby — Host can change game/options, add bots (generic names), transfer host, kick via popup
 * Name/avatar locked inside room (change only at main menu / direct-link IdentityModal).
 * Single Leave button (removed duplicate back arrow) — guarantees room:leave before navigate
 */

import React, { useContext, useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ProfileContext } from "../context/ProfileContext.jsx";
import { SocketContext } from "../context/SocketContext.jsx";
import IdentityModal from "./IdentityModal.jsx";

export default function Lobby({ spectate = false }) {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { hasProfile } = useContext(ProfileContext);
  const { socket, games, connected, profileStatus } = useContext(SocketContext);

  const [room, setRoom] = useState(null);
  const [error, setError] = useState(null);
  const [showBlocking, setShowBlocking] = useState(false);
  const [botName, setBotName] = useState("");
  const [toast, setToast] = useState(null);
  const [kickedPopup, setKickedPopup] = useState(false);
  const [hostActionTarget, setHostActionTarget] = useState(null);
  const [botConfirm, setBotConfirm] = useState(null);
  const [mobileTab, setMobileTab] = useState("board"); // board | controls — for phone split-view like Kahoot
  const leavingRef = useRef(false);
  const roomRef = useRef(null);
  useEffect(() => { roomRef.current = room; }, [room]);

  const id = String(roomId || "").toUpperCase();

  useEffect(() => {
    if (!hasProfile) setShowBlocking(true);
    else setShowBlocking(false);
  }, [hasProfile]);

  useEffect(() => {
    if (!socket) return;
    if (!connected) return;
    if (!spectate) {
      if (!hasProfile) return;
      if (profileStatus !== "ok") return;
    }

    function onLobbyUpdate(full) {
      if (full.id !== id) return;
      // If we were in room but update no longer contains us -> we were kicked/removed (covers missed player:kicked when TV open or hibernation)
      const my = socket?.id;
      const wasInRoom = roomRef.current?.players?.some(p => p.id === my) || roomRef.current?.spectators?.some(s => s.id === my);
      const nowInRoom = full.players.some(p => p.id === my) || full.spectators?.some(s => s.id === my);
      if (wasInRoom && !nowInRoom && !leavingRef.current) {
        // Check if we were player vs spectator to show correct message
        const wasPlayer = roomRef.current?.players?.some(p => p.id === my);
        if (wasPlayer) setKickedPopup(true);
        else setRoom(full);
        return;
      }
      setRoom(full);
    }
    function onKicked(data) {
      if (data.roomId === id) setKickedPopup(true);
    }
    function onRoomErr(data) {
      if (data?.error && /kicked/i.test(data.error)) {
        setKickedPopup(true);
        return;
      }
      // Transient errors during refresh/hibernation — don't show fatal card, will retry
      if (data?.error && (/already taken/i.test(data.error) || /timeout/i.test(data.error) || /Register a profile first/i.test(data.error) || /missing identity/i.test(data.error))) {
        return;
      }
      setError(data.error);
      setTimeout(() => setError(null), 3000);
    }

    socket.on("lobby:update", onLobbyUpdate);
    socket.on("player:kicked", onKicked);
    socket.on("room:error", onRoomErr);

    function attemptJoin(retry = 0) {
      socket.emit("room:join", { roomId: id }, (jres) => {
        if (jres?.ok) { setRoom(jres.room); setError(null); }
        else {
          const msg = jres?.error || "";
          const transient = /Register a profile first|already taken|timeout/i.test(msg);
          if (transient && retry < 4) {
            const delay = 400 * Math.pow(1.5, retry);
            setTimeout(() => attemptJoin(retry + 1), delay);
            return;
          }
          setError(jres?.error || "Room not found");
        }
      });
    }
    function attemptSpectate(retry = 0) {
      const prof = (() => { try { return JSON.parse(localStorage.getItem("luckyStreet:profile")||"{}"); } catch { return {}; } })();
      socket.emit("room:spectate", { roomId: id, username: prof?.username, avatar: prof?.avatar }, (jres) => {
        if (jres?.ok) { setRoom(jres.room); setError(null); }
        else {
          const msg = jres?.error || "";
          if (/timeout/i.test(msg) && retry < 3) {
            setTimeout(() => attemptSpectate(retry + 1), 500);
            return;
          }
          setError(jres?.error || "Spectate failed");
        }
      });
    }
    function syncAttempt(retry = 0) {
      socket.emit("room:sync", { roomId: id }, (res) => {
        if (res?.ok) {
          // If room exists but doesn't contain me (direct link join), trigger join/spectate
          const meInRoom = res.room.players.some(p => p.id === socket.id) || res.room.spectators?.some(s => s.id === socket.id);
          // Fallback: check by name if id not yet synced (refresh race)
          const nameInRoom = (() => {
            try { const pn = JSON.parse(localStorage.getItem("luckyStreet:profile")||"{}")?.username; return pn && (res.room.players.some(p => p.name.toLowerCase() === pn.toLowerCase()) || res.room.spectators?.some(s => s.name.toLowerCase() === pn.toLowerCase())); } catch { return false; }
          })();
          if (meInRoom || nameInRoom) { setRoom(res.room); setError(null); }
          else {
            if (spectate) attemptSpectate();
            else attemptJoin();
          }
        }
        else if (res?.error && /timeout/i.test(res.error) && retry < 3) {
          setTimeout(() => syncAttempt(retry + 1), 500 * Math.pow(1.5, retry));
        } else {
          if (spectate) attemptSpectate();
          else attemptJoin();
        }
      });
    }
    syncAttempt();
    socket._luckyAttemptJoin = attemptJoin;
    // Re-sync after reconnect (covers hibernation / refresh)
    function onReconnect() { syncAttempt(); }
    socket.on("connect", onReconnect);
    socket.on("connected", onReconnect);

    return () => {
      socket.off("lobby:update", onLobbyUpdate);
      socket.off("player:kicked", onKicked);
      socket.off("room:error", onRoomErr);
      socket.off("connect", onReconnect);
      socket.off("connected", onReconnect);
    };
  }, [socket, id, hasProfile, connected, profileStatus, spectate]);

  // Auto-switch to spectator if navigated to /room/:id/spectate while already a player
  useEffect(() => {
    if (!spectate || !socket || !room) return;
    const myId = socket.id;
    if (!myId) return;
    const isPlayer = room.players.some(p => p.id === myId);
    if (isPlayer) {
      // move from player to spectator
      socket.emit("room:spectate", { roomId: id }, (res) => {
        if (res?.ok) showToast("Switched to spectator");
      });
    }
  }, [spectate, socket, room, id]);

  // If user hits browser back / component unmounts while still in room, try to leave
  // (prevents 30s grace keeping ghost player). Intentional Leave also calls handleLeave.
  useEffect(() => {
    return () => {
      if (leavingRef.current) return;
      if (!socket || !id) return;
      // Don't leave if we were kicked / already showing error
      try {
        // best-effort fire-and-forget; server will clear immediately if ack arrives,
        // otherwise webSocketClose grace will hold 30s — but explicit leave avoids grace
        socket.emit("room:leave", { roomId: id });
      } catch {}
    };
  }, [socket, id]);

  if (showBlocking) {
    return <IdentityModal blocking title={`Enter ${id}`} onDone={() => {
      setShowBlocking(false);
      // wait a tick for profile register to reach server, then join
      setTimeout(() => {
        const fn = socket?._luckyAttemptJoin;
        if (fn) fn();
        else socket?.emit("room:join", { roomId: id }, (jres) => {
          if (jres?.ok) setRoom(jres.room);
          else if (jres?.error) setError(jres.error);
        });
      }, 500);
    }} />;
  }

  if (kickedPopup) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-[#070b14]/80 backdrop-blur-md">
        <div className="w-full max-w-[380px] rounded-[24px] bg-[#142a3d] border border-white/10 p-6 text-center shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center mx-auto text-xl">✕</div>
          <h2 className="font-extrabold text-white text-lg mt-3">You were kicked</h2>
          <p className="text-sm text-white/60 mt-1">The host removed you from the lobby.</p>
          <button onClick={() => { setKickedPopup(false); navigate("/"); }} className="mt-5 w-full py-3 rounded-full bg-[#f3ecd8] hover:bg-white text-[#0e2533] font-extrabold">Back to Lobby</button>
        </div>
      </div>
    );
  }

  if (error) {
    const isTransient = /already taken|timeout|Register a profile/i.test(error);
    return (
      <div className="max-w-[520px] mx-auto px-4 py-10">
        <div className="rounded-2xl bg-rose-500/10 border border-rose-500/20 p-6 text-center">
          <p className="font-bold text-rose-300">{error}</p>
          <p className="text-xs text-white/50 mt-2">{isTransient ? "Retrying automatically — or tap Retry." : "Check the code and try again."}</p>
          <div className="mt-4 flex gap-2 justify-center">
            {isTransient && <button onClick={() => { setError(null); socket?._luckyAttemptJoin?.(); if (!room) socket?.emit("room:sync", { roomId: id }, (r)=>{ if(r?.ok) setRoom(r.room); }); }} className="px-5 py-2 rounded-full bg-amber-400 text-[#0e2533] font-bold">Retry</button>}
            <button onClick={() => navigate("/")} className="px-5 py-2 rounded-full bg-white text-[#0e2533] font-bold">Back to Lobbies</button>
          </div>
          <a href="/admin" className="text-xs text-white/30 underline mt-3 inline-block">Admin: clear ghost rooms</a>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="max-w-[520px] mx-auto px-4 py-16 text-center">
        <div className="w-10 h-10 border-2 border-white/20 border-t-amber-400 rounded-full animate-spin mx-auto"></div>
        <p className="text-sm text-white/50 mt-3">Loading lobby {id}…</p>
      </div>
    );
  }

  const myId = socket?.id;
  const isHost = !!(myId && room.hostId === myId);
  const isSpectator = !!(myId && room.spectators?.some(s => s.id === myId));
  const isPlayer = !!(myId && room.players.some(p => p.id === myId));
  const game = games.find(g => g.id === room.game) || { label: room.game, optionSchema: [] };

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2500); }

  function handleSpectate() {
    socket.emit("room:spectate", { roomId: id }, (res) => {
      if (!res?.ok) showToast(res.error || "Spectate failed");
      else showToast(isPlayer ? "Switched to spectator" : "Spectating");
    });
  }
  function handleJoinAsPlayer() {
    socket.emit("spectator:join", { roomId: id }, (res) => {
      if (!res?.ok) showToast(res.error || "Join failed");
      else showToast("Joined as player");
    });
  }

  function handleChangeGame(e) {
    const newGame = e.target.value;
    socket.emit("lobby:updateGame", { roomId: id, gameId: newGame }, (res) => {
      if (!res?.ok) showToast(res.error);
      else showToast(`Game set to ${res.room.gameLabel}`);
    });
  }
  function handleOptionChange(key, value) {
    socket.emit("lobby:updateOptions", { roomId: id, options: { [key]: value } }, (res) => {
      if (!res?.ok) showToast(res.error);
    });
  }
  function handleAddBot() {
    socket.emit("lobby:addBot", { roomId: id, botName: botName.trim() || undefined }, (res) => {
      if (!res?.ok) showToast(res.error);
      else { setBotName(""); showToast(`Added bot`); }
    });
  }
  function handleRemoveBot(botId, botName) {
    socket.emit("lobby:removeBot", { roomId: id, botId }, (res) => {
      if (!res?.ok) showToast(res.error);
      else showToast(`Removed ${botName}`);
      setBotConfirm(null);
    });
  }
  function handleKick(targetId, name) {
    socket.emit("lobby:kickPlayer", { roomId: id, targetId }, (res) => {
      if (!res?.ok) showToast(res.error);
      else showToast(`Kicked ${name}`);
    });
  }
  function handleTransferHost(targetId, name) {
    socket.emit("lobby:transferHost", { roomId: id, targetId }, (res) => {
      if (!res?.ok) showToast(res.error);
      else {
        showToast(`${name} is now host`);
        setHostActionTarget(null);
      }
    });
  }
  function handleLeave() {
    if (leavingRef.current) return;
    leavingRef.current = true;
    let navigated = false;
    const go = () => { if (!navigated) { navigated = true; navigate("/", { replace: true }); } };
    // Fire room:leave with ack; navigate on ack or fallback. This cancels server grace immediately.
    try {
      const tFallback = setTimeout(go, 900);
      socket.emit("room:leave", { roomId: id }, () => { clearTimeout(tFallback); go(); });
      // Extra safety: if ack never comes (packet loss / hibernation), still navigate but server's webSocketClose grace will expire 30s later
      setTimeout(go, 500);
    } catch {
      go();
    }
  }

  return (
    <div className="max-w-[760px] mx-auto px-4 pb-10">
      {/* Single header action: only Leave (removed duplicate back arrow) */}
      <div className="flex items-center justify-between pt-2">
        <button onClick={handleLeave} aria-label="Leave room" className="px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-bold text-white/70 flex items-center gap-1.5">
          <span className="text-sm leading-none">←</span> Leave
        </button>
        <div className="text-center flex-1">
          <h1 className="font-display font-extrabold text-[18px] tracking-wide text-[#f3ecd8]">Lucky Street</h1>
          <p className="text-xs text-white/50 -mt-1">Room <span className="font-mono font-bold text-white">{room.id}</span> • Host: {room.hostName}</p>
        </div>
        <div className="w-[76px]" aria-hidden />
      </div>

      {/* Mobile toggle for Kahoot-style split: Board vs Controls */}
      <div className="mt-4 flex justify-center lg:hidden">
        <div className="inline-flex rounded-full bg-white/5 border border-white/10 p-1">
          <button onClick={() => setMobileTab("board")} className={`px-4 py-1.5 rounded-full text-xs font-bold ${mobileTab === "board" ? "bg-[#f3ecd8] text-[#0e2533]" : "text-white/60"}`}>Board</button>
          <button onClick={() => setMobileTab("controls")} className={`px-4 py-1.5 rounded-full text-xs font-bold ${mobileTab === "controls" ? "bg-[#f3ecd8] text-[#0e2533]" : "text-white/60"}`}>My Controls</button>
        </div>
      </div>

      {/* Split view: board (public) on top/left, controls (private) at bottom/right — PC sees both, phone toggles */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-5">
        {/* Board — public, visible on TV */}
        <div className={`${mobileTab === "controls" ? "hidden lg:block" : "block"} space-y-4`}>
          <div className="rounded-[24px] bg-[#29546c] border border-white/10 shadow-xl p-6 text-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ background: "radial-gradient(ellipse at top, rgba(255,255,255,0.15), transparent 60%)" }}></div>
            <div className="relative">
              <p className="text-xs tracking-widest font-bold text-white/50">JOIN CODE</p>
              <div className="font-display font-black text-[36px] tracking-[0.18em] text-[#f3ecd8]" style={{ textShadow: "0 2px 0 rgba(0,0,0,0.25)" }}>{room.id}</div>
              <p className="text-xs text-white/70 mt-1">Share: <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded break-all">{window.location.origin}/room/{room.id}</span></p>
              <p className="text-xs text-white/40 mt-1">Players look here — answers on their phones.</p>
              <div className="mt-3 flex justify-center gap-2 flex-wrap">
                <button onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/room/${room.id}`); showToast("Invite link copied"); }} className="px-4 py-2 rounded-full bg-[#f3ecd8] hover:bg-white text-[#0e2533] text-xs font-extrabold">Copy Invite Link</button>
                <span className="px-3 py-2 rounded-full bg-white/10 border border-white/10 text-xs font-bold text-white/70">{room.slotsText}</span>
              </div>
            </div>
          </div>

      <div className="mt-6">
        <h3 className="font-extrabold text-white text-sm">Players & Bots</h3>
        <p className="text-xs text-white/40">Name and avatar are locked in the room — change them from the main menu.</p>
        <div className="mt-3 flex flex-wrap gap-4">
          {room.players.map(p => {
            const isMe = p.id === myId;
            const isHostPlayer = p.isHost || p.id === room.hostId;
            const avatarIsImage = p.avatar && typeof p.avatar === "string" && p.avatar.startsWith("data:");
            const avatarBg = avatarIsImage ? null : (p.avatar || "#475569");
            // Name/avatar editing disabled in room — only host actions on others
            const canHostAct = isHost && !isMe;
            return (
              <div key={p.id} className="flex flex-col items-center gap-1.5 relative">
                {isHostPlayer && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                    <span className="text-[16px] drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">👑</span>
                  </div>
                )}
                <div className="relative">
                  <button
                    onClick={() => {
                      if (canHostAct) setHostActionTarget(p);
                    }}
                    disabled={!canHostAct}
                    className={`w-[64px] h-[64px] rounded-full border-2 flex items-center justify-center overflow-hidden shadow-md transition-transform
                      ${isMe ? "border-emerald-400 scale-[1.02]" : isHostPlayer ? "border-amber-400" : "border-white/15"}
                      ${canHostAct ? "cursor-pointer hover:scale-105" : "cursor-default"}`}
                    style={avatarBg ? { background: avatarBg } : {}}
                    title={canHostAct ? "Host actions" : p.name}
                  >
                    {avatarIsImage ? <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" /> : <span className="font-black text-white text-lg">{p.name.slice(0, 2).toUpperCase()}</span>}
                  </button>
                </div>
                <div className="flex flex-col items-center leading-none gap-0.5">
                  <span className="text-xs font-bold text-white truncate max-w-[72px] text-center">{p.name}</span>
                  {isMe ? <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-black tracking-wide">YOU</span> : null}
                </div>
              </div>
            );
          })}
          {room.bots.map(b => (
            <div key={b.id} className="flex flex-col items-center gap-1.5 relative">
              <button
                onClick={() => isHost && setBotConfirm(b)}
                disabled={!isHost}
                className={`relative ${isHost ? "cursor-pointer hover:scale-105 transition-transform" : "cursor-default"}`}
                title={isHost ? `Remove ${b.name}` : b.name}
              >
                <div className="w-[64px] h-[64px] rounded-full border-2 border-white/10 flex items-center justify-center shadow-md bg-[#1e2a3a]">
                  <span className="text-[24px]">🤖</span>
                </div>
              </button>
              <div className="flex flex-col items-center leading-none">
                <span className="text-xs font-bold text-white truncate max-w-[72px] text-center">{b.name}</span>
              </div>
            </div>
          ))}
          {Array.from({ length: Math.max(0, Math.min(4, room.maxPlayers - room.players.length - room.bots.length)) }).map((_, i) => (
            <div key={`wait-${i}`} className="flex flex-col items-center gap-1.5 opacity-40">
              <div className="w-[64px] h-[64px] rounded-full border-2 border-dashed border-white/25 bg-white/[0.03] flex items-center justify-center">
                <span className="w-6 h-0.5 bg-white/20 rounded-full"></span>
              </div>
              <span className="text-xs font-medium text-white/40">Waiting…</span>
            </div>
          ))}
        </div>
      </div>
      {/* Spectators — general view, no name required, count only */}
      <div className="mt-4 rounded-2xl bg-white/[0.04] border border-white/10 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white/60">Spectators • {room.spectatorCount || 0}</span>
          <div className="flex gap-2">
            {isPlayer && <button onClick={handleSpectate} className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs">Spectate</button>}
            {isSpectator && <button onClick={handleJoinAsPlayer} className="px-3 py-1 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold">Join as player</button>}
            {!isPlayer && !isSpectator && <><button onClick={handleSpectate} className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs">Spectate</button><button onClick={handleJoinAsPlayer} className="px-3 py-1 rounded-full bg-[#f3ecd8] hover:bg-white text-[#0e2533] text-xs font-bold">Join</button></>}
          </div>
        </div>
        {isSpectator && <p className="text-xs text-amber-300 mt-1">You are spectating — tap Join as player to take a slot</p>}
        {room.spectators?.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{room.spectators.map(s=> <span key={s.id} className="px-2 py-1 rounded-full bg-white/10 border border-white/10 text-white text-xs">{s.name}</span>)}</div>}
        {!isPlayer && !isSpectator && <p className="text-xs text-white/40 mt-1">Watch without taking a slot — or Join to play</p>}
      </div>
        </div>
        {/* Controls — private, host-only on desktop right, phone toggles */}
        <div className={`${mobileTab === "board" ? "hidden lg:block" : "block"} space-y-5`}>

      {isHost ? (
        <div className="rounded-2xl bg-[#0f2231]/80 border border-white/10 p-4">
          <h4 className="font-bold text-white text-sm">Add Bots</h4>
          <div className="mt-2 flex gap-2 items-center">
            <input value={botName} onChange={e => setBotName(e.target.value)} placeholder="Leave empty for random name" maxLength={20} className="flex-1 px-3 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 text-sm outline-none" />
            <button onClick={handleAddBot} className="px-4 py-2.5 rounded-xl bg-[#f3ecd8] hover:bg-white text-[#0e2533] text-sm font-bold">Add</button>
          </div>
          <p className="text-xs text-white/30 mt-1">{room.players.length + room.bots.length} / {room.maxPlayers} players — bots take a spot and look the same.</p>
        </div>
      ) : null}

      <div className="mt-5 rounded-2xl bg-[#0f2231]/80 border border-white/10 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="font-extrabold text-white text-sm">Game</span>
          {isHost ? (
            <select value={room.game} onChange={handleChangeGame} className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-white text-xs font-bold">
              {games.map(g => <option key={g.id} value={g.id} className="bg-[#0f2231]">{g.label}</option>)}
            </select>
          ) : (
            <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-white text-xs font-bold">{game.label}</span>
          )}
        </div>
        <p className="text-xs text-white/40 mt-1">{games.find(g=>g.id===room.game)?.description || ""}</p>
        <div className="mt-3 grid gap-3">
          {(game.optionSchema || []).map(opt => (
            <div key={opt.key} className="flex items-center gap-3">
              <label className="text-xs font-bold text-white/60 w-24">{opt.label}</label>
              {opt.type === "toggle" ? (
                isHost ? (
                  <button onClick={() => handleOptionChange(opt.key, !room.gameOptions[opt.key])} className={`relative w-12 h-6 rounded-full transition-colors ${room.gameOptions[opt.key] ? "bg-emerald-500" : "bg-white/15"}`}>
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${room.gameOptions[opt.key] ? "translate-x-6" : ""}`} />
                  </button>
                ) : (
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${room.gameOptions[opt.key] ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/40"}`}>{room.gameOptions[opt.key] ? "On" : "Off"}</span>
                )
              ) : opt.type === "slider" ? (
                isHost ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input type="range" min={opt.min} max={opt.max} step={opt.step} value={room.gameOptions[opt.key]} onChange={e => handleOptionChange(opt.key, Number(e.target.value))} className="flex-1 accent-amber-400" />
                    <span className="text-xs font-bold text-white w-12 text-right">{room.gameOptions[opt.key]}{opt.unit || ""}</span>
                  </div>
                ) : (
                  <span className="text-sm font-bold text-white">{room.gameOptions[opt.key]}{opt.unit || ""}</span>
                )
              ) : opt.type === "select" ? (
                isHost ? (
                  <select value={room.gameOptions[opt.key]} onChange={e => handleOptionChange(opt.key, e.target.value)} className="flex-1 px-3 py-2 rounded-xl bg-white/10 border border-white/15 text-white text-xs">
                    {opt.options.map(o => <option key={o} value={o} className="bg-[#0f2231]">{o}</option>)}
                  </select>
                ) : (
                  <span className="text-sm font-bold text-white capitalize">{room.gameOptions[opt.key]}</span>
                )
              ) : null}
            </div>
          ))}
        </div>
        <p className="text-xs text-white/30 mt-3">{isHost ? "Changes show up for everyone right away." : "Only the host can change these settings."}</p>
        </div>
        </div>
      </div>

      {hostActionTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#070b14]/60 backdrop-blur-sm" onClick={() => setHostActionTarget(null)}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-[320px] rounded-2xl bg-[#142a3d] border border-white/10 p-5 text-center shadow-2xl">
            <p className="text-sm text-white/60">Host actions for</p>
            <p className="font-extrabold text-white text-lg">{hostActionTarget.name}</p>
            <div className="mt-4 grid gap-2">
              <button onClick={() => handleTransferHost(hostActionTarget.id, hostActionTarget.name)} className="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#0e2533] font-extrabold flex items-center justify-center gap-2">👑 Make Host</button>
              <button onClick={() => { handleKick(hostActionTarget.id, hostActionTarget.name); setHostActionTarget(null); }} className="w-full py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold">Kick Player</button>
              <button onClick={() => setHostActionTarget(null)} className="w-full py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {botConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#070b14]/60 backdrop-blur-sm" onClick={() => setBotConfirm(null)}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-[320px] rounded-2xl bg-[#142a3d] border border-white/10 p-5 text-center shadow-2xl">
            <p className="text-sm text-white/60">Remove bot</p>
            <p className="font-extrabold text-white text-lg">{botConfirm.name} 🤖</p>
            <div className="mt-4 grid gap-2">
              <button onClick={() => handleRemoveBot(botConfirm.id, botConfirm.name)} className="w-full py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold">Remove Bot</button>
              <button onClick={() => setBotConfirm(null)} className="w-full py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold">Cancel</button>
            </div>
          </div>
        </div>
      )}


      {toast && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[#1f2937] text-white text-sm font-bold px-4 py-2.5 rounded-full shadow-xl border border-white/10">{toast}</div>}
    </div>
  );
}
