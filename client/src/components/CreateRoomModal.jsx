/**
 * CreateRoomModal - Spec 4
 * - Host selects game from dropdown
 * - Selecting game autofills Max Players based on that game's standard setting (host can overwrite)
 * - No password - all rooms are open (share link)
 * - On creation, server generates 4-char ID
 */

import React, { useEffect, useState, useContext } from "react";
import { SocketContext } from "../context/SocketContext.jsx";

export default function CreateRoomModal({ onClose, onCreated }) {
  const { games, socket } = useContext(SocketContext);
  const [gameId, setGameId] = useState(() => games[0]?.id || "veil-street");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // If games load async, sync initial
  useEffect(() => {
    if (games.length && !games.find(x => x.id === gameId)) {
      setGameId(games[0].id);
    }
  }, [games]); // eslint-disable-line

  function submit(e) {
    e.preventDefault();
    setError(null);
    if (!gameId) return setError("Choose a game");
    const selected = games.find(x => x.id === gameId);
    const mp = selected ? selected.defaultMaxPlayers : 6; // fixed to manifest default
    if (!socket?.connected && !socket?.id) {
      return setError("Not connected - please wait a moment and try again");
    }
    setSubmitting(true);
    let done = false;
    const timeout = setTimeout(() => {
      if (!done) {
        done = true;
        setSubmitting(false);
        setError("Connection slow - please try again");
      }
    }, 6000);
    socket.emit("room:create", { gameId, maxPlayers: mp }, (res) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      setSubmitting(false);
      if (res?.ok) {
        onCreated?.(res.room);
      } else {
        setError(res?.error || "Failed to create room");
      }
    });
  }

  const selectedGame = games.find(g => g.id === gameId) || games[0];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#070b14]/78 backdrop-blur-md">
      <form onSubmit={submit} className="w-full max-w-[440px] rounded-[24px] glass-lantern shadow-2xl overflow-hidden">
        <div className="relative h-[92px] overflow-hidden">
          <img src="/assets/hero-grey.svg" alt="" className="w-full h-full object-cover object-bottom opacity-92" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a1d1f] via-[#1a1d1f]/50 to-transparent" />
          <div className="absolute inset-0 flex items-center justify-between px-6">
            <div>
              <h2 className="font-display font-[900] text-white text-[18px] leading-none flex items-center gap-2"><span className="w-8 h-8 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-sm">🎲</span> Create Room</h2>
              <p className="text-xs text-white/55 mt-1 font-bold tracking-wide">Pick a game to start</p>
            </div>
            <button type="button" onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white backdrop-blur">✕</button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="grid gap-2.5">
            {games.map(g => {
              const active = gameId === g.id;
              const icons = { 'veil-street': '🕵️', 'lucky-roulette': '🎲', 'street-rally': '🏁', 'checkpoint-chaos': '🚩' };
              return (
                <button
                  type="button"
                  key={g.id}
                  onClick={() => setGameId(g.id)}
                  className={`text-left p-4 rounded-2xl border flex items-center gap-3 transition-all ${active ? 'bg-gradient-to-br from-[#9ca3af]/14 to-[#6b7280]/08 border-[#9ca3af]/40 shadow-lg shadow-[#9ca3af]/10 scale-[1.01]' : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06] hover:border-white/15'}`}
                >
                  <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${active ? 'bg-[#9ca3af] text-[#121416]' : 'bg-white/10 text-white/70'}`}>{icons[g.id] || '🎮'}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-bold leading-none ${active ? 'text-white' : 'text-white/90'}`}>{g.label}</p>
                    <p className="text-xs text-white/50 mt-1 leading-snug line-clamp-2">{g.minPlayers}-{g.maxPlayers} • {g.description}</p>
                  </div>
                  <span className={`ml-2 w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 text-xs font-bold transition-colors ${active ? 'bg-[#9ca3af] border-[#9ca3af] text-[#121416]' : 'border-white/15 text-transparent'}`}>✓</span>
                </button>
              );
            })}
          </div>

          {error && <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-2 text-xs font-bold text-rose-300">{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 rounded-full bg-gradient-to-br from-[#fff8e7] via-[#f3ecd8] to-[#d88a63] hover:from-white hover:to-[#f3ecd8] disabled:opacity-50 text-[#1a1d1f] font-[900] shadow-cafe border border-[#c9734b]/18"
          >{submitting ? "Creating…" : "Create Room"}</button>
          <p className="text-[11px] text-white/30 text-center">You’ll get a code to share • options in lobby</p>
        </div>
      </form>
    </div>
  );
}
