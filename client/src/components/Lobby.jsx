// TEXT LOCK — strings from client/src/content/copy.js:1 (do not edit text here without explicit user prompt)
﻿/**
 * Lobby - Host can change game/options, add bots (generic names), transfer host, kick via popup
 * Name/avatar locked inside room (change only at main menu / direct-link IdentityModal).
 * Single Leave button (removed duplicate back arrow) - guarantees room:leave before navigate
 */

import React, { useContext, useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ProfileContext } from "../context/ProfileContext.jsx";
import { SocketContext } from "../context/SocketContext.jsx";
import IdentityModal from "./IdentityModal.jsx";
import QuestGame from "../../../games/good-vs-evil/client/Game.jsx";
import TriviaGame from "../../../games/trivia/client/Game.jsx";

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
  const [inactivePopup, setInactivePopup] = useState(false);
  const [hostActionTarget, setHostActionTarget] = useState(null);
  const [botConfirm, setBotConfirm] = useState(null);
  const [mobileTab, setMobileTab] = useState("board"); // board | controls - for phone split-view like Kahoot
  const [showRules, setShowRules] = useState(false);
  const [triviaCatSearch, setTriviaCatSearch] = useState("");
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
    function onRoomClosed(data) {
      if (data?.roomId === id && data?.reason === "inactivity") setInactivePopup(true);
    }
    function onRoomDeleted(data) {
      if (data?.roomId === id && data?.reason === "inactivity") setInactivePopup(true);
    }
    function onRoomErr(data) {
      if (data?.error && /kicked/i.test(data.error)) {
        setKickedPopup(true);
        return;
      }
      // Transient errors during refresh/hibernation - don't show fatal card, will retry
      // Handle "Username already in this room" by falling back to spectate (same user second tab)
      if (data?.error && /Username already in this room/i.test(data.error)) {
        // Try spectate as fallback for same-name second tab
        const prof = (() => { try { return JSON.parse(localStorage.getItem("luckyStreet:profile")||"{}"); } catch { return {}; } })();
        socket.emit("room:spectate", { roomId: id, username: prof?.username, avatar: prof?.avatar }, (r) => {
          if (r?.ok) { setRoom(r.room); setError(null); }
        });
        return;
      }
      if (data?.error && /already in room .*leave it first/i.test(data.error)) {
        showToast(data.error);
        setError(data.error);
        return;
      }
      if (data?.error && /left — game cancelled/i.test(data.error)) {
        showToast(data.error);
        return;
      }
      if (data?.error && (/already taken/i.test(data.error) || /timeout/i.test(data.error) || /Register a profile first/i.test(data.error) || /missing identity/i.test(data.error))) {
        return;
      }
      if (data?.error && /Cannot spectate while quest/i.test(data.error)) {
        showToast(data.error);
        return;
      }
      if (data?.error && /Room is full/i.test(data.error)) {
        showToast(data.error);
        return;
      }
      if (data?.error && /not in this trivia|Already answered|Not accepting|Spectators cannot|Unknown trivia/i.test(data.error)) {
        showToast(data.error);
        return;
      }
      setError(data.error);
      setTimeout(() => setError(null), 3000);
    }

    socket.on("lobby:update", onLobbyUpdate);
    socket.on("player:kicked", onKicked);
    socket.on("room:closed", onRoomClosed);
    socket.on("room:deleted", onRoomDeleted);
    socket.on("room:error", onRoomErr);

    function attemptJoin(retry = 0) {
      socket.emit("room:join", { roomId: id }, (jres) => {
        if (jres?.ok) { setRoom(jres.room); setError(null); }
        else {
          const msg = jres?.error || "";
          // Fallback to spectate if name already in room (same user second tab)
          if (/Username already in this room/i.test(msg)) {
            const prof = (() => { try { return JSON.parse(localStorage.getItem("luckyStreet:profile")||"{}"); } catch { return {}; } })();
            socket.emit("room:spectate", { roomId: id, username: prof?.username, avatar: prof?.avatar }, (r) => {
              if (r?.ok) { setRoom(r.room); setError(null); }
              else setError(jres?.error || "Room not found");
            });
            return;
          }
          const transient = /Register a profile first|already taken|timeout|missing identity/i.test(msg);
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
      // Need profile for non-spectate join
      if (!spectate && !hasProfile) return;
      // For invite link via code, if we have a profile but not yet registered, wait a tick
      if (!spectate && hasProfile && profileStatus !== "ok") {
        if (retry < 6) { setTimeout(() => syncAttempt(retry + 1), 400); return; }
      }
      socket.emit("room:sync", { roomId: id }, (res) => {
        if (res?.ok) {
          // Spectate mode: auto-spectate even if already a player (move to spectators)
          if (spectate) {
            const alreadySpectator = res.room.spectators?.some(s => s.id === socket.id);
            if (alreadySpectator) { setRoom(res.room); setError(null); return; }
            // If already a player, room:spectate will move you
            attemptSpectate();
            return;
          }
          // Normal mode: if already in room, just sync
          const meInRoom = res.room.players.some(p => p.id === socket.id) || res.room.spectators?.some(s => s.id === socket.id);
          // Fallback: check by name if id not yet synced (refresh race)
          const nameInRoom = (() => {
            try { const pn = JSON.parse(localStorage.getItem("luckyStreet:profile")||"{}")?.username; return pn && (res.room.players.some(p => p.name.toLowerCase() === pn.toLowerCase()) || res.room.spectators?.some(s => s.name.toLowerCase() === pn.toLowerCase())); } catch { return false; }
          })();
          if (meInRoom || nameInRoom) { setRoom(res.room); setError(null); }
          else {
              // Need profile for join, if not ready, retry
              if (hasProfile && profileStatus !== "ok" && retry < 4) { setTimeout(() => syncAttempt(retry + 1), 400); return; }
              attemptJoin();
          }
        }
        else if (res?.error && /timeout/i.test(res.error) && retry < 3) {
          setTimeout(() => syncAttempt(retry + 1), 500 * Math.pow(1.5, retry));
        } else {
          if (spectate) attemptSpectate();
          else {
            if (hasProfile && profileStatus !== "ok" && retry < 4) { setTimeout(() => syncAttempt(retry + 1), 400); return; }
            attemptJoin();
          }
        }
      });
    }
    // Always sync, even if profile not yet ok - syncAttempt handles waiting
    syncAttempt();
    socket._luckyAttemptJoin = attemptJoin;
    // Re-sync after reconnect (covers hibernation / refresh)
    function onReconnect() { syncAttempt(); }
    socket.on("connect", onReconnect);
    socket.on("connected", onReconnect);

    return () => {
      socket.off("lobby:update", onLobbyUpdate);
      socket.off("player:kicked", onKicked);
      socket.off("room:closed", onRoomClosed);
      socket.off("room:deleted", onRoomDeleted);
      socket.off("room:error", onRoomErr);
      socket.off("connect", onReconnect);
      socket.off("connected", onReconnect);
    };
  }, [socket, id, hasProfile, connected, profileStatus, spectate]);

  // Graceful refresh: DO NOT emit room:leave on refresh/unmount — rely on
  // Workers DO grace (ROOM_GRACE_MS 10s) + UserRegistry 5m to keep slot.
  // Intentional Leave is handled by handleLeave() which sets leavingRef.
  // Beforeunload is left empty to avoid immediate close on host refresh.
  useEffect(() => {
    // No-op: keep player in room for grace period on refresh/close.
    // Leaving is explicit via handleLeave().
    return () => {};
  }, []);

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

  if (inactivePopup) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-[#070b14]/80 backdrop-blur-md">
        <div className="w-full max-w-[380px] rounded-[24px] bg-[#142a3d] border border-white/10 p-6 text-center shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mx-auto text-xl">⏰</div>
          <h2 className="font-extrabold text-white text-lg mt-3">Room closed</h2>
          <p className="text-sm text-white/60 mt-1">Room auto closed due to inactivity</p>
          <button onClick={() => { setInactivePopup(false); navigate("/"); }} className="mt-5 w-full py-3 rounded-full bg-[#f3ecd8] hover:bg-white text-[#0e2533] font-extrabold">Back to games</button>
        </div>
      </div>
    );
  }

  if (kickedPopup) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-[#070b14]/80 backdrop-blur-md">
        <div className="w-full max-w-[380px] rounded-[24px] bg-[#142a3d] border border-white/10 p-6 text-center shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center mx-auto text-xl">✕</div>
          <h2 className="font-extrabold text-white text-lg mt-3">You were removed</h2>
          <p className="text-sm text-white/60 mt-1">You’re no longer in this game.</p>
          <button onClick={() => { setKickedPopup(false); navigate("/"); }} className="mt-5 w-full py-3 rounded-full bg-[#f3ecd8] hover:bg-white text-[#0e2533] font-extrabold">Back to games</button>
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
          <p className="text-xs text-white/50 mt-2">{isTransient ? "Trying again - tap Retry if needed." : "Double-check the code and try again."}</p>
          <div className="mt-4 flex gap-2 justify-center">
            {isTransient && <button onClick={() => { setError(null); socket?._luckyAttemptJoin?.(); if (!room) socket?.emit("room:sync", { roomId: id }, (r)=>{ if(r?.ok) setRoom(r.room); }); }} className="px-5 py-2 rounded-full bg-amber-400 text-[#0e2533] font-bold">Try again</button>}
            <button onClick={() => navigate("/")} className="px-5 py-2 rounded-full bg-white text-[#0e2533] font-bold">Back to games</button>
          </div>
          <a href="/admin" className="hidden">Admin</a>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="max-w-[520px] mx-auto px-4 py-16 text-center">
        <div className="w-10 h-10 border-2 border-white/20 border-t-amber-400 rounded-full animate-spin mx-auto"></div>
        <p className="text-sm text-white/50 mt-3">Joining {id}…</p>
      </div>
    );
  }

  const myId = socket?.id;
  const isHost = !!(myId && room.hostId === myId);
  const isSpectator = !!(myId && room.spectators?.some(s => s.id === myId));
  const isPlayer = !!(myId && room.players.some(p => p.id === myId));
  const game = games.find(g => g.id === room.game) || { label: room.game, optionSchema: [] };
  const isQuestGame = room.game === "good-vs-evil";
  const isTriviaGame = room.game === "trivia";
  const hasGameState = !!room.hasGame;
  const hasActiveGame = !!(room.hasGame && room.gameState && room.gameState.phase && room.gameState.phase !== "LOBBY" && room.gameState.phase !== "GAME_OVER") || !!(room.hasGame && room.gamePhase && room.gamePhase !== "LOBBY" && room.gamePhase !== "GAME_OVER");
  const isGameLocked = hasGameState; // lobby locked while any game exists (including GAME_OVER until reset)
  const totalPlayers = room.players.length + room.bots.length;
  const canStart = !!room.canStart;
  const supportsBots = room.supportsBots !== false;

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2500); }

  function handleStartQuest() {
    if (!isHost) return;
    if (!canStart) {
      showToast(`Need ${room.minPlayers} players - have ${totalPlayers}. Add bots.`);
      return;
    }
    socket.emit("game:start", { roomId: id }, (res) => {
      if (!res?.ok) showToast(res?.error || "Start failed");
      else showToast(isTriviaGame ? "Trivia started!" : "Quest started - roles dealt");
    });
  }
  function handleStartGame() { return handleStartQuest(); }

  function handleResetQuest() {
    socket.emit("game:reset", { roomId: id }, (res) => {
      if (!res?.ok) showToast(res?.error || "Reset failed");
      else showToast("Game reset - back to lobby");
    });
  }

  function handleSpectate() {
    if (isPlayer && room.players.length === 1) { showToast("Cannot spectate as only player - room would close"); return; }
    socket.emit("room:spectate", { roomId: id }, (res) => {
      if (!res?.ok) showToast(res.error || "Spectate failed");
      else {
        showToast(isPlayer ? "Switched to spectator" : "Spectating");
        if (spectate) navigate(`/room/${id}`, { replace: true });
      }
    });
  }
  function handleJoinAsPlayer() {
    socket.emit("spectator:join", { roomId: id }, (res) => {
      if (!res?.ok) showToast(res.error || "Join failed");
      else {
        showToast("Joined as player");
        if (spectate) navigate(`/room/${id}`, { replace: true });
      }
    });
  }

  function handleChangeGame(e) {
    const newGame = e.target.value;
    const targetGame = games.find(g=>g.id===newGame);
    socket.emit("lobby:updateGame", { roomId: id, gameId: newGame }, (res) => {
      if (!res?.ok) showToast(res.error);
      else {
        showToast(`Game set to ${res.room.gameLabel}`);
        if (targetGame && targetGame.supportsBots===false && room.bots.length>0) {
          showToast("Bots removed - this game doesn't support bots");
        }
      }
    });
  }
  function handleOptionChange(key, value) {
    socket.emit("lobby:updateOptions", { roomId: id, options: { [key]: value } }, (res) => {
      if (!res?.ok) showToast(res.error);
    });
  }
  function handleAddBot() {
    if (!supportsBots) { showToast("This game doesn't support bots"); return; }
    if (hasActiveGame) { showToast("Cannot add bots while game in progress"); return; }
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
    <div className="max-w-[820px] mx-auto px-4 pb-10">
      {/* Header: Leave + title + End Game + ? rules */}
      <div className="flex items-center justify-between pt-2">
        <button onClick={handleLeave} aria-label="Leave room" className="px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-bold text-white/70 flex items-center gap-1.5">
          <span className="text-sm leading-none">←</span> Leave
        </button>
        <div className="text-center flex-1">
          <h1 className="font-display font-extrabold text-[18px] tracking-wide text-[#f3ecd8]">Lucky Street</h1>
          <p className="text-xs text-white/50 -mt-1">Room <span className="font-mono font-bold text-white">{room.id}</span> • Host: {room.hostName}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasGameState && (
            <button onClick={handleResetQuest} aria-label="End current game and return to lobby" className="px-3 py-1.5 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-200 text-xs font-bold">End Game</button>
          )}
          <button onClick={()=>setShowRules(true)} aria-label="Rules" className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white font-bold text-sm">?</button>
        </div>
      </div>

      {/* Mobile toggle - hide when in-game (single column) */}
      {!hasGameState && (
        <div className="mt-4 flex justify-center lg:hidden">
          <div className="inline-flex rounded-full bg-white/5 border border-white/10 p-1">
            <button onClick={() => setMobileTab("board")} className={`px-4 py-1.5 rounded-full text-xs font-bold ${mobileTab === "board" ? "bg-[#f3ecd8] text-[#0e2533]" : "text-white/60"}`}>Board</button>
            <button onClick={() => setMobileTab("controls")} className={`px-4 py-1.5 rounded-full text-xs font-bold ${mobileTab === "controls" ? "bg-[#f3ecd8] text-[#0e2533]" : "text-white/60"}`}>My Controls</button>
          </div>
        </div>
      )}

      {hasGameState && isQuestGame && room.gameState && (
        <div className="mt-4 rounded-[24px] bg-[#0f2231] border border-white/10 shadow-xl p-6 text-center">
          <div className="flex items-center justify-center">
            <span className="text-xs tracking-widest font-bold text-[#7ec8e6]">QUEST {Math.min(room.gameState.currentQuest+1,5)} / 5</span>
          </div>
          <div className="mt-4 flex justify-between gap-2">
            {room.gameState.quests.map((q,i)=>{
              const isCurrent = i===room.gameState.currentQuest && room.gameState.phase!=='GAME_OVER';
              const bg = q.status==='SUCCESS' ? 'bg-emerald-500 border-emerald-400 text-black' : q.status==='FAIL' ? 'bg-rose-500 border-rose-400 text-white' : isCurrent ? 'bg-white/15 border-white/30 text-white ring-2 ring-amber-300/60' : 'bg-white/5 border-white/10 text-white/40';
              const needsTwo = q.failsRequired>1;
              return (
                <div key={i} className={`flex-1 h-[68px] rounded-xl border flex flex-col items-center justify-center ${bg} relative`}>
                  <span className="text-[10px] font-bold tracking-widest opacity-60">Q{i+1}</span>
                  <span className="text-lg font-black leading-none">{q.size}</span>
                  {needsTwo && <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full bg-amber-400 text-[#0e2533] text-[9px] font-black leading-none shadow">2 fails</span>}
                  <span className="text-[9px] font-bold mt-0.5 leading-none h-[12px]">{q.status==='PENDING' ? (needsTwo ? 'needs 2' : '') : q.status==='SUCCESS' ? '✓' : '✕'}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-5">
            <p className="text-xs tracking-widest font-bold text-white/50">REJECTED</p>
            <div className="mt-2 flex justify-center gap-2">
              {Array.from({length:5}).map((_,i)=>(
                <div key={i} className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-black ${i < room.gameState.proposalTracker ? 'bg-rose-500 border-rose-400 text-white' : 'bg-white/10 border-white/15 text-white/30'}`}>{i < room.gameState.proposalTracker ? '✕' : ''}</div>
              ))}
              <span className="ml-3 text-base font-bold text-white/60 self-center">{room.gameState.proposalTracker} / 5</span>
            </div>
              <p className="text-[11px] text-white/30 mt-2">5 rejects = Evil wins • Good 3 → Assassin guesses Merlin {room.gameState.quests[3]?.failsRequired>1 ? '• Q4 needs 2 fails (7+ players)' : ''}</p>
          </div>
        </div>
      )}

      {/* Split view */}
      <div className={`mt-4 ${hasGameState ? 'flex justify-center' : 'grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-5'}`}>
        {/* Board - public, visible on TV (hidden during game) */}
        <div className={`${hasGameState ? 'hidden' : mobileTab === "controls" ? "hidden lg:block" : "block"} space-y-4`}>
          {!hasGameState && (
            <div className="rounded-[24px] bg-[#29546c] border border-white/10 shadow-xl p-6 text-center relative overflow-hidden">
              <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ background: "radial-gradient(ellipse at top, rgba(255,255,255,0.15), transparent 60%)" }}></div>
              <div className="relative">
                <p className="text-xs tracking-widest font-bold text-white/50">JOIN CODE</p>
                <div className="font-display font-black text-[36px] tracking-[0.18em] text-[#f3ecd8]" style={{ textShadow: "0 2px 0 rgba(0,0,0,0.25)" }}>{room.id}</div>
              <p className="text-xs text-white/70 mt-1">Share: <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded whitespace-nowrap">{window.location.origin}/room/{room.id}</span></p>
              <p className="text-xs text-white/40 mt-1">Everyone look here!</p>
              <div className="mt-3 flex justify-center gap-2 flex-wrap">
                <button onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/room/${room.id}`); showToast("Link copied!"); }} className="px-4 py-2 rounded-full bg-[#f3ecd8] hover:bg-white text-[#0e2533] text-xs font-extrabold">Copy link</button>
                <span className="px-3 py-2 rounded-full bg-white/10 border border-white/10 text-xs font-bold text-white/70">{room.slotsText}</span>
              </div>
              </div>
            </div>
          )}

      {!hasGameState && (
        <>
      <div className="mt-6">
        <h3 className="font-extrabold text-white text-sm">Who’s here</h3>
        <p className="text-xs text-white/40">Change your name and picture from the main screen.</p>
        <div className="mt-3 flex flex-wrap gap-4">
          {room.players.map(p => {
            const isMe = p.id === myId;
            const isHostPlayer = p.isHost || p.id === room.hostId;
            const avatarIsImage = p.avatar && typeof p.avatar === "string" && p.avatar.startsWith("data:");
            const avatarBg = avatarIsImage ? null : (p.avatar || "#475569");
            // Name/avatar editing disabled in room - only host actions on others
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
      <div className="mt-4 rounded-2xl bg-white/[0.04] border border-white/10 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white/60">Watching • {room.spectatorCount || 0}</span>
          <div className="flex gap-2">
            {isPlayer && <button disabled={room.players.length === 1} onClick={handleSpectate} title={room.players.length === 1 ? "You’re the only one here" : ""} className={`px-3 py-1 rounded-full text-xs ${room.players.length === 1 ? "bg-white/5 text-white/30 cursor-not-allowed" : "bg-white/10 hover:bg-white/15 text-white"}`}>Watch</button>}
            {isSpectator && <button onClick={handleJoinAsPlayer} className="px-3 py-1 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold">Join to play</button>}
            {!isPlayer && !isSpectator && <><button onClick={handleSpectate} className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs">Watch</button><button onClick={handleJoinAsPlayer} className="px-3 py-1 rounded-full bg-[#f3ecd8] hover:bg-white text-[#0e2533] text-xs font-bold">Join</button></>}
          </div>
        </div>
        {isSpectator && <p className="text-xs text-amber-300 mt-1">You’re watching - tap Join to play</p>}
        {room.spectators?.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{room.spectators.map(s=> <span key={s.id} className="px-2 py-1 rounded-full bg-white/10 border border-white/10 text-white text-xs">{s.name}</span>)}</div>}
        {!isPlayer && !isSpectator && <p className="text-xs text-white/40 mt-1">Watch or join the game</p>}
      </div>
        </>
      )}
        </div>
        {/* Controls */}
        <div className={`${hasGameState ? 'block w-full max-w-[820px]' : mobileTab === "board" ? "hidden lg:block" : "block"} space-y-5`}>

          {(isQuestGame || isTriviaGame) && hasGameState ? (
            <>
              {isQuestGame && <QuestGame roomId={id} isHost={isHost} isSpectator={isSpectator} hideTopAllegiance />}
              {isTriviaGame && <TriviaGame roomId={id} isHost={isHost} isSpectator={isSpectator} />}
              <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-3">
                <div className="flex items-center justify-center">
                  <span className="text-xs font-bold text-white/60">Watching • {room.spectatorCount || 0}</span>
                </div>
                {room.spectators?.length>0 && <div className="mt-2 flex flex-wrap gap-2 justify-center">{room.spectators.map(s=> <span key={s.id} className="px-2 py-1 rounded-full bg-white/10 border border-white/10 text-white text-xs">{s.name}</span>)}</div>}
              </div>
            </>
          ) : (
            <>
              {isQuestGame && (
                <div className="rounded-2xl bg-[#0f2231]/80 border border-white/10 p-4">
                  <h4 className="font-bold text-white text-sm">Good vs Evil</h4>
                  <p className="text-xs text-white/40 mt-1">{totalPlayers} / {room.maxPlayers} - need {room.minPlayers} to start</p>
                  {isHost ? (
                    <>
                      <button onClick={handleStartQuest} disabled={!canStart} className={`mt-3 w-full py-3 rounded-full font-extrabold ${canStart ? "bg-[#f3ecd8] hover:bg-white text-[#0e2533]" : "bg-white/10 text-white/30 cursor-not-allowed"}`}>
                        {canStart ? "▶ Start Quest" : `Need ${room.minPlayers} players (have ${totalPlayers})`}
                      </button>
                      {!canStart && supportsBots && <p className="text-xs text-white/30 mt-2">Add bots or wait for players to reach {room.minPlayers}.</p>}
                    </>
                  ) : (
                    <p className="text-xs text-white/40 mt-3">{canStart ? "Ready to start!" : `Need ${room.minPlayers - totalPlayers} more to start`}</p>
                  )}
                </div>
              )}
              {isTriviaGame && (
                <div className="rounded-2xl bg-gradient-to-br from-violet-600/20 to-amber-500/20 border border-white/10 p-4">
                  <h4 className="font-bold text-white text-sm flex items-center gap-2">Trivia</h4>
                  <p className="text-xs text-white/60 mt-1">{totalPlayers}/{room.maxPlayers} • {room.gameOptions.questionCount} Q • {room.gameOptions.timerSeconds===0 ? "No limit" : `${room.gameOptions.timerSeconds}s`} • {room.gameOptions.questionType}</p>
                  {isHost ? (
                    <>
                      <button onClick={handleStartGame} disabled={!canStart} className={`mt-3 w-full py-3 rounded-full font-extrabold ${canStart ? "bg-amber-400 hover:bg-amber-300 text-[#0e2533]" : "bg-white/10 text-white/30 cursor-not-allowed"}`}>
                        {canStart ? "▶ Start Trivia" : `Need ${room.minPlayers} players (have ${totalPlayers})`}
                      </button>
                      {!canStart && <p className="text-xs text-white/40 mt-2">Need {room.minPlayers} player{room.minPlayers>1?"s":""} to start.</p>}
                    </>
                  ) : (
                    <p className="text-xs text-white/40 mt-3">{canStart ? "Ready to start!" : `Need ${room.minPlayers - totalPlayers} more to start`}</p>
                  )}
                </div>
              )}

              {isHost ? (
                <div className={`rounded-2xl border p-4 ${supportsBots ? "bg-[#0f2231]/80 border-white/10" : "bg-white/5 border-white/10 opacity-60"}`}>
                  <h4 className="font-bold text-white text-sm">Add Bots</h4>
                  {!supportsBots ? (
                    <p className="text-xs text-amber-300 mt-2">Bots not supported for {game.label}. Switch to Good vs Evil to use bots, or play with humans only.</p>
                  ) : totalPlayers >= room.maxPlayers ? (
                    <p className="text-xs text-amber-300 mt-2">Room full ({totalPlayers}/{room.maxPlayers}) - remove a player/bot to add more.</p>
                  ) : (
                    <>
                      <div className="mt-2 flex gap-2 items-center">
                        <input value={botName} onChange={e => setBotName(e.target.value)} placeholder="Leave empty for random name" maxLength={20} className="flex-1 px-3 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 text-sm outline-none" />
                        <button onClick={handleAddBot} className="px-4 py-2.5 rounded-xl bg-[#f3ecd8] hover:bg-white text-[#0e2533] text-sm font-bold">Add</button>
                      </div>
                      <p className="text-xs text-white/30 mt-1">{totalPlayers} / {room.maxPlayers} players - bots take a spot and look the same.</p>
                    </>
                  )}
                </div>
              ) : null}

              <div className={`mt-5 rounded-2xl border p-4 ${isGameLocked ? "bg-white/5 border-white/10 opacity-60" : "bg-[#0f2231]/80 border-white/10"}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-extrabold text-white text-sm">Game</span>
                  {isHost ? (
                    <select value={room.game} onChange={handleChangeGame} disabled={isGameLocked} className={`px-3 py-1.5 rounded-full border text-xs font-bold ${isGameLocked ? "bg-white/5 border-white/10 text-white/30 cursor-not-allowed" : "bg-white/10 border-white/15 text-white"}`}>
                      {games.map(g => <option key={g.id} value={g.id} className="bg-[#0f2231]">{g.label}{g.supportsBots===false ? " (no bots)" : " (bots)"}</option>)}
                    </select>
                  ) : (
                    <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-white text-xs font-bold">{game.label}</span>
                  )}
                </div>
                <p className="text-xs text-white/40 mt-1">{games.find(g=>g.id===room.game)?.description || ""} {isGameLocked && <span className="text-amber-300">• Lobby locked during game</span>}</p>
                {isQuestGame && (()=>{ const displayPlayers = Math.max(totalPlayers, 5); const displayMax = displayPlayers<=6?1:displayPlayers<=8?2:3; return (
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-white/40">{['morgana','mordred','oberon'].filter(k=> !!room.gameOptions[k]).length}/{displayMax} evil extras for {displayPlayers}p</span>
                    <span className="text-[11px] text-amber-200/70" title="Merlin (Good, sees Evil) and Assassin (Evil, hunts Merlin) are always included">Merlin+Assassin always</span>
                  </div>
                );})()}
                <div className="mt-3 grid gap-3">
                  {(game.optionSchema || []).map(opt => {
                    const displayPlayersOpt = Math.max(totalPlayers, 5);
                    const isEvilExtra = isQuestGame && ['morgana','mordred','oberon'].includes(opt.key);
                    const maxEvil = displayPlayersOpt<=6?1:displayPlayersOpt<=8?2:3;
                    const enabledEvil = ['morgana','mordred','oberon'].filter(k=> !!room.gameOptions[k]).length;
                    const wouldExceed = isEvilExtra && !room.gameOptions[opt.key] && enabledEvil >= maxEvil;
                    const disabled = isGameLocked || wouldExceed;
                    return (
                    <div key={opt.key} className="flex items-center gap-3">
                      <label className="text-xs font-bold text-white/60 w-32 flex items-center gap-2">
                        <span>{opt.label}</span>
                        {opt.side && <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black tracking-wide border ${opt.side==="GOOD" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-rose-500/20 text-rose-300 border-rose-500/30"}`}>{opt.side}</span>}
                        {wouldExceed && <span className="text-[10px] text-amber-300">MAX</span>}
                      </label>
                      {opt.type === "toggle" ? (
                        isHost ? (
                          <button disabled={disabled} onClick={() => handleOptionChange(opt.key, !room.gameOptions[opt.key])} title={wouldExceed ? `Max ${maxEvil} evil extras for ${Math.max(totalPlayers,5)} players` : opt.side ? `${opt.side} team` : ""} className={`relative w-12 h-6 rounded-full transition-colors ${disabled ? "opacity-40 cursor-not-allowed" : ""} ${room.gameOptions[opt.key] ? (opt.side==="GOOD" ? "bg-emerald-500" : opt.side==="EVIL" ? "bg-rose-500" : "bg-emerald-500") : "bg-white/15"}`}>
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${room.gameOptions[opt.key] ? "translate-x-6" : ""}`} />
                          </button>
                        ) : (
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${room.gameOptions[opt.key] ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/40"}`}>{room.gameOptions[opt.key] ? "On" : "Off"}</span>
                        )
                      ) : opt.type === "slider" ? (
                        isHost ? (
                          <div className="flex-1 flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <input type="range" min={opt.min} max={opt.max} step={opt.step} value={room.gameOptions[opt.key]} onChange={e => handleOptionChange(opt.key, Number(e.target.value))} disabled={isGameLocked} className={`flex-1 accent-amber-400 ${isGameLocked ? "opacity-40" : ""}`} />
                              <span className="text-xs font-bold text-white w-16 text-right">{opt.key==="timerSeconds" && room.gameOptions[opt.key]===0 ? "No limit" : `${room.gameOptions[opt.key]}${opt.key==="timerSeconds" ? "s" : opt.unit || ""}`}</span>
                            </div>
                            {opt.key==="timerSeconds" && <span className="text-[10px] text-white/30 ml-1">← No timer (unlimited) • 60s max</span>}
                            {opt.key==="questionCount" && <span className="text-[10px] text-white/30 ml-1">5 to 50, steps of 5</span>}
                          </div>
                        ) : (
                          <span className="text-sm font-bold text-white">{opt.key==="timerSeconds" && room.gameOptions[opt.key]===0 ? "No limit" : `${room.gameOptions[opt.key]}${opt.key==="timerSeconds" ? "s" : opt.unit || ""}`}</span>
                        )
                      ) : opt.type === "select" ? (
                        isTriviaGame && opt.key === "category" ? (
                          isHost ? (
                            <div className="flex-1 flex flex-col gap-2">
                              <div className="relative">
                                <input value={triviaCatSearch} onChange={e=>setTriviaCatSearch(e.target.value)} placeholder="Search categories…" disabled={isGameLocked} className="w-full pl-8 pr-3 py-2 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 text-xs outline-none disabled:opacity-40" />
                                <span className="absolute left-2.5 top-2.5 text-white/40 text-xs">⌕</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[220px] overflow-auto pr-1 p-1 border border-white/5 rounded-xl bg-white/[0.02]">
                                {opt.options.filter(o=> o.toLowerCase().includes(triviaCatSearch.toLowerCase())).map(o=>{
                                  const isSel = room.gameOptions[opt.key]===o;
                                  return (
                                    <button key={o} onClick={()=>handleOptionChange(opt.key, o)} disabled={isGameLocked} className={`text-left px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${isSel?"bg-amber-400 border-amber-300 text-[#0e2533]":"bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/15"} ${isGameLocked?"opacity-40 cursor-not-allowed":""}`}>
                                      {o}
                                    </button>
                                  );
                                })}
                              </div>
                              <span className="text-xs text-white/30">Selected: <span className="text-white font-bold">{room.gameOptions[opt.key]}</span></span>
                            </div>
                          ) : (
                            <span className="text-sm font-bold text-white">{room.gameOptions[opt.key]}</span>
                          )
                        ) : isHost ? (
                          <select value={room.gameOptions[opt.key]} onChange={e => handleOptionChange(opt.key, e.target.value)} disabled={isGameLocked} className={`flex-1 px-3 py-2 rounded-xl border text-xs ${isGameLocked ? "bg-white/5 border-white/10 text-white/30" : "bg-white/10 border-white/15 text-white"}`}>
                            {opt.options.map(o => <option key={o} value={o} className="bg-[#0f2231]">{o}</option>)}
                          </select>
                        ) : (
                          <span className="text-sm font-bold text-white capitalize">{room.gameOptions[opt.key]}</span>
                        )
                      ) : null}
                    </div>
                    );
                  })}
                </div>
                {isQuestGame && (()=>{ const previewN=Math.max(totalPlayers,5); const opts=room.gameOptions||{}; const maxEvilPreview=previewN<=6?1:previewN<=8?2:3; const e=['morgana','mordred','oberon'].filter(k=> !!opts[k]).slice(0,maxEvilPreview); const hasPercival=!!opts.percival; const base={5:{loyal:2,minion:1},6:{loyal:3,minion:1},7:{loyal:3,minion:2},8:{loyal:4,minion:2},9:{loyal:5,minion:2},10:{loyal:5,minion:3}}[previewN]||{loyal:2,minion:1}; let loyal=base.loyal-(hasPercival?1:0); let minion=base.minion-e.length; loyal=Math.max(0,loyal); minion=Math.max(0,minion); return (<div className="mt-4 rounded-xl bg-white/[0.04] border border-white/10 p-3"><p className="text-[10px] tracking-widest font-bold text-white/40">ROLES IN THIS GAME {previewN!==totalPlayers?`(preview at ${previewN}p)`: `• ${previewN}p`}</p><div className="mt-2 grid grid-cols-2 gap-3"><div className="text-center"><p className="text-[10px] font-bold tracking-widest text-emerald-300">GOOD - {1 + (hasPercival?1:0) + loyal}</p><div className="mt-1.5 flex flex-wrap gap-1.5 justify-center"><span className="px-2 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-[10px] font-bold text-emerald-200">Merlin</span>{hasPercival&&<span className="px-2 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-[10px] font-bold text-emerald-200">Percival</span>}{loyal>0&&<span className="px-2 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-[10px] font-bold text-emerald-200">Loyal ×{loyal}</span>}</div></div><div className="text-center"><p className="text-[10px] font-bold tracking-widest text-rose-300">EVIL - {1 + e.length + minion}</p><div className="mt-1.5 flex flex-wrap gap-1.5 justify-center"><span className="px-2 py-1 rounded-full bg-rose-500/20 border border-rose-500/30 text-[10px] font-bold text-rose-200">Assassin</span>{e.includes('morgana')&&<span className="px-2 py-1 rounded-full bg-rose-500/20 border border-rose-500/30 text-[10px] font-bold text-rose-200">Morgana</span>}{e.includes('mordred')&&<span className="px-2 py-1 rounded-full bg-rose-500/20 border border-rose-500/30 text-[10px] font-bold text-rose-200">Mordred</span>}{e.includes('oberon')&&<span className="px-2 py-1 rounded-full bg-rose-500/20 border border-rose-500/30 text-[10px] font-bold text-rose-200">Oberon</span>}{minion>0&&<span className="px-2 py-1 rounded-full bg-rose-500/20 border border-rose-500/30 text-[10px] font-bold text-rose-200">Minion ×{minion}</span>}</div></div></div></div>);})()}
                {isGameLocked ? <p className="text-xs text-white/30 mt-3">Reset game to change settings.</p> : !isHost ? <p className="text-xs text-white/30 mt-3">Only the host can change these settings.</p> : null}
              </div>
            </>
          )}
        </div>
      </div>

      {hostActionTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#070b14]/60 backdrop-blur-sm" onClick={() => setHostActionTarget(null)}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-[320px] rounded-2xl bg-[#142a3d] border border-white/10 p-5 text-center shadow-2xl">
            <p className="text-sm text-white/60">What to do with</p>
            <p className="font-extrabold text-white text-lg">{hostActionTarget.name}</p>
            <div className="mt-4 grid gap-2">
              <button onClick={() => handleTransferHost(hostActionTarget.id, hostActionTarget.name)} className="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#0e2533] font-extrabold flex items-center justify-center gap-2">👑 Make host</button>
              <button onClick={() => { handleKick(hostActionTarget.id, hostActionTarget.name); setHostActionTarget(null); }} className="w-full py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold">Remove</button>
              <button onClick={() => setHostActionTarget(null)} className="w-full py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold">Close</button>
            </div>
          </div>
        </div>
      )}

      {botConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#070b14]/60 backdrop-blur-sm" onClick={() => setBotConfirm(null)}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-[320px] rounded-2xl bg-[#142a3d] border border-white/10 p-5 text-center shadow-2xl">
            <p className="text-sm text-white/60">Remove</p>
            <p className="font-extrabold text-white text-lg">{botConfirm.name} 🤖</p>
            <div className="mt-4 grid gap-2">
              <button onClick={() => handleRemoveBot(botConfirm.id, botConfirm.name)} className="w-full py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold">Remove</button>
              <button onClick={() => setBotConfirm(null)} className="w-full py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold">Close</button>
            </div>
          </div>
        </div>
      )}


      {toast && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[#1f2937] text-white text-sm font-bold px-4 py-2.5 rounded-full shadow-xl border border-white/10">{toast}</div>}

      {showRules && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={()=>setShowRules(false)}>
          <div onClick={e=>e.stopPropagation()} className="w-full max-w-[480px] rounded-2xl bg-[#0f2231] border border-white/10 p-6 max-h-[80vh] overflow-auto shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white">How to Play - {game.label}</h3>
              <button onClick={()=>setShowRules(false)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center text-white">✕</button>
            </div>
            {isQuestGame ? (
              <div className="mt-4 space-y-4 text-sm leading-relaxed">
                <p className="text-white/80"><span className="text-white font-bold">How to win:</span> Good wins by completing 3 quests. Evil wins by failing 3 quests, blocking teams 5 times, or having the Assassin find Merlin at the end.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
                    <p className="text-xs font-bold tracking-widest text-emerald-300">GOOD TEAM</p>
                    <p className="text-xs mt-1.5 text-white/70 leading-snug">• Loyal - no power<br/>• Merlin - knows Evil (except Mordred hides)<br/>• Percival - knows Merlin (but Morgana pretends)</p>
                  </div>
                  <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3">
                    <p className="text-xs font-bold tracking-widest text-rose-300">EVIL TEAM</p>
                    <p className="text-xs mt-1.5 text-white/70 leading-snug">• Minion - with Evil<br/>• Assassin - hunts Merlin<br/>• Morgana - pretends to be Merlin<br/>• Mordred - hidden from Merlin<br/>• Oberon - works alone</p>
                  </div>
                </div>
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
                  <p className="text-xs font-bold tracking-widest text-amber-300">ALWAYS IN</p>
                  <p className="text-xs mt-1.5 text-white/70 leading-snug">Merlin (Good) and Assassin (Evil) are always included — you can't turn them off. Merlin sees Evil (except Mordred hides). If Good reaches 3 quests, Assassin gets one guess to find Merlin and steal the win for Evil.</p>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <p className="text-xs font-bold text-white">How a round works</p>
                  <p className="text-xs text-white/60 mt-1.5 leading-snug">1. Leader picks a team → 2. Everyone votes → 3. If most say yes, that team secretly picks Success or Fail. Good must pick Success. One Fail usually fails the quest - the 4th quest needs 2 fails when you have 7+ players.</p>
                </div>
                <p className="text-xs text-white/40">Now: {Math.max(totalPlayers,5)} players • {['morgana','mordred','oberon'].filter(k=> !!room.gameOptions[k]).length}/{Math.max(totalPlayers,5)<=6?1:Math.max(totalPlayers,5)<=8?2:3} extra Evil • Merlin + Assassin always in</p>
              </div>
            ) : isTriviaGame ? (
              <div className="mt-4 space-y-4 text-sm leading-relaxed">
                <p className="text-white/80"><span className="text-white font-bold">How to play:</span> The host starts. Everyone gets the same question with 4 choices A–D. Tap your answer before the timer runs out — if everyone answers early, it reveals early.</p>
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
                  <p className="text-xs font-bold tracking-widest text-amber-300">SCORING</p>
                  <p className="text-xs mt-1.5 text-white/70 leading-snug">1 point for a correct answer, 0 for wrong or missed. The high score at the end wins — ties share the win. Check <span className="text-white font-bold">Live scores</span> during questions and the full breakdown after each reveal.</p>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <p className="text-xs font-bold text-white">Options — set by host in lobby</p>
                  <p className="text-xs text-white/60 mt-1.5 leading-snug">Questions (5–50 step 5), Timer (No limit – 60s step 5, leftmost is unlimited), Type (Random / Multiple / True-False). Defaults are 10 Q • 20s • Random. Change them before starting.</p>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <p className="text-xs font-bold text-white">Tips</p>
                  <p className="text-xs text-white/60 mt-1.5 leading-snug">• Teams can share one device. • Spectators tap “Watch” and can join with “Join to play” when lobby is open. • After the answer is shown, everyone taps <span className="text-white font-bold">Continue</span> to go to the next question. • Need 1–12 players, no bots — share your invite link!</p>
                </div>
                <p className="text-xs text-white/40">Host can start when 1+ players are ready. Good luck!</p>
              </div>
            ) : (
              <div className="mt-4 space-y-3 text-sm text-white/60">
                <p>{game.description}</p>
                <p>Players: {game.minPlayers}-{game.maxPlayers} {supportsBots ? "(bots supported)" : "(no bots)"} • Default max {game.defaultMaxPlayers}</p>
                {game.optionSchema?.length>0 && (
                  <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                    <p className="text-xs font-bold text-white/50">Options</p>
                    <ul className="mt-1 space-y-1 text-xs">
                      {game.optionSchema.map(o=> <li key={o.key}>• <span className="text-white font-bold">{o.label}</span> - {o.type}</li>)}
                    </ul>
                  </div>
                )}
                <p className="text-xs text-white/40">Host can start when {game.minPlayers}+ players ready. Rules are specific to this game.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
