import React, { useContext, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { SocketContext } from "../context/SocketContext.jsx";

/**
 * TvView — spectator / Kahoot-style big screen for any game
 * Same /room/:id data but no player join, no private controls
 * Shows: code, QR/link, player avatars with YOU/crown, public board
 * Used at /tv/:id and also embedded in PC split-view top
 */
export default function TvView({ roomId: propId, embedded = false }) {
  const { roomId: paramId } = useParams();
  const id = String(propId || paramId || "").toUpperCase();
  const { socket, games } = useContext(SocketContext);
  const [room, setRoom] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!socket || !id) return;
    function onUpdate(full) {
      if (full.id === id) setRoom(full);
    }
    socket.on("lobby:update", onUpdate);
    socket.emit("room:sync", { roomId: id }, (res) => {
      if (res?.ok) setRoom(res.room);
      else setError(res?.error || "Room not found");
    });
    return () => socket.off("lobby:update", onUpdate);
  }, [socket, id]);

  if (error) {
    return (
      <div className={`${embedded ? "p-6" : "max-w-[760px] mx-auto px-4 py-10"} text-center`}>
        <div className="rounded-2xl bg-rose-500/10 border border-rose-500/20 p-6">
          <p className="font-bold text-rose-300">{error}</p>
          <p className="text-sm text-white/50 mt-1">Check the code and try again.</p>
        </div>
      </div>
    );
  }
  if (!room) {
    return (
      <div className={`${embedded ? "p-8" : "max-w-[760px] mx-auto px-4 py-16"} text-center`}>
        <div className="w-10 h-10 border-2 border-white/20 border-t-amber-400 rounded-full animate-spin mx-auto"></div>
        <p className="text-sm text-white/50 mt-3">Loading {id}…</p>
      </div>
    );
  }

  const game = games.find(g => g.id === room.game) || { label: room.game, description: "" };

  return (
    <div className={`${embedded ? "" : "max-w-[760px] mx-auto px-4 pb-6"} ${embedded ? "" : "pt-2"}`}>
      {/* Big code + QR-like link — visible from couch */}
      <div className="rounded-[24px] bg-[#29546c] border border-white/10 shadow-xl p-6 sm:p-8 text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ background: "radial-gradient(ellipse at top, rgba(255,255,255,0.15), transparent 60%)" }}></div>
        <div className="relative">
          <p className="text-xs tracking-widest font-bold text-white/50">JOIN CODE</p>
          <div className="font-display font-black text-[48px] sm:text-[56px] tracking-[0.18em] text-[#f3ecd8]" style={{ textShadow: "0 2px 0 rgba(0,0,0,0.25)" }}>{room.id}</div>
          <p className="text-sm text-white/70 mt-1">Go to <span className="font-bold text-white">{window.location.host}</span> → Enter code</p>
          <p className="font-mono text-xs bg-white/10 px-2 py-1 rounded inline-block mt-2 break-all">{window.location.origin}/room/{room.id}</p>
          <div className="mt-3 flex justify-center gap-2">
            <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/10 text-xs font-bold text-white/70">{room.slotsText}</span>
            <span className="px-3 py-1.5 rounded-full bg-white/10 border border-white/10 text-xs font-bold text-white/70">{game.label}</span>
          </div>
        </div>
      </div>

      {/* Public player grid — same avatars as lobby but no private YOU/edit, just crown + names */}
      <div className="mt-6">
        <h3 className="font-extrabold text-white text-sm">Players</h3>
        <div className="mt-3 flex flex-wrap gap-4 justify-center sm:justify-start">
          {room.players.map(p => {
            const isHost = p.isHost || p.id === room.hostId;
            const isImage = p.avatar && p.avatar.startsWith("data:");
            return (
              <div key={p.id} className="flex flex-col items-center gap-1.5 relative">
                {isHost && <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none text-[16px]">👑</div>}
                <div className={`w-[72px] h-[72px] sm:w-[80px] sm:h-[80px] rounded-full border-2 flex items-center justify-center overflow-hidden shadow-md ${isHost ? "border-amber-400" : "border-white/15"}`} style={isImage ? {} : { background: p.avatar || "#475569" }}>
                  {isImage ? <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" /> : <span className="font-black text-white text-xl">{p.name.slice(0,2).toUpperCase()}</span>}
                </div>
                <span className="text-sm font-bold text-white max-w-[80px] truncate text-center">{p.name}</span>
              </div>
            );
          })}
          {room.bots.map(b => (
            <div key={b.id} className="flex flex-col items-center gap-1.5 opacity-90">
              <div className="w-[72px] h-[72px] sm:w-[80px] sm:h-[80px] rounded-full border-2 border-white/10 flex items-center justify-center bg-[#1e2a3a]"><span className="text-[28px]">🤖</span></div>
              <span className="text-sm font-bold text-white/80 max-w-[80px] truncate text-center">{b.name}</span>
            </div>
          ))}
          {room.players.length + room.bots.length === 0 && <p className="text-sm text-white/40">Waiting for players…</p>}
        </div>
      </div>

      {/* Public game info — for Trivia show question, for Avalon show quest track */}
      <div className="mt-6 rounded-2xl bg-[#0f2231]/60 border border-white/10 p-4 text-center">
        <p className="text-xs tracking-widest font-bold text-white/40">GAME</p>
        <p className="font-extrabold text-white">{game.label}</p>
        <p className="text-sm text-white/50 mt-1">{game.description}</p>
        <p className="text-xs text-white/30 mt-3">Players answer on their phones. Look here for the board.</p>
      </div>

      {!embedded && <p className="text-xs text-white/30 text-center mt-6">Spectator view — open on a TV. Players join at <span className="font-mono">{window.location.origin}/room/{id}</span></p>}
    </div>
  );
}
