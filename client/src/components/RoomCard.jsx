import React from "react";

export default function RoomCard({ room, onJoin }) {
  // room: { id, hostName, gameLabel, maxPlayers, currentPlayers, botCount, slotsText, isPrivate }
  return (
    <div className="rounded-2xl bg-[#142a3d] border border-white/10 p-4 shadow-md hover:border-white/20 transition-colors flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono font-black text-lg tracking-[0.12em] text-[#f3ecd8]">{room.id}</span>
            {room.isPrivate && <span title="Password protected" className="text-sm">🔒</span>}
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${room.isPrivate ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"}`}>
              {room.isPrivate ? "Private" : "Open"}
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
        <span className="text-xs text-white/40">ID: {room.id}</span>
        <button
          onClick={() => onJoin(room)}
          className="px-4 py-2 rounded-full bg-[#f3ecd8] hover:bg-white text-[#0e2533] text-xs font-extrabold shadow-sm"
        >Join</button>
      </div>
    </div>
  );
}
