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
      {/* Top bar — board café */}
      <header className="sticky top-0 z-20 backdrop-blur-xl bg-[#121416]/84 border-b border-white/[0.07] shadow-[0_8px_32px_rgba(0,0,0,0.38)]">
        <div className="absolute inset-0 pointer-events-none opacity-[0.28]" style={{ background: "radial-gradient(ellipse 520px 120px at 22% 0%, rgba(201,115,75,0.14), transparent 68%), radial-gradient(ellipse 520px 120px at 88% 0%, rgba(138,168,153,0.10), transparent 68%)" }} />
        <div className="relative max-w-[1020px] mx-auto px-4 flex items-center justify-between h-[68px]">
          <div className="flex items-center gap-3.5">
            {/* Café logo — two dice of 5 = 10 */}
            <div className="relative">
              <div className="absolute -inset-2 bg-[#c9734b]/14 blur-xl rounded-full" />
              <div className="relative w-[46px] h-[42px] rounded-[13px] bg-gradient-to-br from-[#2e3336] to-[#1a1d1f] border border-[#c9734b]/22 flex items-center justify-center shadow-cafe overflow-hidden">
                <div className="absolute inset-0 opacity-[0.08]" style={{ background: "radial-gradient(circle at 50% 28%, #f3ecd8, transparent 62%)" }} />
                <svg viewBox="0 0 42 26" className="w-[32px] h-[20px] drop-shadow-[0_1px_6px_rgba(201,115,75,0.28)]" aria-hidden="true">
                  {/* left die — 5 */}
                  <rect x="2" y="3" width="16.5" height="16.5" rx="3.2" fill="#fff8e7" stroke="rgba(0,0,0,0.08)" strokeWidth="0.7"/>
                  <circle cx="6.2" cy="7.2" r="1.35" fill="#23272a"/><circle cx="14.3" cy="7.2" r="1.35" fill="#23272a"/>
                  <circle cx="10.25" cy="11.25" r="1.45" fill="#c9734b"/><circle cx="6.2" cy="15.3" r="1.35" fill="#23272a"/><circle cx="14.3" cy="15.3" r="1.35" fill="#23272a"/>
                  {/* right die — 5, slightly offset for depth */}
                  <rect x="23.5" y="3" width="16.5" height="16.5" rx="3.2" fill="#fff8e7" stroke="rgba(0,0,0,0.08)" strokeWidth="0.7"/>
                  <circle cx="27.7" cy="7.2" r="1.35" fill="#23272a"/><circle cx="35.8" cy="7.2" r="1.35" fill="#23272a"/>
                  <circle cx="31.75" cy="11.25" r="1.45" fill="#c9734b"/><circle cx="27.7" cy="15.3" r="1.35" fill="#23272a"/><circle cx="35.8" cy="15.3" r="1.35" fill="#23272a"/>
                  {/* subtle 10 hint — tiny + between */}
                  <circle cx="21" cy="11.2" r="0.9" fill="#c9734b" opacity="0.0"/>
                </svg>
              </div>
            </div>
            <div>
              <h1 className="font-display font-[900] tracking-[0.14em] text-white leading-none text-[15px] sm:text-[16px]">LUCKY STREET</h1>
              <div className="flex items-center gap-1.5 -mt-0.5">
                <span className="hidden sm:inline w-[18px] h-[1px] bg-[#c9734b]/40" />
                <p className="text-[10px] tracking-[0.22em] text-[#f3ecd8]/55 font-[700]">PARTY LOBBY</p>
                <span className="hidden sm:inline w-[18px] h-[1px] bg-[#c9734b]/40" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className={`hidden sm:flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-full border text-xs font-bold backdrop-blur ${connected ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-[#c9734b]/10 border-[#c9734b]/20 text-[#f3ecd8] animate-pulse"}`}>
              <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.7)]" : "bg-[#c9734b]"}`} style={connected ? { animation: "flicker 2.4s ease-in-out infinite" } : {}} />
              {connected ? "Live" : "Connecting…"}
            </div>
            {hasProfile ? (
              <div className="flex items-center gap-2.5 ml-1 pl-2.5 border-l border-white/10">
                <div
                  className="w-9 h-9 rounded-full border-[1.5px] flex items-center justify-center overflow-hidden shadow-md relative"
                  style={{
                    borderColor: "rgba(201,115,75,0.30)",
                    background: profile.avatar && !profile.avatar.startsWith("data:") ? profile.avatar : "linear-gradient(135deg, #2e3336, #1a1d1f)",
                    boxShadow: "0 0 12px rgba(201,115,75,0.16)"
                  }}
                >
                  {profile.avatar && profile.avatar.startsWith("data:") ? (
                    <img src={profile.avatar} alt="you" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[11px] font-black text-white tracking-widest">{profile.username.slice(0,2).toUpperCase()}</span>
                  )}
                </div>
                <span className="text-sm font-bold text-white hidden sm:inline max-w-[100px] truncate">{profile.username}</span>
                <button onClick={() => setShowOnboarding(true)} className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-bold text-white/70">Edit</button>
              </div>
            ) : (
              <button onClick={() => setShowOnboarding(true)} className="ml-1 px-3 py-1.5 rounded-full bg-[#f3ecd8] text-[#1a1d1f] text-xs font-extrabold">Set Profile</button>
            )}
          </div>
        </div>
      </header>

      {/* Hero — board café — larger, no cut-off */}
      <div className="relative overflow-hidden border-b border-white/[0.06] min-h-[380px] sm:min-h-[440px] flex items-center">
        <div className="absolute inset-0">
          <img src="/assets/hero-cafe.svg" alt="" className="w-full h-full object-cover object-bottom opacity-[0.98] scale-[1.04]" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#121416]/10 via-[#121416]/26 to-[#121416]/92" />
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 820px 420px at 50% 72%, rgba(201,115,75,0.10), transparent 66%)" }} />
        </div>
        <div className="relative max-w-[1020px] mx-auto px-4 py-10 sm:py-14 w-full">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div className="max-w-[640px]">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.08] border border-white/10 backdrop-blur-md">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
                <span className="text-[11px] font-black tracking-[0.18em] text-white/85">PARTY LOBBY • 5-10 FRIENDS • 1 TV + PHONES</span>
                <span className="hidden sm:inline-flex ml-1 px-1.5 py-0.5 rounded-full bg-[#c9734b] text-white text-[10px] font-black">NEW</span>
              </div>
              <h2 className="mt-3 font-display font-[900] leading-[0.9] tracking-[-0.02em] text-white">
                <span className="block text-[32px] sm:text-[42px]">Gather on</span>
                <span className="block text-[38px] sm:text-[52px] bg-gradient-to-r from-[#fff8e7] via-[#f3ecd8] to-[#d88a63] bg-clip-text text-transparent" style={{ textShadow: "0 0 22px rgba(201,115,75,0.28)" }}>Lucky Street</span>
              </h2>
              <p className="mt-3 text-[15px] sm:text-[16px] leading-relaxed text-white/78 max-w-[560px]">A cozy party lobby. Create a room, share the code, play <span className="font-bold text-[#f3ecd8]">Veil Street</span> — bluff, deduce, and hunt Merlin.</p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  onClick={handleCreateClick}
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-gradient-to-br from-[#fff8e7] via-[#f3ecd8] to-[#d88a63] hover:from-white hover:to-[#f3ecd8] text-[#1a1d1f] font-[900] tracking-wide shadow-cafe border border-[#c9734b]/20 text-[15px]"
                >
                  <span className="w-7 h-7 rounded-full bg-[#1a1d1f] text-[#f3ecd8] flex items-center justify-center text-[16px]">+</span>
                  New Game
                </button>
                <div className="hidden sm:flex items-center gap-3 pl-3 ml-1 border-l border-white/10">
                  <div className="flex -space-x-1.5">
                    <span className="w-7 h-7 rounded-full bg-[#8aa899] border-2 border-[#121416] flex items-center justify-center text-[10px]">🎲</span>
                    <span className="w-7 h-7 rounded-full bg-[#c9734b] border-2 border-[#121416] flex items-center justify-center text-[10px]">🃏</span>
                    <span className="w-7 h-7 rounded-full bg-[#f3ecd8] border-2 border-[#121416] flex items-center justify-center text-[10px] font-black text-[#1a1d1f]">5</span>
                  </div>
                  <p className="text-xs leading-none"><span className="font-black text-white">{rooms.length} rooms open</span><br/><span className="text-white/50">Jump in — no password</span></p>
                </div>
              </div>
            </div>
            <div className="hidden lg:flex flex-col items-end gap-2 text-right">
              <div className="px-3 py-2 rounded-2xl bg-white/[0.06] border border-white/10 backdrop-blur">
                <p className="text-[10px] tracking-[0.16em] font-black text-white/45">FEATURED GAME</p>
                <p className="text-sm font-black text-white mt-1">Veil Street <span className="font-normal text-white/60">— hidden roles</span></p>
                <p className="text-xs text-[#f3ecd8]/70 mt-0.5">Merlin • Percival • Morgana • Mordred • Oberon</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="relative px-4 py-8 sm:py-10 min-h-[52vh]">
        <div className="absolute inset-0 pointer-events-none opacity-[0.04]" style={{ background: "radial-gradient(ellipse 680px 380px at 22% 12%, rgba(201,115,75,0.18), transparent 68%), radial-gradient(ellipse 520px 320px at 88% 28%, rgba(138,168,153,0.14), transparent 68%)" }} />
        <div className="relative">
          <RoomBrowser onJoinRoom={handleJoinRoom} onSpectate={handleSpectate} onCreateClick={handleCreateClick} />
        </div>
        {error && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-rose-600 text-white px-4 py-2.5 rounded-full shadow-xl text-sm font-bold z-50">{error}</div>}
      </main>

      <footer className="border-t border-white/[0.06] bg-[#121416]/40 backdrop-blur">
        <div className="max-w-[1020px] mx-auto px-4 py-4 flex items-center justify-center text-xs">
          <p className="text-white/35 tracking-wide">© Lucky Street</p>
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
