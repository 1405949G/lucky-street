/**
 * Lobby — Spec 5: Permission Matrix + Global Visibility via WebSockets
 * Host: can change game, options, add/remove/rename bots, kick, rename self/bots
 * Player: can only rename self
 * All changes instantly sync via `lobby:update` broadcast
 */

import React, { useContext, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ProfileContext } from "../context/ProfileContext.jsx";
import { SocketContext } from "../context/SocketContext.jsx";
import IdentityModal from "./IdentityModal.jsx";
import PasswordModal from "./PasswordModal.jsx";

const PALETTE_BOT = ["#8b5cf6","#f59e0b","#06b6d4","#ec4899","#22c55e","#f97316"];

export default function Lobby() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { profile, hasProfile } = useContext(ProfileContext);
  const { socket, games } = useContext(SocketContext);

  const [room, setRoom] = useState(null);
  const [error, setError] = useState(null);
  const [showBlocking, setShowBlocking] = useState(false);
  const [needPassword, setNeedPassword] = useState(false);
  const [editingSelf, setEditingSelf] = useState(false);
  const [selfName, setSelfName] = useState("");
  const [botName, setBotName] = useState("");
  const [botColor, setBotColor] = useState(PALETTE_BOT[0]);
  const [toast, setToast] = useState(null);

  const id = String(roomId || "").toUpperCase();

  // Direct link blocking: if no profile, show blocking modal
  useEffect(() => {
    if (!hasProfile) setShowBlocking(true);
    else setShowBlocking(false);
  }, [hasProfile]);

  // Keep selfName in sync with profile when entering
  useEffect(() => {
    if (profile?.username) setSelfName(profile.username);
  }, [profile]);

  // Socket subscriptions
  useEffect(() => {
    if (!socket) return;
    if (!hasProfile) return; // don't try to join without identity

    function onLobbyUpdate(full) {
      if (full.id === id) setRoom(full);
    }
    function onKicked(data) {
      if (data.roomId === id) {
        setToast("You were kicked by the host");
        setTimeout(() => navigate("/"), 1500);
      }
    }
    function onRoomErr(data) {
      // password errors handled via needPassword modal — don't show full-screen error
      if (data?.error && /password/i.test(data.error)) {
        setNeedPassword(true);
        return;
      }
      setError(data.error);
      setTimeout(() => setError(null), 3000);
    }
    function onPlayerJoined() {
      // lobby:update already handles, but could toast
    }

    socket.on("lobby:update", onLobbyUpdate);
    socket.on("player:kicked", onKicked);
    socket.on("room:error", onRoomErr);

    // Request sync and ensure joined (if coming via direct link, need to emit join)
    function attemptJoin(password = undefined) {
      socket.emit("room:join", { roomId: id, password }, (jres) => {
        if (jres?.ok) { setRoom(jres.room); setNeedPassword(false); }
        else {
          if (jres?.error && /password/i.test(jres.error)) setNeedPassword(true);
          else setError(jres?.error || "Room not found");
        }
      });
    }
    socket.emit("room:sync", { roomId: id }, (res) => {
      if (res?.ok) setRoom(res.room);
      else attemptJoin();
    });
    // expose for retry after password modal
    socket._luckyAttemptJoin = attemptJoin;

    // If directly landing, ensure we are joined (covers refresh case where socket id changed)
    // The sync above will attempt join if needed

    return () => {
      socket.off("lobby:update", onLobbyUpdate);
      socket.off("player:kicked", onKicked);
      socket.off("room:error", onRoomErr);
    };
  }, [socket, id, hasProfile, navigate]);

  // Also listen for global lobby updates to keep room fresh via polling fallback
  useEffect(() => {
    if (!socket) return;
    function onRoomsUpdate() {
      // re-sync
      socket.emit("room:sync", { roomId: id }, (res) => {
        if (res?.ok) setRoom(res.room);
      });
    }
    // optional: use rooms:update to refresh if our room changed (e.g., host changed game)
    // Already covered by lobby:update, but keep for safety
    return () => {};
  }, [socket, id]);

  if (showBlocking) {
    return <IdentityModal blocking title={`Enter ${id}`} onDone={() => {
      setShowBlocking(false);
      // after identity set, trigger join ( Lobby effect will run because hasProfile now true — but for same mount we manually retry)
      const pwd = undefined;
      if (socket) {
        // small delay for profile register to propagate
        setTimeout(() => {
          if (socket._luckyAttemptJoin) socket._luckyAttemptJoin(pwd);
          else socket.emit("room:join", { roomId: id }, (jres) => {
            if (jres?.ok) setRoom(jres.room);
            else if (jres?.error && /password/i.test(jres.error)) setNeedPassword(true);
            else if (jres?.error) setError(jres.error);
          });
        }, 400);
      }
    }} />;
  }

  if (error) {
    return (
      <div className="max-w-[520px] mx-auto px-4 py-10">
        <div className="rounded-2xl bg-rose-500/10 border border-rose-500/20 p-6 text-center">
          <p className="font-bold text-rose-300">{error}</p>
          <button onClick={() => navigate("/")} className="mt-4 px-5 py-2 rounded-full bg-white text-[#0e2533] font-bold">Back to Lobbies</button>
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

  const isHost = socket && room.hostId === socket.id;
  const me = room.players.find(p => p.id === socket?.id);
  const canEditSelf = !!me;
  const game = games.find(g => g.id === room.game) || { label: room.game, optionSchema: [] };

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2500); }

  function handleChangeGame(e) {
    const newGame = e.target.value;
    socket.emit("lobby:updateGame", { roomId: id, gameId: newGame }, (res) => {
      if (!res?.ok) showToast(res.error);
      else showToast(`Game → ${res.room.gameLabel}`);
    });
  }

  function handleMaxChange(e) {
    const v = e.target.value;
    // debounce? immediate for now but validate on blur/enter
  }
  function commitMax(e) {
    const n = Number(e.target.value);
    if (!Number.isFinite(n)) return;
    socket.emit("lobby:updateMaxPlayers", { roomId: id, maxPlayers: n }, (res) => {
      if (!res?.ok) showToast(res.error);
    });
  }

  function handleOptionChange(key, value) {
    socket.emit("lobby:updateOptions", { roomId: id, options: { [key]: value } }, (res) => {
      if (!res?.ok) showToast(res.error);
    });
  }

  function handleAddBot() {
    if (!botName.trim()) return showToast("Enter bot name");
    socket.emit("lobby:addBot", { roomId: id, botName: botName.trim(), avatarColor: botColor }, (res) => {
      if (!res?.ok) showToast(res.error);
      else { setBotName(""); showToast(`Added bot ${botName}`); }
    });
  }

  function handleRemoveBot(botId) {
    socket.emit("lobby:removeBot", { roomId: id, botId }, (res) => {
      if (!res?.ok) showToast(res.error);
    });
  }

  function handleRenameBot(botId, current) {
    const next = prompt(`Rename bot "${current}" to:`, current);
    if (!next || next.trim() === current) return;
    socket.emit("lobby:renameBot", { roomId: id, botId, newName: next.trim() }, (res) => {
      if (!res?.ok) showToast(res.error);
    });
  }

  function handleKick(targetId, name) {
    if (!confirm(`Kick ${name}?`)) return;
    socket.emit("lobby:kickPlayer", { roomId: id, targetId }, (res) => {
      if (!res?.ok) showToast(res.error);
      else showToast(`Kicked ${name}`);
    });
  }

  function handleRenameSelf() {
    const trimmed = selfName.trim();
    if (!trimmed) return showToast("Name required");
    if (trimmed === profile.username) { setEditingSelf(false); return; }
    socket.emit("lobby:renameSelf", { roomId: id, newName: trimmed }, (res) => {
      if (!res?.ok) showToast(res.error);
      else {
        // also update localStorage via profile context? Socket will emit user:renamed but we manually save
        // Update local profile cache
        try {
          const raw = localStorage.getItem("luckyStreet:profile");
          const p = raw ? JSON.parse(raw) : {};
          p.username = trimmed;
          localStorage.setItem("luckyStreet:profile", JSON.stringify(p));
        } catch {}
        setEditingSelf(false);
        showToast(`Renamed to ${trimmed}`);
      }
    });
  }

  function handleLeave() {
    socket.emit("room:leave", { roomId: id }, () => navigate("/"));
  }

  return (
    <div className="max-w-[760px] mx-auto px-4 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <button onClick={() => navigate("/")} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/70">‹</button>
        <div className="text-center">
          <h1 className="font-display font-extrabold text-[18px] tracking-wide text-[#f3ecd8]">Lucky Street</h1>
          <p className="text-xs text-white/50 -mt-1">Room <span className="font-mono font-bold text-white">{room.id}</span> {room.isPrivate ? "🔒" : "🔓"} • Host: {room.hostName}</p>
        </div>
        <button onClick={handleLeave} className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-bold text-white/70">Leave</button>
      </div>

      {/* Invite card */}
      <div className="mt-4 rounded-[24px] bg-[#29546c] border border-white/10 shadow-xl p-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(ellipse at top, rgba(255,255,255,0.15), transparent 60%)" }}></div>
        <div className="relative">
          <div className="font-display font-black text-[36px] tracking-[0.18em] text-[#f3ecd8]" style={{ textShadow: "0 2px 0 rgba(0,0,0,0.25)" }}>{room.id}</div>
          <p className="text-xs text-white/70 mt-1">Share: <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded">{window.location.origin}/room/{room.id}</span></p>
          <p className="text-xs text-white/40 mt-1">Friends open link — if no profile, blocking setup shows before lobby.</p>
          <div className="mt-3 flex justify-center gap-2">
            <button
              onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/room/${room.id}`); showToast("Invite link copied"); }}
              className="px-4 py-2 rounded-full bg-[#f3ecd8] hover:bg-white text-[#0e2533] text-xs font-extrabold"
            >Copy Invite Link</button>
            <span className="px-3 py-2 rounded-full bg-white/10 border border-white/10 text-xs font-bold text-white/70">{room.slotsText}</span>
          </div>
        </div>
      </div>

      {/* Player grid */}
      <div className="mt-6">
        <h3 className="font-extrabold text-white text-sm">Players & Bots</h3>
        <p className="text-xs text-white/40">Tap your avatar to rename yourself. {isHost ? "Host can add/remove/rename bots, kick players, and change game/options." : "Players can only rename themselves."}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {room.players.map(p => {
            const isMe = p.id === socket?.id;
            const avatarBg = p.avatar && p.avatar.startsWith("data:") ? null : (p.avatar || "#475569");
            return (
              <div key={p.id} className="flex flex-col items-center gap-1.5 relative">
                <div
                  className={`w-[64px] h-[64px] rounded-full border-2 flex items-center justify-center overflow-hidden shadow-md ${isMe ? "border-emerald-400" : p.isHost ? "border-amber-400" : "border-white/15"}`}
                  style={avatarBg ? { background: avatarBg } : {}}
                >
                  {p.avatar && p.avatar.startsWith("data:") ? (
                    <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-black text-white text-lg">{p.name.slice(0, 2).toUpperCase()}</span>
                  )}
                </div>
                <div className="flex flex-col items-center leading-none">
                  <span className="text-xs font-bold text-white truncate max-w-[72px] text-center">{p.name}</span>
                  <span className="text-[10px] font-bold tracking-wide mt-0.5 px-1.5 py-0.5 rounded-full border text-[9px] border-white/15 bg-white/5 text-white/60">
                    {p.isHost ? "HOST" : isMe ? "YOU" : "PLAYER"}
                  </span>
                </div>
                {isMe && editingSelf ? (
                  <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 bg-[#0f2231] border border-white/10 rounded-xl p-2 shadow-xl z-10 flex gap-1">
                    <input value={selfName} onChange={e => setSelfName(e.target.value)} className="px-2 py-1 rounded-lg bg-white/10 border border-white/15 text-white text-xs w-24" maxLength={20} />
                    <button onClick={handleRenameSelf} className="px-2 py-1 rounded-lg bg-emerald-500 text-white text-xs font-bold">OK</button>
                    <button onClick={() => setEditingSelf(false)} className="px-2 py-1 rounded-lg bg-white/10 text-white text-xs">✕</button>
                  </div>
                ) : null}
                {!editingSelf && isMe && (
                  <button onClick={() => setEditingSelf(true)} className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-white text-[#0e2533] border border-white shadow flex items-center justify-center text-[10px] font-black">✎</button>
                )}
                {isHost && !isMe && (
                  <button onClick={() => handleKick(p.id, p.name)} className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center text-[10px] shadow" title="Kick">✕</button>
                )}
              </div>
            );
          })}
          {room.bots.map(b => (
            <div key={b.id} className="flex flex-col items-center gap-1.5 relative">
              <div className="w-[64px] h-[64px] rounded-full border-2 border-white/10 flex items-center justify-center shadow-md" style={{ background: b.avatarColor || b.avatar || "#6b7280" }}>
                <span className="font-black text-white text-sm">{b.name.slice(0, 2).toUpperCase()}</span>
              </div>
              <div className="flex flex-col items-center leading-none">
                <span className="text-xs font-bold text-white truncate max-w-[72px] text-center">{b.name}</span>
                <span className="text-[9px] font-bold tracking-wide mt-0.5 px-1.5 py-0.5 rounded-full bg-white/10 border border-white/10 text-white/60">BOT</span>
              </div>
              {isHost && (
                <div className="absolute -top-1 -right-1 flex gap-1">
                  <button onClick={() => handleRenameBot(b.id, b.name)} className="w-6 h-6 rounded-full bg-white text-[#0e2533] flex items-center justify-center text-[10px] font-black">✎</button>
                  <button onClick={() => handleRemoveBot(b.id)} className="w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center text-[10px]">✕</button>
                </div>
              )}
            </div>
          ))}
          {/* Waiting slots */}
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

      {/* Host bot adder */}
      {isHost ? (
        <div className="mt-5 rounded-2xl bg-[#0f2231]/80 border border-white/10 p-4">
          <h4 className="font-bold text-white text-sm">Add AI Bots (host only)</h4>
          <div className="mt-2 flex gap-2 items-center">
            <input
              value={botName}
              onChange={e => setBotName(e.target.value)}
              placeholder="Bot name (custom)"
              maxLength={20}
              className="flex-1 px-3 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 text-sm outline-none"
            />
            <div className="flex gap-1">
              {PALETTE_BOT.map(c => (
                <button key={c} onClick={() => setBotColor(c)} className={`w-7 h-7 rounded-full border-2 ${botColor===c ? "border-white" : "border-white/20"}`} style={{ background: c }} />
              ))}
            </div>
            <button onClick={handleAddBot} className="px-4 py-2.5 rounded-xl bg-[#f3ecd8] hover:bg-white text-[#0e2533] text-sm font-bold">Add Bot</button>
          </div>
          <p className="text-xs text-white/30 mt-1">{room.players.length + room.bots.length} / {room.maxPlayers} — bots count toward slots. Name must be unique in room.</p>
        </div>
      ) : (
        <div className="mt-5 rounded-xl bg-white/5 border border-white/10 p-3 text-center">
          <p className="text-xs text-white/50">Only host can manage bots • you can still rename yourself</p>
        </div>
      )}

      {/* Game picker + options */}
      <div className="mt-5 rounded-2xl bg-[#0f2231]/80 border border-white/10 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="font-extrabold text-white text-sm">Game</span>
          {isHost ? (
            <select
              value={room.game}
              onChange={handleChangeGame}
              className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-white text-xs font-bold"
            >
              {games.map(g => <option key={g.id} value={g.id} className="bg-[#0f2231]">{g.label}</option>)}
            </select>
          ) : (
            <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-white text-xs font-bold">{game.label}</span>
          )}
        </div>
        <p className="text-xs text-white/40 mt-1">{games.find(g=>g.id===room.game)?.description || ""}</p>

        <div className="mt-3 grid gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-white/60 w-24">Max Players</label>
            {isHost ? (
              <input
                defaultValue={room.maxPlayers}
                key={room.game + room.maxPlayers}
                onBlur={commitMax}
                onKeyDown={e => { if (e.key === "Enter") commitMax(e); }}
                className="flex-1 px-3 py-2 rounded-xl bg-white/10 border border-white/15 text-white text-sm font-bold w-20"
                type="number"
                min={2}
                max={12}
              />
            ) : (
              <span className="text-sm font-bold text-white">{room.maxPlayers}</span>
            )}
            <span className="text-xs text-white/30">autofilled on game change; host can overwrite</span>
          </div>

          {(game.optionSchema || []).map(opt => (
            <div key={opt.key} className="flex items-center gap-3">
              <label className="text-xs font-bold text-white/60 w-24">{opt.label}</label>
              {opt.type === "toggle" ? (
                isHost ? (
                  <button
                    onClick={() => handleOptionChange(opt.key, !room.gameOptions[opt.key])}
                    className={`relative w-12 h-6 rounded-full transition-colors ${room.gameOptions[opt.key] ? "bg-emerald-500" : "bg-white/15"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${room.gameOptions[opt.key] ? "translate-x-6" : ""}`} />
                  </button>
                ) : (
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${room.gameOptions[opt.key] ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/40"}`}>{room.gameOptions[opt.key] ? "On" : "Off"}</span>
                )
              ) : opt.type === "slider" ? (
                isHost ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="range"
                      min={opt.min}
                      max={opt.max}
                      step={opt.step}
                      value={room.gameOptions[opt.key]}
                      onChange={e => handleOptionChange(opt.key, Number(e.target.value))}
                      className="flex-1 accent-amber-400"
                    />
                    <span className="text-xs font-bold text-white w-12 text-right">{room.gameOptions[opt.key]}{opt.unit || ""}</span>
                  </div>
                ) : (
                  <span className="text-sm font-bold text-white">{room.gameOptions[opt.key]}{opt.unit || ""}</span>
                )
              ) : opt.type === "select" ? (
                isHost ? (
                  <select
                    value={room.gameOptions[opt.key]}
                    onChange={e => handleOptionChange(opt.key, e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-white/10 border border-white/15 text-white text-xs"
                  >
                    {opt.options.map(o => <option key={o} value={o} className="bg-[#0f2231]">{o}</option>)}
                  </select>
                ) : (
                  <span className="text-sm font-bold text-white capitalize">{room.gameOptions[opt.key]}</span>
                )
              ) : null}
            </div>
          ))}
        </div>

        <p className="text-xs text-white/30 mt-3">
          {isHost ? "Changes sync instantly to all clients in this room (global visibility)." : "View-only — host changes sync live; you see them instantly."}
        </p>
      </div>

      {/* Self rename card */}
      <div className="mt-5 rounded-2xl bg-[#0f2231]/60 border border-white/10 p-4">
        <h4 className="font-bold text-white text-sm">Your Identity</h4>
        <p className="text-xs text-white/40">You can modify your own username anytime (global uniqueness enforced). Host can also rename bots and themselves.</p>
        <div className="mt-2 flex gap-2">
          <input
            value={selfName}
            onChange={e => setSelfName(e.target.value)}
            className="flex-1 px-3 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white text-sm"
            maxLength={20}
          />
          <button onClick={handleRenameSelf} className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white text-sm font-bold">Rename</button>
        </div>
      </div>

      {needPassword && (
        <PasswordModal
          roomId={id}
          onClose={() => { setNeedPassword(false); navigate("/"); }}
          onSubmit={(pwd) => {
            const fn = socket._luckyAttemptJoin;
            if (fn) fn(pwd);
            else socket.emit("room:join", { roomId: id, password: pwd }, (res) => {
              if (res?.ok) { setRoom(res.room); setNeedPassword(false); }
              else setError(res.error);
            });
          }}
        />
      )}
      {toast && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[#1f2937] text-white text-sm font-bold px-4 py-2.5 rounded-full shadow-xl border border-white/10">{toast}</div>}
    </div>
  );
}
