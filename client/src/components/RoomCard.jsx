// TEXT LOCK — strings from client/src/content/copy.js:1 (do not edit text here without explicit user prompt)
import React from "react";

export default function RoomCard({ room, onJoin, onSpectate, disabled, isMyRoom, myRoomId }) {
  // room: { id, hostName, gameLabel, maxPlayers, currentPlayers, botCount, slotsText, isPrivate, spectatorCount }
  const isBlocked = !!disabled;
  return (
    <div className={`rounded-2xl border p-4 shadow-md transition-colors flex flex-col gap-3 ${isMyRoom ? "bg-amber-500/10 border-amber-500/30" : isBlocked ? "bg-[#142a3d]/60 border-white/5" : "bg-[#142a3d] border-white/10 hover:border-white/20"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono font-black text-lg tracking-[0.12em] text-[#f3ecd8]">{room.id}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${room.status === 'In Progress' ? 'bg-amber-500/15 border-amber-500/30 text-amber-300' : room.status === 'Ended' ? 'bg-white/10 border-white/15 text-white/50' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'}`}>
              {room.status || 'Open'}
            </span>
          </div>
          <p className="text-xs text-white/60 mt-1">
            Host: <span className="font-bold text-white">{room.hostName}</span> • {room.gameLabel}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-bold tracking-widest text-white/40">SLOTS</p>
          <p className="text-xs font-bold text-white">{room.slotsText}</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-white/40">ID: {room.id} {room.spectatorCount ? `• ${room.spectatorCount} 👀` : ""} {isMyRoom ? "• ← You’re here" : ""}</span>
        <div className="flex gap-2">
          {onSpectate && <button onClick={() => onSpectate(room)} disabled={isBlocked} className={`px-3 py-2 rounded-full border text-xs font-bold ${isBlocked ? "bg-white/5 border-white/5 text-white/20 cursor-not-allowed" : "bg-white/10 hover:bg-white/15 border-white/10 text-white"}`}>Spectate</button>}
          <button
            onClick={() => onJoin(room)}
            disabled={room.status === 'In Progress' || isBlocked}
            title={isBlocked ? `Already in room ${myRoomId} — leave it first` : room.status === 'In Progress' ? 'Game in progress — join as Spectate' : 'Join room'}
            className={`px-4 py-2 rounded-full text-xs font-extrabold shadow-sm ${isMyRoom ? "bg-amber-400 hover:bg-amber-300 text-[#0e2533]" : isBlocked || room.status === 'In Progress' ? 'bg-white/10 border border-white/10 text-white/30 cursor-not-allowed' : 'bg-[#f3ecd8] hover:bg-white text-[#0e2533]'}`}
          >{isMyRoom ? "Rejoin" : "Join"}</button>
        </div>
      </div>
    </div>
  );
}
