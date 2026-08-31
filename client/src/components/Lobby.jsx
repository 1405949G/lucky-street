/**
 * Lobby - Host can change game/options, add bots (generic names), transfer host, kick via popup
 * Name/avatar locked inside room (change only at main menu / direct-link IdentityModal).
 * Single Leave button (removed duplicate back arrow) - guarantees room:leave before navigate
 */

import React, { useContext, useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ProfileContext } from "../context/ProfileContext.jsx";
import { SocketContext } from "../context/SocketContext.jsx";
import IdentityModal from "./IdentityModal.jsx";
import QuestGame from "../../../games/veil-street/client/Game.jsx";

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
  const [mobileTab, setMobileTab] = useState("board"); // board | controls - for phone split-view like Kahoot
  const [showRules, setShowRules] = useState(false);
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
      socket.off("room:error", onRoomErr);
      socket.off("connect", onReconnect);
      socket.off("connected", onReconnect);
    };
  }, [socket, id, hasProfile, connected, profileStatus, spectate]);

  // If user hits browser back / component unmounts while still in room, try to leave
  // (prevents 30s grace keeping ghost player). Intentional Leave also calls handleLeave.
  useEffect(() => {
    const onBeforeUnload = () => {
      try { socket?.emit("room:leave", { roomId: id }); } catch {}
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (leavingRef.current) return;
      if (!socket || !id) return;
      try {
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
  const isQuestGame = room.game === "veil-street";
  const hasGameState = !!room.hasGame;
  const hasActiveGame = !!(room.hasGame && room.gameState && room.gameState.phase && room.gameState.phase !== "LOBBY" && room.gameState.phase !== "GAME_OVER") || !!(room.hasGame && room.gamePhase && room.gamePhase !== "LOBBY" && room.gamePhase !== "GAME_OVER");
  const isGameLocked = hasGameState; // lobby locked while any quest exists (including GAME_OVER until reset)
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
      else showToast("Quest started - roles dealt");
    });
  }

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
    <div className="max-w-[860px] mx-auto px-4 pb-10">
      {/* Header: lantern street nav */}
      <div className="flex items-center justify-between pt-3">
        <button onClick={handleLeave} aria-label="Leave room" className="group px-4 py-2 rounded-full bg-white/[0.07] hover:bg-white/[0.11] border border-white/10 text-xs font-bold text-white/70 flex items-center gap-1.5 backdrop-blur transition-colors">
          <span className="w-5 h-5 rounded-full bg-white/10 group-hover:bg-white/15 flex items-center justify-center text-[11px] leading-none">←</span> Leave
        </button>
        <div className="text-center flex-1 px-3">
          <div className="inline-flex items-center gap-2">
            <span className="hidden sm:flex w-7 h-7 rounded-xl bg-[#c9734b]/12 border border-[#c9734b]/18 items-center justify-center text-xs">🎲</span>
            <h1 className="font-display font-[900] text-[18px] tracking-[0.14em] text-white">LUCKY STREET</h1>
            <span className="hidden sm:flex w-7 h-7 rounded-xl bg-[#8aa899]/12 border border-[#8aa899]/18 items-center justify-center text-xs">🃏</span>
          </div>
          <p className="text-xs text-white/55 -mt-0.5 flex items-center justify-center gap-1.5 flex-wrap">
            <span className="font-mono font-black tracking-[0.14em] text-[#f3ecd8]">{room.id}</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span>Host <span className="font-bold text-white/85">{room.hostName}</span></span>
            <span className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-black tracking-widest ${hasActiveGame ? 'bg-[#c9734b]/12 border-[#c9734b]/18 text-[#f3ecd8]' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'}`}>{hasActiveGame ? 'IN PROGRESS' : 'OPEN'}</span>
          </p>
        </div>
        <button onClick={()=>setShowRules(true)} aria-label="Rules" className="w-9 h-9 rounded-full bg-gradient-to-br from-white/[0.08] to-white/[0.04] hover:from-white/[0.13] hover:to-white/[0.06] border border-white/10 flex items-center justify-center text-[#f3ecd8] font-black text-sm shadow-md backdrop-blur">?</button>
      </div>

      {/* Mobile toggle */}
      {!hasGameState && (
        <div className="mt-4 flex justify-center lg:hidden">
          <div className="inline-flex rounded-full bg-white/[0.06] border border-white/10 p-1 backdrop-blur">
            <button onClick={() => setMobileTab("board")} className={`px-5 py-1.5 rounded-full text-xs font-black tracking-wide ${mobileTab === "board" ? "bg-gradient-to-br from-[#fff8e7] via-[#f3ecd8] to-[#d88a63] text-[#1a1d1f] shadow-cafe" : "text-white/60 hover:text-white/85"}`}>Board</button>
            <button onClick={() => setMobileTab("controls")} className={`px-5 py-1.5 rounded-full text-xs font-black tracking-wide ${mobileTab === "controls" ? "bg-gradient-to-br from-[#fff8e7] via-[#f3ecd8] to-[#d88a63] text-[#1a1d1f] shadow-cafe" : "text-white/60 hover:text-white/85"}`}>Controls</button>
          </div>
        </div>
      )}

      {hasGameState && isQuestGame && room.gameState && (
        <div className="mt-4 rounded-[24px] glass-library p-5 sm:p-6 text-center relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none opacity-[0.10]"><img src="/assets/hero-library.svg" alt="" className="w-full h-full object-cover object-top opacity-[0.22]" /></div>
          <div className="absolute inset-0 pointer-events-none opacity-[0.06]" style={{ background: "radial-gradient(ellipse 560px 180px at 50% 0%, #f59e0b, transparent 72%)" }} />
          <div className="absolute -top-10 -left-10 w-28 h-28 bg-amber-500/10 blur-2xl rounded-full pointer-events-none" />
          <div className="absolute -top-10 -right-10 w-28 h-28 bg-amber-500/10 blur-2xl rounded-full pointer-events-none" />
          <div className="relative">
            <div className="flex items-center justify-center gap-2">
              <span className="w-6 h-[1px] bg-amber-400/30 hidden sm:block" />
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/12 border border-amber-400/20 text-amber-200 text-[11px] font-black tracking-[0.18em]">🏮 QUEST {Math.min(room.gameState.currentQuest+1,5)} / 5 • VEIL STREET</span>
              <span className="w-6 h-[1px] bg-amber-400/30 hidden sm:block" />
            </div>
            <div className="mt-4 flex justify-between gap-2">
              {room.gameState.quests.map((q,i)=>{
                const isCurrent = i===room.gameState.currentQuest && room.gameState.phase!=='GAME_OVER';
                const isSuccess = q.status==='SUCCESS';
                const isFail = q.status==='FAIL';
                const base = isSuccess ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 border-emerald-400/40 text-white shadow-[0_0_18px_rgba(16,185,129,0.35)]' : isFail ? 'bg-gradient-to-br from-rose-500 to-rose-600 border-rose-400/40 text-white shadow-[0_0_18px_rgba(244,63,94,0.32)]' : isCurrent ? 'bg-white/[0.12] border-amber-400/35 text-white ring-2 ring-amber-400/30 shadow-lantern-soft' : 'bg-white/[0.04] border-white/10 text-white/45';
                const needsTwo = q.failsRequired>1;
                return (
                  <div key={i} className={`flex-1 h-[74px] rounded-2xl border flex flex-col items-center justify-center relative backdrop-blur ${base}`}>
                    <span className="text-[10px] font-black tracking-[0.18em] opacity-70">Q{i+1}</span>
                    <span className="text-[20px] font-[900] leading-none mt-0.5">{q.size}</span>
                    {needsTwo && <span className="absolute -top-2 -right-2 px-2 py-1 rounded-full bg-gradient-to-br from-amber-300 to-orange-500 text-[#0e2533] text-[9px] font-black leading-none shadow-md border border-amber-400/30">2</span>}
                    <span className={`text-[10px] font-black mt-1 leading-none h-[12px] ${isSuccess ? 'text-white' : isFail ? 'text-white' : 'text-white/60'}`}>{q.status==='PENDING' ? (needsTwo ? 'needs 2' : '—') : q.status==='SUCCESS' ? '✓ held' : '✕ fell'}</span>
                    {isCurrent && !isSuccess && !isFail && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)] animate-pulse" />}
                  </div>
                );
              })}
            </div>
            <div className="mt-5 rounded-2xl bg-white/[0.04] border border-white/10 p-3.5">
              <p className="text-[10px] tracking-[0.18em] font-black text-white/45">VEIL THICKENS — REJECTED</p>
              <div className="mt-2.5 flex justify-center gap-2.5">
                {Array.from({length:5}).map((_,i)=>(
                  <div key={i} className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-black transition-all ${i < room.gameState.proposalTracker ? 'bg-gradient-to-br from-rose-500 to-rose-600 border-rose-400 text-white shadow-[0_0_12px_rgba(244,63,94,0.35)]' : 'bg-white/[0.06] border-white/15 text-white/25'}`}>{i < room.gameState.proposalTracker ? '✕' : ''}</div>
                ))}
                <span className="ml-2 text-[15px] font-black text-white/60 self-center tracking-wide">{room.gameState.proposalTracker} / 5</span>
              </div>
              <p className="text-[11px] text-white/32 mt-2.5 leading-relaxed">5 rejects → Evil wins • Good needs 3 quests → Assassin hunts Merlin {room.gameState.quests[3]?.failsRequired>1 ? '• Q4 needs 2 fails (7+)' : ''}</p>
            </div>
          </div>
        </div>
      )}

      {/* Split view */}
      <div className={`mt-4 ${hasGameState ? 'flex justify-center' : 'grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-5'}`}>
        {/* Board - public, visible on TV (hidden during game) */}
        <div className={`${hasGameState ? 'hidden' : mobileTab === "controls" ? "hidden lg:block" : "block"} space-y-4`}>
          {!hasGameState && (
            <div className="rounded-[24px] glass-lantern shadow-xl p-0 text-center relative overflow-hidden">
              <div className="absolute inset-0">
                <img src="/assets/hero-cafe.svg" alt="" className="w-full h-full object-cover object-center opacity-[0.38]" />
                <div className="absolute inset-0 bg-gradient-to-b from-[#23272a]/35 via-[#1a1d1f]/62 to-[#121416]/92" />
                <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 420px 180px at 50% 0%, rgba(201,115,75,0.13), transparent 68%)" }} />
              </div>
              <div className="relative p-6 sm:p-7">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#c9734b]/12 border border-[#c9734b]/18 backdrop-blur">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#c9734b] animate-pulse" />
                  <span className="text-[10px] font-black tracking-[0.18em] text-[#f3ecd8]">JOIN CODE</span>
                </div>
                <div className="mt-2 font-display font-[900] text-[38px] sm:text-[42px] tracking-[0.18em] text-[#fff8e7] drop-shadow-[0_2px_18px_rgba(201,115,75,0.22)]" style={{ textShadow: "0 2px 0 rgba(0,0,0,0.35), 0 0 22px rgba(201,115,75,0.20)" }}>{room.id}</div>
                <div className="mt-1 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.08] border border-white/10 backdrop-blur">
                  <span className="text-xs text-white/60">Share</span>
                  <span className="font-mono font-bold text-white text-xs whitespace-nowrap">{window.location.origin}/room/{room.id}</span>
                </div>
                <p className="text-xs text-white/40 mt-2">Everyone look here!</p>
                <div className="mt-4 flex justify-center gap-2.5 flex-wrap">
                  <button onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/room/${room.id}`); showToast("Link copied!"); }} className="px-5 py-2.5 rounded-full bg-gradient-to-br from-[#fff8e7] via-[#f3ecd8] to-[#d88a63] hover:from-white hover:to-[#f3ecd8] text-[#1a1d1f] text-xs font-[900] shadow-cafe border border-[#c9734b]/18">Copy link</button>
                  <span className="px-3.5 py-2.5 rounded-full bg-white/[0.08] border border-white/10 text-xs font-black tracking-wide text-white/80 backdrop-blur">{room.slotsText}</span>
                </div>
              </div>
              <div className="h-[1px] bg-gradient-to-r from-transparent via-[#c9734b]/14 to-transparent" />
              <div className="bg-white/[0.03] px-4 py-2.5 flex items-center justify-center gap-2 text-[11px] text-white/45">
                <span className="w-5 h-5 rounded-full bg-[#c9734b]/12 border border-[#c9734b]/16 flex items-center justify-center text-[10px]">🎲</span>
                Share this code with friends
              </div>
            </div>
          )}

      {!hasGameState && (
        <>
      <div className="mt-6 rounded-[20px] glass-lantern p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-[900] text-white text-sm flex items-center gap-2"><span className="w-7 h-7 rounded-xl bg-amber-400/15 border border-amber-400/20 flex items-center justify-center text-xs">👥</span> Who’s here</h3>
            <p className="text-xs text-white/45 mt-1">Change your name and picture from the main screen.</p>
          </div>
          <span className="hidden sm:inline-flex px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-black tracking-widest text-white/55">{room.players.length + room.bots.length} / {room.maxPlayers}</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-4">
          {room.players.map(p => {
            const isMe = p.id === myId;
            const isHostPlayer = p.isHost || p.id === room.hostId;
            const avatarIsImage = p.avatar && typeof p.avatar === "string" && p.avatar.startsWith("data:");
            const avatarBg = avatarIsImage ? null : (p.avatar || "#475569");
            const canHostAct = isHost && !isMe;
            return (
              <div key={p.id} className="flex flex-col items-center gap-1.5 relative">
                {isHostPlayer && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                    <span className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-300 to-orange-500 border border-amber-400/30 flex items-center justify-center text-[11px] shadow-md">👑</span>
                  </div>
                )}
                <div className="relative">
                  <div className={`absolute -inset-1 rounded-full blur-md opacity-60 ${isMe ? 'bg-emerald-400/18' : isHostPlayer ? 'bg-amber-400/16' : 'bg-white/0'}`} />
                  <button
                    onClick={() => {
                      if (canHostAct) setHostActionTarget(p);
                    }}
                    disabled={!canHostAct}
                    className={`relative w-[68px] h-[68px] rounded-full border-[2.5px] flex items-center justify-center overflow-hidden shadow-lg transition-transform
                      ${isMe ? "border-emerald-400 scale-[1.02] shadow-[0_0_18px_rgba(16,185,129,0.32)]" : isHostPlayer ? "border-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.22)]" : "border-white/15 shadow-md"}
                      ${canHostAct ? "cursor-pointer hover:scale-[1.04] hover:border-amber-400/60" : "cursor-default"}`}
                    style={avatarBg ? { background: avatarBg } : {}}
                    title={canHostAct ? "Host actions" : p.name}
                  >
                    {avatarIsImage ? <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" /> : <span className="font-[900] text-white text-[17px] tracking-wide">{p.name.slice(0, 2).toUpperCase()}</span>}
                    {isMe && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[8px] font-black tracking-widest border border-white/20 shadow">YOU</span>}
                  </button>
                </div>
                <div className="flex flex-col items-center leading-none gap-1">
                  <span className="text-xs font-[800] text-white truncate max-w-[76px] text-center">{p.name}</span>
                  {isHostPlayer && <span className="text-[10px] font-black tracking-[0.12em] text-amber-200/70">HOST</span>}
                </div>
              </div>
            );
          })}
          {room.bots.map(b => (
            <div key={b.id} className="flex flex-col items-center gap-1.5 relative">
              <button
                onClick={() => isHost && setBotConfirm(b)}
                disabled={!isHost}
                className={`relative ${isHost ? "cursor-pointer hover:scale-[1.04] transition-transform" : "cursor-default"}`}
                title={isHost ? `Remove ${b.name}` : b.name}
              >
                <div className="w-[68px] h-[68px] rounded-full border-2 border-amber-400/15 flex items-center justify-center shadow-md bg-gradient-to-br from-[#1e2a3a] to-[#0f2231] relative overflow-hidden">
                  <div className="absolute inset-0 opacity-[0.08]" style={{ background: "radial-gradient(circle at 50% 30%, #fde68a, transparent 62%)" }} />
                  <span className="text-[24px] relative">🤖</span>
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]" />
                </div>
              </button>
              <div className="flex flex-col items-center leading-none gap-1">
                <span className="text-xs font-bold text-white truncate max-w-[72px] text-center">{b.name}</span>
                <span className="text-[10px] font-bold tracking-widest text-white/35">BOT</span>
              </div>
            </div>
          ))}
          {Array.from({ length: Math.max(0, Math.min(4, room.maxPlayers - room.players.length - room.bots.length)) }).map((_, i) => (
            <div key={`wait-${i}`} className="flex flex-col items-center gap-1.5 opacity-35">
              <div className="w-[68px] h-[68px] rounded-full border-2 border-dashed border-amber-400/25 bg-white/[0.02] flex items-center justify-center backdrop-blur">
                <span className="w-7 h-7 rounded-full border border-amber-400/20 bg-amber-400/8 flex items-center justify-center text-amber-300/60 text-xs">+</span>
              </div>
              <span className="text-xs font-bold tracking-wide text-white/30">Empty</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 rounded-2xl glass-lantern p-3.5 relative overflow-hidden">
        <div className="absolute -top-6 -right-6 w-20 h-20 bg-amber-400/10 blur-xl rounded-full pointer-events-none" />
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-xs font-black tracking-wide text-white/70"><span className="w-7 h-7 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xs">👁️</span> Watching • {room.spectatorCount || 0}</span>
          <div className="flex gap-2">
            {isPlayer && <button disabled={room.players.length === 1} onClick={handleSpectate} title={room.players.length === 1 ? "You’re the only one here" : ""} className={`px-3.5 py-1.5 rounded-full text-xs font-bold border ${room.players.length === 1 ? "bg-white/5 border-white/10 text-white/30 cursor-not-allowed" : "bg-white/[0.07] hover:bg-white/[0.11] border-white/15 text-white backdrop-blur"}`}>Watch</button>}
            {isSpectator && <button onClick={handleJoinAsPlayer} className="px-4 py-1.5 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 hover:from-emerald-300 hover:to-emerald-500 text-white text-xs font-black shadow-md border border-emerald-400/30">Join to play</button>}
            {!isPlayer && !isSpectator && <><button onClick={handleSpectate} className="px-3.5 py-1.5 rounded-full bg-white/[0.07] hover:bg-white/[0.11] border border-white/15 text-white text-xs font-bold backdrop-blur">Watch</button><button onClick={handleJoinAsPlayer} className="px-4 py-1.5 rounded-full bg-gradient-to-br from-[#fffbeb] to-[#fde68a] hover:to-white text-[#0e2533] text-xs font-black shadow border border-amber-400/20">Join</button></>}
          </div>
        </div>
        {isSpectator && <p className="text-xs text-amber-300 mt-2">You’re watching - tap Join to play</p>}
        {room.spectators?.length > 0 && <div className="mt-2.5 flex flex-wrap gap-2">{room.spectators.map(s=> <span key={s.id} className="px-2.5 py-1 rounded-full bg-white/[0.07] border border-white/10 text-white text-xs font-bold backdrop-blur">{s.name}</span>)}</div>}
        {!isPlayer && !isSpectator && <p className="text-xs text-white/40 mt-1.5">Watch or join the game</p>}
      </div>
        </>
      )}
        </div>
        {/* Controls — lantern street */}
        <div className={`${hasGameState ? 'block w-full max-w-[820px]' : mobileTab === "board" ? "hidden lg:block" : "block"} space-y-4`}>

          {isQuestGame && hasGameState ? (
            <>
              <QuestGame roomId={id} isHost={isHost} isSpectator={isSpectator} hideTopAllegiance />
              <div className="rounded-2xl glass-library p-3.5 flex flex-col items-center gap-2">
                <span className="inline-flex items-center gap-2 text-xs font-black tracking-widest text-white/60"><span className="w-7 h-7 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">👁️</span> Watching • {room.spectatorCount || 0}</span>
                {room.spectators?.length>0 && <div className="flex flex-wrap gap-2 justify-center">{room.spectators.map(s=> <span key={s.id} className="px-2.5 py-1 rounded-full bg-white/[0.07] border border-white/10 text-white text-xs font-bold backdrop-blur">{s.name}</span>)}</div>}
              </div>
            </>
          ) : (
            <>
              {isQuestGame && (
                <div className="rounded-[20px] glass-library p-4 sm:p-5 relative overflow-hidden">
                  <div className="absolute -top-8 -right-8 w-28 h-28 bg-amber-500/10 blur-2xl rounded-full pointer-events-none" />
                  <div className="absolute inset-0 pointer-events-none opacity-[0.14]"><img src="/assets/hero-library.svg" alt="" className="w-full h-full object-cover object-top opacity-[0.18]" /></div>
                  <div className="flex items-start justify-between gap-3 relative">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/20 flex items-center justify-center text-lg">🕵️</div>
                      <div>
                        <h4 className="font-[900] text-white text-[15px] leading-none">Veil Street</h4>
                        <p className="text-xs text-white/40 mt-0.5">{totalPlayers} / {room.maxPlayers} — need {room.minPlayers} to start</p>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full border text-[10px] font-black tracking-widest ${canStart ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-300' : 'bg-amber-500/12 border-amber-500/20 text-amber-200'}`}>{canStart ? 'Ready' : 'Need more'}</span>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden p-0.5">
                    <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all" style={{ width: `${Math.min(100, (totalPlayers / room.minPlayers)*100)}%` }} />
                  </div>
                  <p className="text-xs text-white/45 mt-1.5">{totalPlayers} / {room.maxPlayers} players • {canStart ? 'Ready to start!' : `Need ${room.minPlayers - totalPlayers} more`}</p>
                  {isHost ? (
                    <>
                      <button onClick={handleStartQuest} disabled={!canStart} className={`mt-4 w-full py-3.5 rounded-full font-[900] tracking-wide flex items-center justify-center gap-2 border transition-all ${canStart ? "bg-gradient-to-br from-[#fffbeb] via-[#fde68a] to-[#fbbf24] hover:from-white hover:to-[#fde68a] text-[#0e2533] shadow-lantern border-amber-400/20" : "bg-white/10 text-white/30 cursor-not-allowed border-white/10"}`}>
                        {canStart ? <><span className="w-6 h-6 rounded-full bg-[#0e2533] text-amber-300 flex items-center justify-center text-xs">▶</span> Start Quest</> : `Need ${room.minPlayers} players (have ${totalPlayers})`}
                      </button>
                      {!canStart && supportsBots && <p className="text-xs text-white/35 mt-2 text-center">Add bots or wait for players to reach {room.minPlayers}.</p>}
                    </>
                  ) : (
                    <p className={`mt-4 text-center py-3 rounded-full border text-sm font-bold ${canStart ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-white/5 border-white/10 text-white/45'}`}>{canStart ? "Ready to start!" : `Need ${room.minPlayers - totalPlayers} more to start`}</p>
                  )}
                </div>
              )}

              {isHost ? (
                <div className={`rounded-[20px] border p-4 sm:p-5 relative overflow-hidden ${supportsBots ? "glass-lantern" : "bg-white/5 border-white/10 opacity-60"}`}>
                  <div className="absolute -top-6 -right-6 w-24 h-24 bg-amber-400/8 blur-xl rounded-full pointer-events-none" />
                  <h4 className="font-[900] text-white text-sm flex items-center gap-2"><span className="w-7 h-7 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xs">🤖</span> Add Bots</h4>
                  {!supportsBots ? (
                    <p className="text-xs text-amber-300 mt-2">Bots not supported for {game.label}. Switch to Veil Street to use bots, or play with humans only.</p>
                  ) : totalPlayers >= room.maxPlayers ? (
                    <p className="text-xs text-amber-300 mt-2">Room full ({totalPlayers}/{room.maxPlayers}) — remove a player/bot to add more.</p>
                  ) : (
                    <>
                      <div className="mt-3 flex gap-2 items-center">
                        <input value={botName} onChange={e => setBotName(e.target.value)} placeholder="Leave empty for random name" maxLength={20} className="flex-1 px-3.5 py-3 rounded-2xl bg-white/[0.06] border border-white/15 text-white placeholder:text-white/30 text-sm outline-none focus:border-amber-400/30 focus:bg-white/[0.09]" />
                        <button onClick={handleAddBot} className="px-5 py-3 rounded-2xl bg-gradient-to-br from-[#fffbeb] to-[#fde68a] hover:to-white text-[#0e2533] text-sm font-[900] shadow border border-amber-400/20">Add</button>
                      </div>
                      <p className="text-xs text-white/30 mt-2">{totalPlayers} / {room.maxPlayers} players — bots take a spot</p>
                    </>
                  )}
                </div>
              ) : null}

              <div className={`rounded-[20px] border p-4 sm:p-5 ${isGameLocked ? "bg-white/5 border-white/10 opacity-60" : "glass-lantern"}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-[900] text-white text-sm flex items-center gap-2"><span className="w-7 h-7 rounded-xl bg-amber-400/12 border border-amber-400/20 flex items-center justify-center text-xs">🎛️</span> Game</span>
                  {isHost ? (
                    <select value={room.game} onChange={handleChangeGame} disabled={isGameLocked} className={`px-3 py-1.5 rounded-full border text-xs font-black tracking-wide ${isGameLocked ? "bg-white/5 border-white/10 text-white/30 cursor-not-allowed" : "bg-white/[0.07] border-white/15 text-white hover:bg-white/[0.10]"}`}>
                      {games.map(g => <option key={g.id} value={g.id} className="bg-[#0f2231]">{g.label}{g.supportsBots===false ? " • no bots" : " • bots"}</option>)}
                    </select>
                  ) : (
                    <span className="px-3 py-1.5 rounded-full bg-white/[0.07] border border-white/15 text-white text-xs font-black">{game.label}</span>
                  )}
                </div>
                <p className="text-xs text-white/45 mt-1.5 leading-relaxed">{games.find(g=>g.id===room.game)?.description || ""} {isGameLocked && <span className="inline-flex ml-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/20 text-amber-200 text-[10px] font-black">Lobby locked during game</span>}</p>
                {isQuestGame && (
                  <div className="mt-3 flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10">
                    <span className="text-[11px] font-black tracking-wide text-white/60">{['morgana','mordred','oberon'].filter(k=> !!room.gameOptions[k]).length}/{totalPlayers<=6?1:totalPlayers<=8?2:3} evil extras for {totalPlayers}p</span>
                    <span className="text-[11px] font-bold text-amber-200/70">Merlin + Assassin always</span>
                  </div>
                )}
                <div className="mt-4 grid gap-4">
                  {(game.optionSchema || []).map(opt => {
                    const isEvilExtra = isQuestGame && ['morgana','mordred','oberon'].includes(opt.key);
                    const maxEvil = totalPlayers<=6?1:totalPlayers<=8?2:3;
                    const enabledEvil = ['morgana','mordred','oberon'].filter(k=> !!room.gameOptions[k]).length;
                    const wouldExceed = isEvilExtra && !room.gameOptions[opt.key] && enabledEvil >= maxEvil;
                    const disabled = isGameLocked || wouldExceed;
                    return (
                    <div key={opt.key} className="flex items-center gap-3">
                      <label className="text-xs font-[800] text-white/70 w-[92px] flex items-center gap-1.5">{opt.label} {wouldExceed && <span className="px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/20 text-amber-300 text-[9px] font-black">MAX</span>}</label>
                      {opt.type === "toggle" ? (
                        isHost ? (
                          <button disabled={disabled} onClick={() => handleOptionChange(opt.key, !room.gameOptions[opt.key])} title={wouldExceed ? `Max ${maxEvil} evil extras for ${totalPlayers} players` : ''} className={`relative w-[52px] h-7 rounded-full border transition-all p-0.5 ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"} ${room.gameOptions[opt.key] ? "bg-gradient-to-br from-amber-400 to-orange-500 border-amber-400/30 shadow-[0_0_12px_rgba(251,191,36,0.32)]" : "bg-white/12 border-white/15"}`}>
                            <span className={`block w-6 h-6 rounded-full bg-white shadow-md transition-transform ${room.gameOptions[opt.key] ? "translate-x-[24px]" : "translate-x-0"}`} />
                          </button>
                        ) : (
                          <span className={`px-2.5 py-1 rounded-full text-xs font-black border ${room.gameOptions[opt.key] ? "bg-amber-500/15 border-amber-500/20 text-amber-200" : "bg-white/5 border-white/10 text-white/40"}`}>{room.gameOptions[opt.key] ? "On" : "Off"}</span>
                        )
                      ) : opt.type === "slider" ? (
                        isHost ? (
                          <div className="flex-1 flex items-center gap-2">
                            <input type="range" min={opt.min} max={opt.max} step={opt.step} value={room.gameOptions[opt.key]} onChange={e => handleOptionChange(opt.key, Number(e.target.value))} disabled={isGameLocked} className={`flex-1 accent-amber-400 ${isGameLocked ? "opacity-40" : ""}`} />
                            <span className="text-xs font-black text-white min-w-[44px] text-right px-2 py-1 rounded-full bg-white/5 border border-white/10">{room.gameOptions[opt.key]}{opt.unit || ""}</span>
                          </div>
                        ) : (
                          <span className="text-sm font-black text-white">{room.gameOptions[opt.key]}{opt.unit || ""}</span>
                        )
                      ) : opt.type === "select" ? (
                        isHost ? (
                          <select value={room.gameOptions[opt.key]} onChange={e => handleOptionChange(opt.key, e.target.value)} disabled={isGameLocked} className={`flex-1 px-3 py-2.5 rounded-xl border text-xs font-bold ${isGameLocked ? "bg-white/5 border-white/10 text-white/30" : "bg-white/[0.06] border-white/15 text-white focus:border-amber-400/30"}`}>
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
                {isGameLocked ? <p className="text-xs text-white/30 mt-4 flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-amber-400/15 flex items-center justify-center text-[10px]">🔒</span> Reset game to change settings.</p> : !isHost ? <p className="text-xs text-white/30 mt-4">Only the host can change these settings.</p> : null}
              </div>
            </>
          )}
        </div>
      </div>

      {hostActionTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#070b14]/70 backdrop-blur-md" onClick={() => setHostActionTarget(null)}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-[340px] rounded-[22px] glass-lantern p-6 text-center shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-amber-400/14 border border-amber-400/20 flex items-center justify-center mx-auto text-xl">🏮</div>
            <p className="text-sm text-white/55 mt-3">What to do with</p>
            <p className="font-[900] text-white text-lg leading-none mt-1">{hostActionTarget.name}</p>
            <div className="mt-5 grid gap-2.5">
              <button onClick={() => handleTransferHost(hostActionTarget.id, hostActionTarget.name)} className="w-full py-3 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-[#0e2533] font-[900] flex items-center justify-center gap-2 shadow-lantern-soft border border-amber-400/20">👑 Make host</button>
              <button onClick={() => { handleKick(hostActionTarget.id, hostActionTarget.name); setHostActionTarget(null); }} className="w-full py-3 rounded-full bg-white/5 hover:bg-rose-500/15 border border-white/10 hover:border-rose-500/20 text-white font-bold">Remove</button>
              <button onClick={() => setHostActionTarget(null)} className="w-full py-2.5 rounded-full bg-transparent hover:bg-white/5 text-white/60 font-bold">Close</button>
            </div>
          </div>
        </div>
      )}

      {botConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#070b14]/70 backdrop-blur-md" onClick={() => setBotConfirm(null)}>
          <div onClick={e => e.stopPropagation()} className="w-full max-w-[340px] rounded-[22px] glass-lantern p-6 text-center shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-xl">🤖</div>
            <p className="text-sm text-white/55 mt-3">Remove</p>
            <p className="font-[900] text-white text-lg leading-none mt-1">{botConfirm.name}</p>
            <div className="mt-5 grid gap-2.5">
              <button onClick={() => handleRemoveBot(botConfirm.id, botConfirm.name)} className="w-full py-3 rounded-full bg-gradient-to-br from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white font-[900] shadow border border-rose-400/20">Remove</button>
              <button onClick={() => setBotConfirm(null)} className="w-full py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold">Close</button>
            </div>
          </div>
        </div>
      )}


      {toast && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[#0f2231] text-white text-sm font-bold px-5 py-3 rounded-full shadow-2xl border border-amber-400/20 backdrop-blur flex items-center gap-2 z-50"><span className="w-6 h-6 rounded-full bg-amber-400 text-[#0e2533] flex items-center justify-center text-xs font-black">🏮</span>{toast}</div>}

      {showRules && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-[#070b14]/70 backdrop-blur-md" onClick={()=>setShowRules(false)}>
          <div onClick={e=>e.stopPropagation()} className="w-full max-w-[520px] rounded-[24px] glass-lantern p-0 max-h-[82vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="relative h-[88px] overflow-hidden shrink-0">
              <img src="/assets/hero-street.svg" alt="" className="w-full h-full object-cover object-top opacity-85" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0f2231] via-[#0f2231]/40 to-transparent" />
              <div className="absolute inset-0 flex items-center justify-between px-6">
                <h3 className="font-display font-[900] text-white text-[18px] flex items-center gap-2"><span className="w-8 h-8 rounded-xl bg-amber-400/15 border border-amber-400/20 flex items-center justify-center text-sm">📜</span> How to Play — {game.label}</h3>
                <button onClick={()=>setShowRules(false)} className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white backdrop-blur">✕</button>
              </div>
            </div>
            <div className="p-6 overflow-auto">
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
                <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <p className="text-xs font-bold text-white">How a round works</p>
                  <p className="text-xs text-white/60 mt-1.5 leading-snug">1. Leader picks a team → 2. Everyone votes → 3. If most say yes, that team secretly picks Success or Fail. Good must pick Success. One Fail usually fails the quest - the 4th quest needs 2 fails when you have 7+ players.</p>
                </div>
                <p className="text-xs text-white/40">Now: {totalPlayers} players • {['morgana','mordred','oberon'].filter(k=> !!room.gameOptions[k]).length}/{totalPlayers<=6?1:totalPlayers<=8?2:3} extra Evil • Merlin + Assassin always in</p>
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
        </div>
      )}
    </div>
  );
}
