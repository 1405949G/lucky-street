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
    <div className="max-w-[960px] mx-auto">
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div>
          <h2 className="font-display font-extrabold text-[24px] text-[#f3ecd8]">Active Lobbies</h2>
          <p className="text-sm text-white/50">Find a room to join or create your own.</p>
        </div>
        <button
          onClick={onCreateClick}
          className="px-5 py-3 rounded-full bg-[#f3ecd8] hover:bg-white text-[#0e2533] font-extrabold shadow-md"
        >+ Create Room</button>
      </div>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-5">
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter by host, game, or ID…"
              className="flex-1 px-4 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 text-sm outline-none focus:border-amber-400/50"
            />
            <span className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-white/60 flex items-center">{filtered.length} rooms</span>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-2xl bg-[#0f2231]/60 border border-white/10 border-dashed p-8 text-center">
              <p className="text-white font-bold">No active lobbies</p>
              <p className="text-sm text-white/50 mt-1">Be the first to create one — your room will appear here live for everyone.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filtered.map(room => (
                <RoomCard key={room.id} room={room} onJoin={onJoinRoom} onSpectate={onSpectate} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <JoinByIdBox onJoin={(code) => onJoinRoom({ id: code })} />
          <div className="rounded-2xl bg-[#29546c] border border-white/10 p-5">
            <h3 className="font-extrabold text-[#f3ecd8]">How it works</h3>
            <ul className="text-sm text-white/70 mt-2 space-y-1.5 list-disc list-inside">
              <li>Your name and avatar are saved — you’ll stay signed in when you come back.</li>
              <li>Names must be unique — if one is taken, try another.</li>
              <li>If you leave, your name is reserved for a few minutes.</li>
              <li>Share your invite link with friends to play together.</li>
            </ul>
            <a href="/admin" className="hidden">Admin</a>
          </div>
        </div>
      </div>
    </div>
  );
}
