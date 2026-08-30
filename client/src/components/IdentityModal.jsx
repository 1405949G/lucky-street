/**
 * IdentityModal — Spec 1
 * First-time: prompt username + avatar. Save to localStorage.
 * Persistence: profile cached, bypass onboarding on return.
 * Blocking: when `blocking` prop true, overlay cannot be dismissed.
 */

import React, { useContext, useEffect, useState } from "react";
import { ProfileContext } from "../context/ProfileContext.jsx";
import { SocketContext } from "../context/SocketContext.jsx";
import AvatarPicker from "./AvatarPicker.jsx";
import { PALETTE } from "../utils/avatar.js";

export default function IdentityModal({ blocking = false, onDone, title = "Welcome to Lucky Street" }) {
  const { profile, setProfile } = useContext(ProfileContext);
  const { socket, profileError, registerProfile } = useContext(SocketContext);

  const [username, setUsername] = useState(() => profile?.username || "");
  const [avatar, setAvatar] = useState(() => profile?.avatar || PALETTE[0]);
  const [localError, setLocalError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (profile?.username) setUsername(profile.username);
    if (profile?.avatar) setAvatar(profile.avatar);
  }, [profile]);

  async function handleSubmit(e) {
    e?.preventDefault();
    setLocalError(null);
    const trimmed = username.trim();
    if (!trimmed) return setLocalError("Username is required");
    if (trimmed.length < 2) return setLocalError("Username must be at least 2 characters");
    if (trimmed.length > 20) return setLocalError("Username too long (max 20)");
    if (!/^[\p{L}\p{N} _'\-.]+$/u.test(trimmed)) return setLocalError("Invalid characters");

    setSubmitting(true);
    // optimistic local save
    const next = { username: trimmed, avatar, avatarType: avatar?.startsWith("data:") ? "image" : "color" };
    // Try server registration first to enforce uniqueness
    if (socket) {
      socket.emit("profile:register", { username: trimmed, avatar }, (res) => {
        setSubmitting(false);
        if (res?.ok) {
          setProfile(next);
          setLocalError(null);
          onDone?.(next);
        } else {
          setLocalError(res?.error || profileError || "Username taken — choose another");
        }
      });
    } else {
      // offline fallback
      setProfile(next);
      setSubmitting(false);
      onDone?.(next);
    }
  }

  const blockingNote = blocking ? "Complete your profile to enter this room. This blocks the lobby." : null;

  return (
    <div className={`fixed inset-0 z-[80] flex items-center justify-center p-4 ${blocking ? "bg-[#070b14]/90 backdrop-blur-md" : "bg-[#070b14]/80 backdrop-blur-md"}`}>
      <form onSubmit={handleSubmit} className="w-full max-w-[420px] rounded-[24px] bg-[#142a3d] border border-white/10 shadow-2xl overflow-hidden animate-[slideUp_0.25s_ease-out]">
        <div className="px-6 pt-6 pb-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20 mx-auto">
            <span className="font-display font-black text-[#0a1e2e] text-xl">LS</span>
          </div>
          <h2 className="font-display font-extrabold text-[20px] text-center text-[#f3ecd8] mt-3">{title}</h2>
          <p className="text-sm text-white/60 text-center mt-1">
            Choose a unique username and avatar. Saved in your browser (localStorage) — you’ll skip this next time.
          </p>
          {blockingNote && <p className="text-xs text-amber-300/80 text-center mt-2 font-medium">🔒 {blockingNote}</p>}
        </div>

        <div className="px-6 pb-6 space-y-4">
          <div>
            <label className="text-xs font-bold tracking-widest text-white/60">USERNAME *</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g., LuckyCharm"
              maxLength={20}
              className="mt-1.5 w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 text-sm font-semibold outline-none focus:border-amber-400/60 focus:bg-white/15"
              autoFocus
            />
            <p className="text-[11px] text-white/30 mt-1">Globally unique across active sessions — server rejects duplicates.</p>
          </div>

          <AvatarPicker value={avatar} onChange={setAvatar} />

          {(localError || profileError) && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-2.5">
              <p className="text-xs font-bold text-rose-300">{localError || profileError}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 rounded-full bg-[#f3ecd8] hover:bg-white disabled:opacity-50 text-[#0e2533] font-extrabold tracking-wide shadow-md transition-colors"
          >
            {submitting ? "Checking…" : blocking ? "Enter Lobby" : "Save & Continue"}
          </button>

          {!blocking && profile?.username && (
            <button type="button" onClick={() => onDone?.(profile)} className="w-full text-xs text-white/40 hover:text-white/70">
              Cancel
            </button>
          )}

          <p className="text-[11px] text-white/25 text-center">
            Avatar images are stored as Base64 in localStorage. Name expires 5 min after disconnect (GC).
          </p>
        </div>
      </form>
    </div>
  );
}
