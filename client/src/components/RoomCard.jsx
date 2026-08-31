import React from "react";

export default function RoomCard({ room, onJoin, onSpectate }) {
  const isLive = room.status === 'In Progress';
  const isEnded = room.status === 'Ended';
  return (
    <div className="group relative rounded-[20px] glass-lantern p-[1px] overflow-hidden transition-all hover:shadow-lantern-soft">
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style={{ background: "radial-gradient(ellipse 420px 120px at 28% 0%, rgba(251,191,36,0.14), transparent 68%)" }} />
      <div className="relative rounded-[19px] bg-gradient-to-br from-[#1a324d]/95 via-[#132a3d]/92 to-[#0f2231]/96 p-4 flex flex-col gap-3.5 overflow-hidden">
        {/* subtle top lantern line */}
        <div className="absolute top-0 left-6 right-6 h-[1px] bg-gradient-to-r from-transparent via-amber-400/25 to-transparent opacity-60" />
        {/* soft glow dot */}
        <div className="absolute -top-10 -right-10 w-28 h-28 bg-amber-400/10 blur-[22px] rounded-full pointer-events-none" />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-[900] text-[18px] tracking-[0.14em] text-[#fffbeb] drop-shadow-[0_1px_8px_rgba(253,230,138,0.22)]">{room.id}</span>
              <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full border tracking-widest ${isLive ? 'bg-amber-500/14 border-amber-500/25 text-amber-200' : isEnded ? 'bg-white/8 border-white/10 text-white/45' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-amber-400 animate-pulse' : isEnded ? 'bg-white/30' : 'bg-emerald-400'}`} />
                {room.status || 'OPEN'}
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/[0.06] border border-white/10 text-[11px] font-bold text-white/60">
                <span className="w-3 h-3 rounded-full bg-gradient-to-br from-amber-300 to-orange-500 flex items-center justify-center text-[8px]">🏮</span>
                {room.gameLabel}
              </span>
            </div>
            <p className="text-xs text-white/62 mt-1.5 flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1"><span className="w-5 h-5 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-[10px] leading-none">👑</span><span className="font-bold text-white/90">{room.hostName}</span></span>
              <span className="text-white/20">•</span>
              <span>{room.gameLabel}</span>
              {room.spectatorCount ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/8 border border-white/10 text-white/60 text-[11px]">👁 {room.spectatorCount}</span> : null}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] font-black tracking-[0.18em] text-amber-200/55">STREET</p>
            <p className="text-xs font-black text-white mt-0.5">{room.slotsText}</p>
            <div className="mt-1.5 h-1.5 w-[92px] rounded-full bg-white/10 overflow-hidden p-0.5">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all" style={{ width: `${Math.min(100, Math.round(((room.currentPlayers + (room.botCount||0)) / room.maxPlayers)*100))}%` }} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1 border-t border-white/[0.06]">
          <div className="flex items-center gap-1.5 text-[11px] text-white/35">
            <span className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">🏘️</span>
            <span className="font-mono font-bold tracking-wide">{room.id}</span>
            <span className="hidden sm:inline text-white/20">• Tap Join to step onto the street</span>
          </div>
          <div className="flex gap-2">
            {onSpectate && <button onClick={() => onSpectate(room)} className="px-3.5 py-2 rounded-full bg-white/[0.07] hover:bg-white/[0.11] border border-white/10 text-white text-xs font-bold backdrop-blur transition-colors">Watch</button>}
            <button
              onClick={() => onJoin(room)}
              className="px-5 py-2 rounded-full bg-gradient-to-br from-[#fffbeb] via-[#fde68a] to-[#fbbf24] hover:from-white hover:to-[#fde68a] text-[#0e2533] text-xs font-[900] shadow-lantern-soft border border-amber-400/20"
            >Join →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
