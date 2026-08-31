// TEXT LOCK — copy comes from client/src/content/copy.js:1 (do not hardcode new strings here)
import React, { useContext, useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { ProfileContext } from "./context/ProfileContext.jsx";
import { SocketContext } from "./context/SocketContext.jsx";
import IdentityModal from "./components/IdentityModal.jsx";
import RoomBrowser from "./components/RoomBrowser.jsx";
import CreateRoomModal from "./components/CreateRoomModal.jsx";
import Lobby from "./components/Lobby.jsx";
import AdminView from "./components/AdminView.jsx";
import { copy } from "./content/copy.js";

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
      {/* Top bar */}
      <header className="sticky top-0 z-20 backdrop-blur-xl bg-[#0a1e2e]/80 border-b border-white/[0.06]">
        <div className="max-w-[960px] mx-auto px-4 flex items-center justify-between h-[64px]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-300 to-orange-500 flex items-center justify-center shadow-lg">
              <span className="font-display font-black text-[#0a1e2e]">LS</span>
            </div>
            <div>
              <h1 className="font-display font-extrabold tracking-[0.12em] text-white leading-none">{copy.app.brand}</h1>
              <p className="text-[11px] tracking-[0.16em] text-white/50 font-medium -mt-0.5">{copy.app.sub}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-rose-400 animate-pulse"}`}></span>
            <span className="text-xs text-white/60 hidden sm:inline">{connected ? copy.app.live : copy.app.connecting}</span>
            {hasProfile ? (
              <div className="flex items-center gap-2 ml-2 pl-2 border-l border-white/10">
                <div
                  className="w-8 h-8 rounded-full border border-white/15 flex items-center justify-center overflow-hidden"
                  style={profile.avatar && !profile.avatar.startsWith("data:") ? { background: profile.avatar } : {}}
                >
                  {profile.avatar && profile.avatar.startsWith("data:") ? (
                    <img src={profile.avatar} alt="you" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-black text-white">{profile.username.slice(0,2).toUpperCase()}</span>
                  )}
                </div>
                <span className="text-sm font-bold text-white hidden sm:inline max-w-[100px] truncate">{profile.username}</span>
                <button onClick={() => setShowOnboarding(true)} className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-bold text-white/70">{copy.app.edit}</button>
              </div>
            ) : (
              <button onClick={() => setShowOnboarding(true)} className="ml-2 px-3 py-1.5 rounded-full bg-[#f3ecd8] text-[#0e2533] text-xs font-extrabold">{copy.app.setProfile}</button>
            )}
          </div>
        </div>
      </header>

      <main className="px-4 py-6 sm:py-8">
        <RoomBrowser onJoinRoom={handleJoinRoom} onSpectate={handleSpectate} onCreateClick={handleCreateClick} />
        {error && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-rose-600 text-white px-4 py-2.5 rounded-full shadow-xl text-sm font-bold">{error}</div>}
      </main>

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
