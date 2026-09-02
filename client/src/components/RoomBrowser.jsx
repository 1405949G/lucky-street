// TEXT LOCK — strings from client/src/content/copy.js:1, visuals from client/src/ui/theme.js:1
import React, { useContext, useMemo, useState } from "react";
import { SocketContext } from "../context/SocketContext.jsx";
import { ProfileContext } from "../context/ProfileContext.jsx";
import RoomCard from "./RoomCard.jsx";
import JoinByIdBox from "./JoinByIdBox.jsx";
import { copy } from "../content/copy.js";

export default function RoomBrowser({ onJoinRoom, onSpectate, onCreateClick }) {
  const { rooms, socket } = useContext(SocketContext);
  const { profile } = useContext(ProfileContext);
  const [search, setSearch] = useState("");
  const [leaving, setLeaving] = useState(false);

  const myRoom = useMemo(() => {
    if (!profile?.username) return null;
    const lower = profile.username.toLowerCase();
    return rooms.find(r =>
      (r.playerNames || []).some(n => String(n).toLowerCase() === lower) ||
      (r.spectatorNames || []).some(n => String(n).toLowerCase() === lower) ||
      String(r.hostName || "").toLowerCase() === lower
    ) || null;
  }, [rooms, profile]);

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
      {myRoom && (
        <div className="mb-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between shadow-lg">
          <div>
            <p className="text-[11px] font-bold tracking-widest text-amber-300">YOU'RE STILL IN A ROOM</p>
            <p className="font-mono font-black text-lg tracking-[0.12em] text-[#f3ecd8] mt-1">{myRoom.id} • {myRoom.gameLabel}</p>
            <p className="text-xs text-white/70 mt-1">Host: <span className="font-bold text-white">{myRoom.hostName}</span> • {myRoom.slotsText} • <span className={`font-bold ${myRoom.status==='In Progress'?'text-amber-300':'text-emerald-300'}`}>{myRoom.status}</span></p>
            <p className="text-xs text-amber-200/70 mt-1">Tap Rejoin to go back — you can't join another lobby until you leave this one.</p>
            {myRoom.status==='In Progress' && <p className="text-xs text-rose-300 mt-1">Leaving now will cancel the game for everyone.</p>}
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => onJoinRoom(myRoom)} className="px-6 py-3 rounded-full bg-amber-400 hover:bg-amber-300 text-[#0e2533] font-extrabold shadow-md">Rejoin {myRoom.id}</button>
            <button
              disabled={leaving}
              onClick={() => {
                if (!socket || !myRoom) return;
                if (myRoom.status==='In Progress' && !window.confirm(`${profile.username} — leave ${myRoom.id}? Game will be cancelled and room returns to lobby.`)) return;
                setLeaving(true);
                const payload = { roomId: myRoom.id };
                if (profile?.username) { payload.username = profile.username; payload.avatar = profile.avatar; }
                socket.emit("room:leave", payload, (res) => {
                  setLeaving(false);
                  if (!res?.ok) {
                    console.warn("leave failed", res?.error);
                  }
                });
                setTimeout(() => setLeaving(false), 1000);
              }}
              className="px-5 py-3 rounded-full bg-white/10 hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/30 text-white text-sm font-bold disabled:opacity-50"
            >{leaving ? "Leaving…" : "Leave"}</button>
          </div>
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div>
          <h2 className="font-display font-extrabold text-[24px] text-[#f3ecd8]">{copy.roomBrowser.title}</h2>
          <p className="text-sm text-white/50">{copy.roomBrowser.subtitle}{myRoom ? " • You’re in a room — leave it to join another" : ""}</p>
        </div>
        <button
          onClick={onCreateClick}
          disabled={!!myRoom}
          title={myRoom ? `Already in room ${myRoom.id} — leave it first` : ""}
          className={`px-5 py-3 rounded-full font-extrabold shadow-md ${myRoom ? "bg-white/10 border border-white/10 text-white/30 cursor-not-allowed" : "bg-[#f3ecd8] hover:bg-white text-[#0e2533]"}`}
        >{copy.roomBrowser.newGame}</button>
      </div>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-5">
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={copy.roomBrowser.searchPlaceholder}
              className="flex-1 px-4 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 text-sm outline-none focus:border-amber-400/50"
            />
            <span className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-white/60 flex items-center">{filtered.length} {copy.roomBrowser.roomsSuffix}</span>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-2xl bg-[#0f2231]/60 border border-white/10 border-dashed p-8 text-center">
              <p className="text-white font-bold">{copy.roomBrowser.emptyTitle}</p>
              <p className="text-sm text-white/50 mt-1">{copy.roomBrowser.emptyDesc}</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filtered.map(room => {
                const isMyRoom = myRoom && room.id === myRoom.id;
                const blocked = myRoom && !isMyRoom;
                return (
                  <div key={room.id} className={blocked ? "opacity-60" : ""}>
                    <RoomCard room={room} onJoin={onJoinRoom} onSpectate={onSpectate} disabled={blocked} isMyRoom={isMyRoom} myRoomId={myRoom?.id} />
                    {blocked && <p className="text-xs text-amber-300 mt-1">Leave {myRoom.id} first to join</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <JoinByIdBox onJoin={(code) => onJoinRoom({ id: code })} />
          <div className="rounded-2xl bg-[#29546c] border border-white/10 p-5">
            <h3 className="font-extrabold text-[#f3ecd8]">{copy.roomBrowser.quickTipsTitle}</h3>
            <ul className="text-sm text-white/70 mt-2 space-y-1.5 list-disc list-inside">
              {copy.roomBrowser.quickTips.map(t => <li key={t}>{t}</li>)}
            </ul>
            <a href="/admin" className="hidden">Admin</a>
          </div>
        </div>
      </div>
    </div>
  );
}
