/**
 * Lobby — Host can change game/options, add bots (generic names), transfer host, kick via popup
 * Players edit own avatar/name via avatar click popup (like main menu)
 * Bots have uniform 🤖 avatar, host crown 👑, YOU tag, no X circles (kick via popup)
 */

import React, { useContext, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ProfileContext } from "../context/ProfileContext.jsx";
import { SocketContext } from "../context/SocketContext.jsx";
import IdentityModal from "./IdentityModal.jsx";
import PasswordModal from "./PasswordModal.jsx";
import AvatarPicker from "./AvatarPicker.jsx";
import { PALETTE } from "../utils/avatar.js";

function EditProfilePopup({ initialName, initialAvatar, onSave, onClose }) {
  const normalizedAvatar = typeof initialAvatar === "string" && initialAvatar.startsWith("data:image") ? PALETTE[0] : (initialAvatar || PALETTE[0]);
  const [name, setName] = useState(initialName || "");
  const [avatar, setAvatar] = useState(normalizedAvatar);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);

  function submit(e) {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setErr("Please enter a name");
    if (trimmed.length < 2) return setErr("Name must be at least 2 characters");
    if (trimmed.length > 20) return setErr("Name is too long");
    if (!/^[\p{L}\p{N} _'\-.]+$/u.test(trimmed)) return setErr("Only letters, numbers and - _ ' . allowed");
    if (typeof avatar === "string" && avatar.startsWith("data:image") && avatar.length > 200 * 1024) {
      return setErr("Image is too large — pick a smaller photo or colour");
    }
    setSaving(true);
    let done = false;
    const t = setTimeout(() => {
      if (!done) { done = true; setSaving(false); setErr("Connection slow — try again"); }
    }, 6000);
    onSave({ name: trimmed, avatar }, (ok, msg) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      setSaving(false);
      if (!ok) setErr(msg);
      else onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#070b14]/70 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-[420px] rounded-[24px] bg-[#142a3d] border border-white/10 shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-3 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-extrabold text-white">Edit Profile</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center text-white/60">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs font-bold tracking-widest text-white/60">NAME</label>
            <input value={name} onChange={e => setName(e.target.value)} maxLength={20} autoFocus className="mt-1.5 w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 text-sm font-semibold outline-none focus:border-amber-400/60" placeholder="Your name" />
          </div>
          <AvatarPicker value={avatar} onChange={setAvatar} />
          {err && <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-2 text-xs font-bold text-rose-300">{err}</div>}
          <button type="submit" disabled={saving} className="w-full py-3 rounded-full bg-[#f3ecd8] hover:bg-white disabled:opacity-50 text-[#0e2533] font-extrabold shadow-md">{saving ? "Saving…" : "Save"}</button>
          <button type="button" onClick={onClose} className="w-full text-xs text-white/40 hover:text-white/70">Cancel</button>
        </div>
      </form>
    </div>
  );
}

export default function Lobby() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { profile, hasProfile } = useContext(ProfileContext);
  const { socket, games } = useContext(SocketContext);

  const [room, setRoom] = useState(null);
  const [error, setError] = useState(null);
  const [showBlocking, setShowBlocking] = useState(false);
  const [needPassword, setNeedPassword] = useState(false);
  const [botName, setBotName] = useState("");
  const [toast, setToast] = useState(null);
  const [editingSelf, setEditingSelf] = useState(false);
  const [kickedPopup, setKickedPopup] = useState(false);
  const [hostActionTarget, setHostActionTarget] = useState(null);
  const [botConfirm, setBotConfirm] = useState(null);

  const id = String(roomId || "").toUpperCase();

  useEffect(() => {
    if (!hasProfile) setShowBlocking(true);
    else setShowBlocking(false);
  }, [hasProfile]);

  useEffect(() => {
    if (!socket) return;
    if (!hasProfile) return;

    function onLobbyUpdate(full) {
      if (full.id === id) setRoom(full);
    }
    function onKicked(data) {
      if (data.roomId === id) setKickedPopup(true);
    }
    function onRoomErr(data) {
      if (data?.error && /password/i.test(data.error)) {
        setNeedPassword(true);
        return;
      }
      // If kicked, already handled via player:kicked, don't show full-screen error for that
      if (data?.error && /kicked/i.test(data.error)) {
        setKickedPopup(true);
        return;
      }
      setError(data.error);
      setTimeout(() => setError(null), 3000);
    }

    socket.on("lobby:update", onLobbyUpdate);
    socket.on("player:kicked", onKicked);
    socket.on("room:error", onRoomErr);

    function attemptJoin(password = undefined, retry = 0) {
      socket.emit("room:join", { roomId: id, password }, (jres) => {
        if (jres?.ok) { setRoom(jres.room); setNeedPassword(false); }
        else {
          if (jres?.error && /password/i.test(jres.error)) setNeedPassword(true);
          else if (jres?.error && /Register a profile first/i.test(jres.error) && retry < 2) {
            // race where profile not yet registered on server — retry shortly
            setTimeout(() => attemptJoin(password, retry + 1), 600);
          } else setError(jres?.error || "Room not found");
        }
      });
    }
    socket.emit("room:sync", { roomId: id }, (res) => {
      if (res?.ok) setRoom(res.room);
      else attemptJoin();
    });
    socket._luckyAttemptJoin = attemptJoin;

    return () => {
      socket.off("lobby:update", onLobbyUpdate);
      socket.off("player:kicked", onKicked);
      socket.off("room:error", onRoomErr);
    };
  }, [socket, id, hasProfile]);

  if (showBlocking) {
    return <IdentityModal blocking title={`Enter ${id}`} onDone={() => {
      setShowBlocking(false);
      // wait a tick for profile register to reach server, then join
      setTimeout(() => {
        const fn = socket?._luckyAttemptJoin;
        if (fn) fn();
        else socket?.emit("room:join", { roomId: id }, (jres) => {
          if (jres?.ok) setRoom(jres.room);
          else if (jres?.error && /password/i.test(jres.error)) setNeedPassword(true);
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

  const myId = socket?.id;
  const isHost = !!(myId && room.hostId === myId);
  const myPlayer = room.players.find(p => p.id === myId);
  const game = games.find(g => g.id === room.game) || { label: room.game, optionSchema: [] };

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2500); }

  function handleChangeGame(e) {
    const newGame = e.target.value;
    socket.emit("lobby:updateGame", { roomId: id, gameId: newGame }, (res) => {
      if (!res?.ok) showToast(res.error);
      else showToast(`Game set to ${res.room.gameLabel}`);
    });
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
  function handleEditSave({ name, avatar }, done) {
    if (!socket || (!socket.connected && !socket.id)) {
      done(false, "Not connected — please wait a moment and try again");
      return;
    }
    let acked = false;
    const t = setTimeout(() => {
      if (!acked) {
        acked = true;
        done(false, "Connection slow — please try again");
      }
    }, 6000);
    socket.emit("profile:update", { username: name, avatar }, (res) => {
      if (acked) return;
      acked = true;
      clearTimeout(t);
      if (!res?.ok) {
        done(false, res?.error || "That name is taken — try another");
        return;
      }
      try {
        const raw = localStorage.getItem("luckyStreet:profile");
        const p = raw ? JSON.parse(raw) : {};
        p.username = res.profile.username;
        p.avatar = res.profile.avatar;
        p.avatarType = "color";
        localStorage.setItem("luckyStreet:profile", JSON.stringify(p));
      } catch {}
      showToast("Profile updated");
      done(true);
    });
  }
  function handleLeave() {
    let left = false;
    const go = () => { if (!left) { left = true; navigate("/"); } };
    const t1 = setTimeout(go, 1500);
    try {
      socket.emit("room:leave", { roomId: id }, () => { clearTimeout(t1); go(); });
    } catch { clearTimeout(t1); go(); }
    setTimeout(go, 800);
  }

  return (
    <div className="max-w-[760px] mx-auto px-4 pb-10">
      <div className="flex items-center justify-between pt-2">
        <button onClick={() => navigate("/")} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/70">‹</button>
        <div className="text-center">
          <h1 className="font-display font-extrabold text-[18px] tracking-wide text-[#f3ecd8]">Lucky Street</h1>
          <p className="text-xs text-white/50 -mt-1">Room <span className="font-mono font-bold text-white">{room.id}</span> {room.isPrivate ? "🔒" : "🔓"} • Host: {room.hostName}</p>
        </div>
        <button onClick={handleLeave} className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-bold text-white/70">Leave</button>
      </div>

      <div className="mt-4 rounded-[24px] bg-[#29546c] border border-white/10 shadow-xl p-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(ellipse at top, rgba(255,255,255,0.15), transparent 60%)" }}></div>
        <div className="relative">
          <div className="font-display font-black text-[36px] tracking-[0.18em] text-[#f3ecd8]" style={{ textShadow: "0 2px 0 rgba(0,0,0,0.25)" }}>{room.id}</div>
          <p className="text-xs text-white/70 mt-1">Share: <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded">{window.location.origin}/room/{room.id}</span></p>
          <p className="text-xs text-white/40 mt-1">Send this link to friends to invite them.</p>
          <div className="mt-3 flex justify-center gap-2">
            <button onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/room/${room.id}`); showToast("Invite link copied"); }} className="px-4 py-2 rounded-full bg-[#f3ecd8] hover:bg-white text-[#0e2533] text-xs font-extrabold">Copy Invite Link</button>
            <span className="px-3 py-2 rounded-full bg-white/10 border border-white/10 text-xs font-bold text-white/70">{room.slotsText}</span>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="font-extrabold text-white text-sm">Players & Bots</h3>
        <p className="text-xs text-white/40">Tap your avatar to change your name and photo.</p>
        <div className="mt-3 flex flex-wrap gap-4">
          {room.players.map(p => {
            const isMe = p.id === myId;
            const isHostPlayer = p.isHost || p.id === room.hostId;
            const avatarIsImage = p.avatar && typeof p.avatar === "string" && p.avatar.startsWith("data:");
            const avatarBg = avatarIsImage ? null : (p.avatar || "#475569");
            const canEdit = isMe;
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
                      if (canEdit) setEditingSelf(true);
                      else if (isHost && !isMe) setHostActionTarget(p);
                    }}
                    disabled={!canEdit && !(isHost && !isMe)}
                    className={`w-[64px] h-[64px] rounded-full border-2 flex items-center justify-center overflow-hidden shadow-md transition-transform
                      ${isMe ? "border-emerald-400 scale-[1.02]" : isHostPlayer ? "border-amber-400" : "border-white/15"}
                      ${canEdit || (isHost && !isMe) ? "cursor-pointer hover:scale-105" : "cursor-default"}`}
                    style={avatarBg ? { background: avatarBg } : {}}
                    title={canEdit ? "Edit your profile" : isHost ? "Host actions" : p.name}
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

      {isHost ? (
        <div className="mt-5 rounded-2xl bg-[#0f2231]/80 border border-white/10 p-4">
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
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-white/60 w-24">Max Players</label>
            {isHost ? (
              <input defaultValue={room.maxPlayers} key={room.game + room.maxPlayers} onBlur={commitMax} onKeyDown={e => { if (e.key === "Enter") commitMax(e); }} className="flex-1 px-3 py-2 rounded-xl bg-white/10 border border-white/15 text-white text-sm font-bold w-20" type="number" min={2} max={12} />
            ) : (
              <span className="text-sm font-bold text-white">{room.maxPlayers}</span>
            )}
            <span className="text-xs text-white/30">Set automatically — host can change it</span>
          </div>
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

      {editingSelf && myPlayer && (
        <EditProfilePopup initialName={myPlayer.name} initialAvatar={myPlayer.avatar || profile?.avatar} onClose={() => setEditingSelf(false)} onSave={handleEditSave} />
      )}

      {needPassword && (
        <PasswordModal roomId={id} onClose={() => { setNeedPassword(false); navigate("/"); }} onSubmit={(pwd) => {
            const fn = socket._luckyAttemptJoin;
            if (fn) fn(pwd);
            else socket.emit("room:join", { roomId: id, password: pwd }, (res) => {
              if (res?.ok) { setRoom(res.room); setNeedPassword(false); }
              else setError(res.error);
            });
          }} />
      )}
      {toast && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[#1f2937] text-white text-sm font-bold px-4 py-2.5 rounded-full shadow-xl border border-white/10">{toast}</div>}
    </div>
  );
}
