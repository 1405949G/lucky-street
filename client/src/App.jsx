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
    <div className="min-h-screen flex flex-col bg-[#121416]">
      {/* Header — solid, anchored top */}
      <header className="flex-shrink-0 bg-[#121416] border-b border-white/[0.07] shadow-[0_8px_32px_rgba(0,0,0,0.38)]">
        <div className="max-w-[1020px] mx-auto px-4 flex items-center justify-between h-[68px]">
          <div className="flex items-center gap-3.5">
            <div className="relative w-[46px] h-[42px] rounded-[13px] bg-[#2e3336] border border-white/10 flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.28)] overflow-hidden">
              <svg viewBox="0 0 42 26" className="w-[32px] h-[20px]" aria-hidden="true">
                <rect x="2" y="3" width="16.5" height="16.5" rx="3.2" fill="#e5e7eb" stroke="rgba(0,0,0,0.12)" strokeWidth="0.7"/>
                <circle cx="6.2" cy="7.2" r="1.35" fill="#1a1d1f"/><circle cx="14.3" cy="7.2" r="1.35" fill="#1a1d1f"/>
                <circle cx="10.25" cy="11.25" r="1.45" fill="#6b7280"/><circle cx="6.2" cy="15.3" r="1.35" fill="#1a1d1f"/><circle cx="14.3" cy="15.3" r="1.35" fill="#1a1d1f"/>
                <rect x="23.5" y="3" width="16.5" height="16.5" rx="3.2" fill="#e5e7eb" stroke="rgba(0,0,0,0.12)" strokeWidth="0.7"/>
                <circle cx="27.7" cy="7.2" r="1.35" fill="#1a1d1f"/><circle cx="35.8" cy="7.2" r="1.35" fill="#1a1d1f"/>
                <circle cx="31.75" cy="11.25" r="1.45" fill="#6b7280"/><circle cx="27.7" cy="15.3" r="1.35" fill="#1a1d1f"/><circle cx="35.8" cy="15.3" r="1.35" fill="#1a1d1f"/>
              </svg>
            </div>
            <div>
              <h1 className="font-display font-[900] tracking-[0.14em] text-white leading-none text-[15px] sm:text-[16px]">LUCKY STREET</h1>
              <p className="text-[10px] tracking-[0.22em] text-white/55 font-[700] -mt-0.5">PARTY LOBBY</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold ${connected ? "bg-[#1e2326] border-white/10 text-emerald-300" : "bg-[#1e2326] border-white/10 text-white/60 animate-pulse"}`}>
              <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-white/40"}`} />
              {connected ? "Live" : "Connecting…"}
            </div>
            {hasProfile ? (
              <div className="flex items-center gap-2.5 ml-1 pl-2.5 border-l border-white/10">
                <div
                  className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center overflow-hidden shadow-md"
                  style={{
                    background: profile.avatar && !profile.avatar.startsWith("data:") ? profile.avatar : "#23272a",
                  }}
                >
                  {profile.avatar && profile.avatar.startsWith("data:") ? (
                    <img src={profile.avatar} alt="you" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[11px] font-black text-white tracking-widest">{profile.username.slice(0,2).toUpperCase()}</span>
                  )}
                </div>
                <span className="text-sm font-bold text-white hidden sm:inline max-w-[100px] truncate">{profile.username}</span>
                <button onClick={() => setShowOnboarding(true)} className="px-2.5 py-1 rounded-full bg-[#23272a] hover:bg-[#2e3336] border border-white/10 text-xs font-bold text-white/70">Edit</button>
              </div>
            ) : (
              <button onClick={() => setShowOnboarding(true)} className="px-4 py-2 rounded-full bg-[#f3ecd8] text-[#1a1d1f] text-xs font-extrabold">Set Profile</button>
            )}
          </div>
        </div>
      </header>

      {/* Hero — covers entire middle, header top + footer bottom anchored */}
      <div className="flex-1 relative flex flex-col">
        {/* Full-screen hero background */}
        <div className="absolute inset-0">
          <img src="/assets/hero-grey.svg" alt="" className="w-full h-full object-cover object-center" />
          <div className="absolute inset-0 bg-[#121416]/72" />
        </div>

        {/* One big opaque border containing everything */}
        <div className="relative flex-1 flex flex-col max-w-[1020px] mx-auto w-full px-4 py-6 sm:py-8">
          <div className="flex-1 bg-[#1e2326] border border-white/10 rounded-[24px] shadow-2xl p-5 sm:p-8 flex flex-col gap-6">
            {/* Inner: Gather + New Game — in its own solid border */}
            <div className="bg-[#23272a] border border-white/10 rounded-[20px] p-6 sm:p-7">
              <h2 className="font-display font-[900] leading-[0.9] tracking-[-0.02em] text-white">
                <span className="block text-[32px] sm:text-[42px]">Gather on</span>
                <span className="block text-[38px] sm:text-[52px] text-white">Lucky Street</span>
              </h2>
              <p className="mt-3 text-[15px] sm:text-[16px] leading-relaxed text-white/70 max-w-[560px]">A cozy party lobby. Create a room, share the code, play <span className="font-bold text-white">Veil Street</span> — bluff, deduce, and hunt Merlin.</p>
              <div className="mt-5">
                <button
                  onClick={handleCreateClick}
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-[#f3ecd8] hover:bg-white text-[#1a1d1f] font-[900] tracking-wide border border-white/10 text-[15px] shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
                >
                  <span className="w-7 h-7 rounded-full bg-[#1a1d1f] text-[#f3ecd8] flex items-center justify-center text-[16px]">+</span>
                  New Game
                </button>
              </div>
            </div>

            {/* Inner: Game Rooms — smaller borders within */}
            <div className="flex-1">
              <RoomBrowser onJoinRoom={handleJoinRoom} onSpectate={handleSpectate} onCreateClick={handleCreateClick} />
            </div>
          </div>
        </div>
      </div>

      {/* Footer — solid, anchored bottom */}
      <footer className="flex-shrink-0 bg-[#121416] border-t border-white/[0.06]">
        <div className="max-w-[1020px] mx-auto px-4 py-4 flex items-center justify-center text-xs">
          <p className="text-white/35 tracking-wide">© Lucky Street</p>
        </div>
      </footer>

      {showOnboarding && <IdentityModal blocking={false} onDone={() => setShowOnboarding(false)} />}
      {showCreate && <CreateRoomModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />}
      {error && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-rose-600 text-white px-4 py-2.5 rounded-full shadow-xl text-sm font-bold z-50">{error}</div>}
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
