import React, { useContext, useMemo, useState } from "react";
import { SocketContext } from "../context/SocketContext.jsx";
import RoomCard from "./RoomCard.jsx";
import JoinByIdBox from "./JoinByIdBox.jsx";

export default function RoomBrowser({ onJoinRoom, onSpectate, onCreateClick }) {
  const { rooms } = useContext(SocketContext);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rooms;
    return rooms.filter(r =>
      r.id.toLowerCase().includes(s) ||
      r.hostName.toLowerCase().includes(s) ||
      r.gameLabel.toLowerCase().includes(s)
    );
  }, [rooms, search]);

  return (
    <div className="max-w-[1020px] mx-auto">
      {/* section header — lantern divider */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-display font-[900] text-[22px] sm:text-[24px] tracking-[-0.01em] text-white">Game Rooms</h2>
            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#c9734b]/12 border border-[#c9734b]/18 text-[#f3ecd8] text-[11px] font-black tracking-widest">{filtered.length} rooms</span>
          </div>
          <p className="text-sm text-white/55 mt-0.5">Jump in or start your own.</p>
        </div>
        <button
          onClick={onCreateClick}
          className="group inline-flex items-center gap-2 px-5 py-3 rounded-full bg-gradient-to-br from-[#fff8e7] via-[#f3ecd8] to-[#d88a63] hover:from-white hover:to-[#f3ecd8] text-[#1a1d1f] font-[900] shadow-cafe border border-[#c9734b]/18"
        >
          <span className="w-7 h-7 rounded-full bg-[#1a1d1f] text-[#f3ecd8] flex items-center justify-center text-[16px] leading-none group-hover:rotate-90 transition-transform">+</span>
          New Game
        </button>
      </div>

      <div className="mt-2 flex items-center justify-center opacity-60">
        <img src="/assets/cafe-ornament.svg" alt="" className="h-[14px] w-auto" />
      </div>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1.28fr_0.72fr] gap-5 items-start">
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 text-sm">⌕</span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search rooms…"
                className="w-full pl-9 pr-4 py-3 rounded-2xl bg-white/[0.06] border border-white/10 text-white placeholder:text-white/30 text-sm outline-none focus:border-[#c9734b]/30 focus:bg-white/[0.09] backdrop-blur"
              />
            </div>
            <span className="hidden sm:inline-flex px-3.5 py-2 rounded-2xl bg-white/[0.06] border border-white/10 text-xs font-black tracking-widest text-[#f3ecd8]/70 items-center">{filtered.length} rooms</span>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-[24px] glass-lantern p-8 text-center overflow-hidden relative">
              <div className="absolute inset-0 opacity-[0.08]" style={{ background: "radial-gradient(ellipse 420px 180px at 50% 0%, #c9734b, transparent 70%)" }} />
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#c9734b]/18 to-[#8aa899]/12 border border-[#c9734b]/18 flex items-center justify-center mx-auto text-2xl">🎲</div>
                <p className="text-white font-[900] mt-3">No games right now</p>
                <p className="text-sm text-white/50 mt-1">Start a new one — it’ll show up instantly.</p>
                <button onClick={onCreateClick} className="mt-4 px-5 py-2.5 rounded-full bg-gradient-to-br from-[#fff8e7] via-[#f3ecd8] to-[#d88a63] text-[#1a1d1f] text-sm font-black">New Game</button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3.5">
              {filtered.map(room => (
                <RoomCard key={room.id} room={room} onJoin={onJoinRoom} onSpectate={onSpectate} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4 lg:sticky lg:top-[84px]">
          <JoinByIdBox onJoin={(code) => onJoinRoom({ id: code })} />
          <div className="rounded-[22px] glass-lantern p-5 relative overflow-hidden">
            <div className="absolute -top-8 -right-8 w-28 h-28 bg-[#c9734b]/10 blur-2xl rounded-full pointer-events-none" />
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-[#c9734b]/12 border border-[#c9734b]/18 flex items-center justify-center text-sm">💡</span>
              <h3 className="font-[900] text-[#f3ecd8] tracking-wide">Quick tips</h3>
            </div>
            <ul className="text-sm text-white/68 mt-3 space-y-2.5">
              <li className="flex gap-2"><span className="text-[#c9734b] mt-0.5">•</span><span>Your name stays saved for next time.</span></li>
              <li className="flex gap-2"><span className="text-[#c9734b] mt-0.5">•</span><span>Pick a unique name — try another if taken.</span></li>
              <li className="flex gap-2"><span className="text-[#c9734b] mt-0.5">•</span><span>Share your invite link to play together.</span></li>
            </ul>
            <div className="mt-4 px-3 py-2.5 rounded-xl bg-[#c9734b]/10 border border-[#c9734b]/14 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[#c9734b] text-white flex items-center justify-center text-xs font-black">!</span>
              <p className="text-xs font-bold text-[#f3ecd8]/90">Tip: open on TV, friends join on phones</p>
            </div>
            <a href="/admin" className="hidden">Admin</a>
          </div>

          <div className="rounded-[22px] bg-gradient-to-br from-[#2e3336] to-[#1a1d1f] border border-white/10 p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#c9734b]/12 border border-[#c9734b]/18 flex items-center justify-center text-lg">🃏</div>
            <div>
              <p className="text-xs font-black tracking-[0.14em] text-[#f3ecd8]/60">FEATURED</p>
              <p className="text-sm font-black text-white leading-none mt-0.5">Veil Street — 5-10 players</p>
              <p className="text-xs text-white/55 mt-1">Hidden roles • Bluff • Find Merlin</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
