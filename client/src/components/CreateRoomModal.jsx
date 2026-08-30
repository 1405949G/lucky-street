/**
 * CreateRoomModal — Spec 4
 * - Host selects game from dropdown
 * - Selecting game autofills Max Players based on that game's standard setting (host can overwrite)
 * - Optional password field
 * - On creation, server generates 4-char ID
 */

import React, { useEffect, useState, useContext } from "react";
import { SocketContext } from "../context/SocketContext.jsx";

export default function CreateRoomModal({ onClose, onCreated }) {
  const { games, socket } = useContext(SocketContext);
  const [gameId, setGameId] = useState(() => games[0]?.id || "quest-of-shadows");
  const [maxPlayers, setMaxPlayers] = useState(() => {
    const g = games.find(x => x.id === (games[0]?.id || "quest-of-shadows"));
    return g ? String(g.defaultMaxPlayers) : "6";
  });
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // When game changes, autofill maxPlayers (dynamic defaults)
  useEffect(() => {
    const g = games.find(x => x.id === gameId);
    if (g) setMaxPlayers(String(g.defaultMaxPlayers));
  }, [gameId]); // eslint-disable-line

  // If games load async, sync initial
  useEffect(() => {
    if (games.length && !games.find(x => x.id === gameId)) {
      setGameId(games[0].id);
    }
  }, [games]); // eslint-disable-line

  function submit(e) {
    e.preventDefault();
    setError(null);
    const mp = Number(maxPlayers);
    if (!Number.isFinite(mp) || mp < 2 || mp > 12) return setError("Max Players must be 2-12");
    if (!gameId) return setError("Choose a game");
    setSubmitting(true);
    socket.emit("room:create", { gameId, maxPlayers: mp, password: password || null }, (res) => {
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
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#070b14]/70 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-[440px] rounded-[24px] bg-[#142a3d] border border-white/10 shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-3 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-extrabold text-white">Create Room</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/15 flex items-center justify-center text-white/60">✕</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs font-bold tracking-widest text-white/60">GAME</label>
            <select
              value={gameId}
              onChange={e => setGameId(e.target.value)}
              className="mt-1.5 w-full px-3.5 py-3 rounded-xl bg-white/10 border border-white/15 text-white text-sm font-semibold outline-none focus:border-amber-400/60"
            >
              {games.map(g => (
                <option key={g.id} value={g.id} className="bg-[#142a3d]">{g.label} — {g.defaultMaxPlayers} max ({g.minPlayers}-{g.maxPlayers})</option>
              ))}
            </select>
            {selectedGame && <p className="text-xs text-white/40 mt-1">{selectedGame.description}</p>}
          </div>

          <div>
            <label className="text-xs font-bold tracking-widest text-white/60">MAX PLAYERS</label>
            <input
              value={maxPlayers}
              onChange={e => setMaxPlayers(e.target.value.replace(/\D/g, "").slice(0, 2))}
              placeholder="e.g., 6"
              className="mt-1.5 w-full px-3.5 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 text-sm font-semibold outline-none focus:border-amber-400/60"
            />
            <p className="text-[11px] text-white/30 mt-1">Autofilled to <span className="text-white/60 font-bold">{selectedGame?.defaultMaxPlayers}</span> for {selectedGame?.label}; host can overwrite.</p>
          </div>

          <div>
            <label className="text-xs font-bold tracking-widest text-white/60">PASSWORD (optional)</label>
            <input
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Leave blank for open room (🔓) — set to lock (🔒)"
              type="password"
              className="mt-1.5 w-full px-3.5 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 text-sm outline-none focus:border-amber-400/60"
            />
            <p className="text-[11px] text-white/30 mt-1">{password ? "🔒 Private — players will be prompted for password" : "🔓 Public — anyone with link can join"}</p>
          </div>

          {selectedGame?.optionSchema?.length > 0 && (
            <div className="rounded-xl bg-white/5 border border-white/10 p-3">
              <p className="text-xs font-bold text-white/60">Game-specific options are configured inside the lobby after creation (host sliders/toggles).</p>
            </div>
          )}

          {error && <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-2 text-xs font-bold text-rose-300">{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 rounded-full bg-[#f3ecd8] hover:bg-white disabled:opacity-50 text-[#0e2533] font-extrabold shadow-md"
          >{submitting ? "Creating…" : "Create Room → Generate 4-char ID"}</button>

          <p className="text-[11px] text-white/30 text-center">Room ID is a random 4-char alphanumeric (e.g., 7F2A) — shareable via URL <span className="font-mono">/room/XXXX</span></p>
        </div>
      </form>
    </div>
  );
}
