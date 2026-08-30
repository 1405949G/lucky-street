import React, { useContext, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { ProfileContext } from "./context/ProfileContext.jsx";
import { SocketContext } from "./context/SocketContext.jsx";
import IdentityModal from "./components/IdentityModal.jsx";
import RoomBrowser from "./components/RoomBrowser.jsx";
import CreateRoomModal from "./components/CreateRoomModal.jsx";
import Lobby from "./components/Lobby.jsx";
import AdminView from "./components/AdminView.jsx";

function MainPage() {
  const { profile, hasProfile, showOnboarding, setShowOnboarding } = useContext(ProfileContext);
  const { socket, connected, rooms } = useContext(SocketContext);
  const navigate = useNavigate();

  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState(null);

  function handleCreateClick() {
    if (!hasProfile) { setShowOnboarding(true); return; }
    setShowCreate(true);
  }

  function handleJoinRoom(room, retry = 0) {
    if (!hasProfile) { setShowOnboarding(true); return; }
    const id = String(room.id || room).toUpperCase();
    if (!socket?.connected) {
      if (retry < 3) { setTimeout(() => handleJoinRoom(room, retry + 1), 500); return; }
      setError("Not connected - try again"); setTimeout(() => setError(null), 3000); return;
    }
    socket.emit("room:join", { roomId: id }, (res) => {
      if (res?.ok) {
        navigate(`/room/${id}`);
      } else {
        const msg = res?.error || "";
        if (/Username already in this room|Already in room/i.test(msg)) {
          // Same name already in room (e.g., same user second tab) or same socket already in room - open as spectator instead (auto-spectate)
          navigate(`/room/${id}/spectate`);
          return;
        }
        const transient = /Register a profile first|already taken|timeout|missing identity/i.test(msg);
        if (transient && retry < 4) {
          setTimeout(() => handleJoinRoom(room, retry + 1), 400 * Math.pow(1.5, retry));
          return;
        }
        setError(res?.error || "Failed to join");
        setTimeout(() => setError(null), 3000);
      }
    });
  }
  function handleSpectate(room) {
    const id = String(room.id || room).toUpperCase();
    navigate(`/room/${id}/spectate`);
  }

  function handleCreated(room) {
    setShowCreate(false);
    navigate(`/room/${room.id}`);
  }

  return (
    <div className="min-h-screen">
      {/* Top bar — lantern street */}
      <header className="sticky top-0 z-20 backdrop-blur-xl bg-[#070b14]/78 border-b border-white/[0.07] shadow-[0_8px_32px_rgba(0,0,0,0.35)]">
        <div className="absolute inset-0 pointer-events-none opacity-[0.32]" style={{ background: "radial-gradient(ellipse 520px 120px at 22% 0%, rgba(251,191,36,0.18), transparent 68%), radial-gradient(ellipse 520px 120px at 88% 0%, rgba(251,191,36,0.12), transparent 68%)" }} />
        <div className="relative max-w-[1020px] mx-auto px-4 flex items-center justify-between h-[68px]">
          <div className="flex items-center gap-3.5">
            {/* Lantern logo */}
            <div className="relative">
              <div className="absolute -inset-2 bg-amber-400/18 blur-xl rounded-full" />
              <div className="relative w-[42px] h-[42px] rounded-[13px] bg-gradient-to-br from-[#1e3a4f] to-[#0f2231] border border-amber-400/25 flex items-center justify-center shadow-lantern-soft overflow-hidden">
                <div className="absolute inset-0 opacity-[0.12]" style={{ background: "radial-gradient(circle at 50% 30%, #fde68a, transparent 62%)" }} />
                <svg viewBox="0 0 32 38" className="w-[22px] h-[26px] drop-shadow-[0_0_8px_rgba(251,191,36,0.55)]">
                  <ellipse cx="16" cy="19" rx="14" ry="14" fill="url(#hdrGlow)" />
                  <defs><radialGradient id="hdrGlow" cx="50%" cy="38%" r="58%"><stop offset="0%" stopColor="#fffbeb"/><stop offset="55%" stopColor="#fbbf24"/><stop offset="100%" stopColor="#f59e0b"/></radialGradient></defs>
                  <g transform="translate(16 19) scale(0.78)">
                    <path d="M-10 -11 H10 L8 9 H-8 Z" fill="#0f2231" stroke="#fbbf24" strokeWidth="1.1"/><rect x="-9" y="-11" width="18" height="2.2" rx="1" fill="#fbbf24"/><rect x="-8" y="9" width="16" height="1.8" rx="1" fill="#fbbf24"/><rect x="-7" y="-8" width="14" height="14" rx="1.2" fill="#fff7d6"/><ellipse cx="0" cy="-1" rx="3" ry="3.8" fill="#f59e0b"/><ellipse cx="0.5" cy="-1.4" rx="1.5" ry="2" fill="#fffbeb"/>
                  </g>
                </svg>
              </div>
            </div>
            <div>
              <h1 className="font-display font-[900] tracking-[0.14em] text-white leading-none text-[15px] sm:text-[16px]">LUCKY STREET</h1>
              <div className="flex items-center gap-1.5 -mt-0.5">
                <span className="hidden sm:inline w-[18px] h-[1px] bg-amber-400/50" />
                <p className="text-[10px] tracking-[0.22em] text-amber-200/70 font-[700]">PARTY LOBBY</p>
                <span className="hidden sm:inline w-[18px] h-[1px] bg-amber-400/50" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className={`hidden sm:flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-full border text-xs font-bold ${connected ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-amber-500/10 border-amber-500/20 text-amber-300 animate-pulse"}`}>
              <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.7)]" : "bg-amber-400"}`} style={connected ? { animation: "flicker 2.4s ease-in-out infinite" } : {}} />
              {connected ? "Live" : "Connecting…"}
            </div>
            {hasProfile ? (
              <div className="flex items-center gap-2.5 ml-1 pl-2.5 border-l border-white/10">
                <div
                  className="w-9 h-9 rounded-full border-[1.5px] flex items-center justify-center overflow-hidden shadow-md relative"
                  style={{
                    borderColor: "rgba(251,191,36,0.35)",
                    background: profile.avatar && !profile.avatar.startsWith("data:") ? profile.avatar : "linear-gradient(135deg, #1e3a4f, #0f2231)",
                    boxShadow: "0 0 14px rgba(251,191,36,0.18)"
                  }}
                >
                  {profile.avatar && profile.avatar.startsWith("data:") ? (
                    <img src={profile.avatar} alt="you" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[11px] font-black text-white tracking-widest">{profile.username.slice(0,2).toUpperCase()}</span>
                  )}
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#070b14] shadow" />
                </div>
                <span className="text-sm font-bold text-white hidden sm:inline max-w-[100px] truncate">{profile.username}</span>
                <button onClick={() => setShowOnboarding(true)} className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-bold text-white/70">Edit</button>
              </div>
            ) : (
              <button onClick={() => setShowOnboarding(true)} className="ml-1 px-3 py-1.5 rounded-full bg-[#f3ecd8] text-[#0e2533] text-xs font-extrabold">Set Profile</button>
            )}
          </div>
        </div>
      </header>

      {/* Hero — midnight street */}
      <div className="relative overflow-hidden border-b border-white/[0.06]">
        <div className="absolute inset-0">
          <img src="/assets/hero-street.svg" alt="" className="w-full h-full object-cover object-top opacity-[0.94]" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#070b14]/10 to-[#070b14]/92" />
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 720px 360px at 50% 68%, rgba(251,191,36,0.08), transparent 66%)" }} />
        </div>
        <div className="relative max-w-[1020px] mx-auto px-4 pt-7 sm:pt-10 pb-6 sm:pb-7">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div className="max-w-[640px]">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.08] border border-white/10 backdrop-blur-md">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
                <span className="text-[11px] font-black tracking-[0.18em] text-white/85">PARTY LOBBY • 5-10 FRIENDS • 1 TV + PHONES</span>
                <span className="hidden sm:inline-flex ml-1 px-1.5 py-0.5 rounded-full bg-amber-400 text-[#0e2533] text-[10px] font-black">NEW</span>
              </div>
              <h2 className="mt-3 font-display font-[900] leading-[0.9] tracking-[-0.02em] text-white">
                <span className="block text-[28px] sm:text-[38px]">Gather on</span>
                <span className="block text-[34px] sm:text-[44px] bg-gradient-to-r from-[#fffbeb] via-[#fde68a] to-[#fbbf24] bg-clip-text text-transparent text-glow">Lucky Street</span>
              </h2>
              <p className="mt-2.5 text-[14px] sm:text-[15px] leading-relaxed text-white/72 max-w-[560px]">A party lobby for friends. Create a room, share the code, play <span className="font-bold text-amber-200">Veil Street</span> — bluff, deduce, and hunt Merlin.</p>
              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <button
                  onClick={handleCreateClick}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-gradient-to-br from-[#fffbeb] via-[#fde68a] to-[#fbbf24] hover:from-white hover:to-[#fde68a] text-[#0e2533] font-[900] tracking-wide shadow-lantern border border-amber-400/30"
                >
                  <span className="w-6 h-6 rounded-full bg-[#0e2533] text-amber-300 flex items-center justify-center text-sm">+</span>
                  New Game
                </button>
                <div className="hidden sm:flex items-center gap-3 pl-3 ml-1 border-l border-white/10">
                  <div className="flex -space-x-1.5">
                    <span className="w-7 h-7 rounded-full bg-[#1e3a4f] border-2 border-[#070b14] flex items-center justify-center text-[10px]">🏮</span>
                    <span className="w-7 h-7 rounded-full bg-[#1a2a3a] border-2 border-[#070b14] flex items-center justify-center text-[10px]">🕵️</span>
                    <span className="w-7 h-7 rounded-full bg-[#f3ecd8] border-2 border-[#070b14] flex items-center justify-center text-[10px] font-black text-[#0e2533]">5</span>
                  </div>
                  <p className="text-xs leading-none"><span className="font-black text-white">{rooms.length} rooms open</span><br/><span className="text-white/50">Jump in — no password</span></p>
                </div>
              </div>
            </div>
            <div className="hidden lg:flex flex-col items-end gap-2 text-right">
              <div className="px-3 py-2 rounded-2xl bg-white/[0.06] border border-white/10 backdrop-blur">
                <p className="text-[10px] tracking-[0.16em] font-black text-white/45">FEATURED GAME</p>
                <p className="text-sm font-black text-white mt-1">Veil Street <span className="font-normal text-white/60">— hidden roles</span></p>
                <p className="text-xs text-amber-200/70 mt-0.5">Merlin • Percival • Morgana • Mordred • Oberon</p>
              </div>
              <p className="text-[11px] text-white/35">Tip: open on TV, friends join on phones</p>
            </div>
          </div>
        </div>
      </div>

      <main className="relative px-4 py-6 sm:py-8">
        <RoomBrowser onJoinRoom={handleJoinRoom} onSpectate={handleSpectate} onCreateClick={handleCreateClick} />
        {error && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-rose-600 text-white px-4 py-2.5 rounded-full shadow-xl text-sm font-bold z-50">{error}</div>}
      </main>

      <footer className="border-t border-white/[0.06] bg-[#070b14]/40 backdrop-blur">
        <div className="max-w-[1020px] mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
          <p className="text-white/35 tracking-wide">© Lucky Street — built for kitchen tables &amp; living rooms. <span className="text-amber-200/50">Stay lucky.</span></p>
          <p className="text-white/25">Pure Cloudflare • No sleep • Instant join</p>
        </div>
      </footer>

      {showOnboarding && <IdentityModal blocking={false} onDone={() => setShowOnboarding(false)} />}
      {showCreate && <CreateRoomModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />}
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MainPage />} />
      <Route path="/room/:roomId" element={<Lobby />} />
      <Route path="/room/:roomId/spectate" element={<Lobby spectate />} />
      <Route path="/admin" element={<AdminView />} />
    </Routes>
  );
}
