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
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#070b14]/78 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-[440px] rounded-[24px] bg-[#23272a] border border-white/10 shadow-2xl overflow-hidden animate-[slideUp_0.3s_ease-out]">
        <div className="relative h-[108px] overflow-hidden">
          <div className="absolute inset-0 bg-[#1a1d1f]" />
          <img src="/assets/hero-grey.svg" alt="" className="absolute inset-0 w-full h-full object-cover object-bottom opacity-[0.20]" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a1d1f] via-[#1a1d1f]/85 to-[#1a1d1f]/45" />
          <div className="absolute inset-0 flex items-center justify-between px-6">
            <div className="bg-[#23272a] border border-white/10 rounded-2xl px-4 py-2.5 shadow-xl flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-[#1a1d1f] border border-white/10 flex items-center justify-center shadow">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f3ecd8" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.3" fill="#f3ecd8"/><circle cx="15.5" cy="8.5" r="1.3" fill="#f3ecd8"/><circle cx="12" cy="12" r="1.4" fill="#c9734b"/><circle cx="8.5" cy="15.5" r="1.3" fill="#f3ecd8"/><circle cx="15.5" cy="15.5" r="1.3" fill="#f3ecd8"/></svg>
              </span>
              <div>
                <h2 className="font-display font-[900] text-white text-[16px] leading-none">Create Room</h2>
                <p className="text-xs text-white/65 mt-0.5 font-bold tracking-wide">Pick a game to start</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="w-9 h-9 rounded-full bg-[#1a1d1f] hover:bg-[#23272a] border border-white/15 flex items-center justify-center text-white shadow transition-colors hover:rotate-90 duration-300">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="grid gap-2.5">
            {games.map(g => {
              const active = gameId === g.id;
              const icons = { 'veil-street': '🎭', 'lucky-roulette': '🎰', 'street-rally': '🏁', 'checkpoint-chaos': '🚩' };
              return (
                <button
                  type="button"
                  key={g.id}
                  onClick={() => setGameId(g.id)}
                  className={`text-left p-4 rounded-2xl border flex items-center gap-3 transition-all duration-200 ${active ? 'bg-[#2a2e32] border-[#9ca3af]/45 shadow-lg shadow-black/20 scale-[1.01]' : 'bg-[#1e2326] border-white/10 hover:bg-[#252a2e] hover:border-white/15 hover:scale-[1.01] hover:shadow-md'}`}
                >
                  <span className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 border transition-transform duration-200 ${active ? 'bg-[#e5e7eb] text-[#1a1d1f] border-white/15 shadow scale-105' : 'bg-[#1a1d1f] text-white/80 border-white/10 group-hover:scale-105'}`}>{icons[g.id] || '🎲'}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-bold leading-none ${active ? 'text-white' : 'text-white/90'}`}>{g.label}</p>
                    <p className="text-xs text-white/50 mt-1 leading-snug line-clamp-2">{g.minPlayers}-{g.maxPlayers} • {g.description}</p>
                  </div>
                  <span className={`ml-2 w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 text-xs font-bold transition-all duration-200 ${active ? 'bg-[#9ca3af] border-[#9ca3af] text-[#121416] scale-110' : 'border-white/15 text-transparent'}`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12l5 5l10 -10"/></svg>
                  </span>
                </button>
              );
            })}
          </div>

          {error && <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-2 text-xs font-bold text-rose-300 animate-[slideUp_0.2s_ease-out]">{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 rounded-full bg-gradient-to-br from-[#fff8e7] via-[#f3ecd8] to-[#d88a63] hover:from-white hover:to-[#f3ecd8] disabled:opacity-50 text-[#1a1d1f] font-[900] shadow-cafe border border-[#c9734b]/18 transition-all duration-200 hover:shadow-xl hover:scale-[1.01] active:scale-[0.98]"
          >{submitting ? "Creating..." : "Create Room"}</button>
          <p className="text-[11px] text-white/30 text-center">You'll get a code to share • options in lobby</p>
        </div>
      </form>
    </div>
  );
}
