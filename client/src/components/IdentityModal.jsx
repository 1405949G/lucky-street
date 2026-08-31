/**
 * IdentityModal - onboarding
 * Shows once, remembers you next time. Blocking variant for direct room links.
 */

import React, { useContext, useEffect, useRef, useState } from "react";
import { ProfileContext } from "../context/ProfileContext.jsx";
import { SocketContext } from "../context/SocketContext.jsx";
import AvatarPicker from "./AvatarPicker.jsx";
import { PALETTE } from "../utils/avatar.js";

export default function IdentityModal({ blocking = false, onDone, title = "Welcome to Lucky Street" }) {
  const { profile, setProfile } = useContext(ProfileContext);
  const { socket, profileError } = useContext(SocketContext);

  const [username, setUsername] = useState(() => profile?.username || "");
  const [avatar, setAvatar] = useState(() => {
    const a = profile?.avatar || PALETTE[0];
    return typeof a === "string" && a.startsWith("data:image") ? PALETTE[0] : a;
  });
  const [localError, setLocalError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (profile?.username) setUsername(profile.username);
    if (profile?.avatar) {
      const a = profile.avatar;
      setAvatar(typeof a === "string" && a.startsWith("data:image") ? PALETTE[0] : a);
    }
  }, [profile]);

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  async function handleSubmit(e) {
    e?.preventDefault();
    setLocalError(null);
    const trimmed = username.trim();
    if (!trimmed) return setLocalError("What should we call you?");
    if (trimmed.length < 2) return setLocalError("Name is too short");
    if (trimmed.length > 20) return setLocalError("That name is a bit long");
    if (!/^[\p{L}\p{N} _'\-.]+$/u.test(trimmed)) return setLocalError("Use letters, numbers and - _ ' .");

    const isEdit = !!profile?.username && !blocking;
    if (isEdit) {
      const prev = profile;
      const nextOptimistic = { username: trimmed, avatar, avatarType: "color" };
      setProfile(nextOptimistic);
      onDone?.(nextOptimistic);
      if (socket) {
        socket.emit("profile:register", { username: trimmed, avatar }, (res) => {
          if (!res?.ok) {
            // Revert on name taken, show toast via localError if modal still mounted, else via alert
            setProfile(prev);
            const msg = res?.error || "That name is taken - try another";
            // Try to show in modal if still open, otherwise toast
            setLocalError(msg);
            // Also show as alert if modal closed
            setTimeout(() => alert(msg), 100);
          }
        });
      }
      return;
    }

    setSubmitting(true);

    const next = { username: trimmed, avatar, avatarType: "color" };

    if (socket && !socket.connected && !socket.id) {
      setSubmitting(false);
      setLocalError("Not connected - please wait a moment and try again");
      return;
    }

    // Safety: if server doesn't answer in 6s, stop spinning and show friendly error
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setSubmitting(false);
      setLocalError("Connection is slow - please try again");
    }, 6000);

    if (socket) {
      socket.emit("profile:register", { username: trimmed, avatar }, (res) => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setSubmitting(false);
        if (res?.ok) {
          setProfile(next);
          setLocalError(null);
          onDone?.(next);
        } else {
          setLocalError(res?.error || profileError || "That name is taken - try another");
        }
      });
    } else {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setProfile(next);
      setSubmitting(false);
      onDone?.(next);
    }
  }

  const blockingNote = blocking ? "Choose a name to join" : null;

  return (
    <div className={`fixed inset-0 z-[80] flex items-center justify-center p-4 ${blocking ? "bg-[#070b14]/90 backdrop-blur-md" : "bg-[#070b14]/78 backdrop-blur-md"}`}>
      <form onSubmit={handleSubmit} className="w-full max-w-[420px] rounded-[24px] glass-lantern shadow-2xl overflow-hidden animate-[slideUp_0.35s_ease-out]">
        <div className="relative h-[112px] overflow-hidden">
          <img src="/assets/hero-street.svg" alt="" className="w-full h-full object-cover object-top opacity-85" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#132a3d] via-[#0f2231]/50 to-transparent" />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#fffbeb] to-[#fde68a] border border-amber-400/30 flex items-center justify-center shadow-lantern mx-auto">
              <svg viewBox="0 0 32 38" className="w-[20px] h-[24px]"><ellipse cx="16" cy="19" rx="13" ry="13" fill="url(#idGlow)"/><defs><radialGradient id="idGlow" cx="50%" cy="38%" r="58%"><stop offset="0%" stopColor="#fffbeb"/><stop offset="55%" stopColor="#fbbf24"/><stop offset="100%" stopColor="#f59e0b"/></radialGradient></defs><g transform="translate(16 19) scale(0.72)"><path d="M-10 -11 H10 L8 9 H-8 Z" fill="#0f2231" stroke="#fbbf24" strokeWidth="1.1"/><rect x="-9" y="-11" width="18" height="2.2" rx="1" fill="#fbbf24"/><rect x="-8" y="9" width="16" height="1.8" rx="1" fill="#fbbf24"/><rect x="-7" y="-8" width="14" height="14" rx="1.2" fill="#fff7d6"/><ellipse cx="0" cy="-1" rx="3" ry="3.8" fill="#f59e0b"/><ellipse cx="0.5" cy="-1.4" rx="1.5" ry="2" fill="#fffbeb"/></g></svg>
            </div>
            <h2 className="font-display font-[900] text-[18px] text-center text-white mt-2 leading-none">{title}</h2>
            <p className="text-xs text-amber-200/70 text-center mt-1 font-bold tracking-wide">Choose your lantern on the street</p>
          </div>
        </div>
        <div className="px-6 pt-5 pb-2 text-center">
          {blockingNote && <p className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/12 border border-amber-400/20 text-amber-200 text-xs font-bold">🔒 {blockingNote}</p>}
        </div>

        <div className="px-6 pb-6 space-y-4">
          <div>
            <label className="text-xs font-bold tracking-widest text-white/60">YOUR NAME</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g., Alex"
              maxLength={20}
              className="mt-1.5 w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 text-sm font-semibold outline-none focus:border-amber-400/60 focus:bg-white/15"
              autoFocus
            />
            <p className="text-[11px] text-white/30 mt-1">Others will see this.</p>
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
            className="w-full py-3.5 rounded-full bg-gradient-to-br from-[#fffbeb] via-[#fde68a] to-[#fbbf24] hover:from-white hover:to-[#fde68a] disabled:opacity-50 text-[#0e2533] font-[900] tracking-wide shadow-lantern border border-amber-400/20 transition-colors"
          >
            {submitting ? "Lighting…" : blocking ? "Step onto the street →" : "Save lantern"}
          </button>

          {!blocking && profile?.username && (
            <button type="button" onClick={() => onDone?.(profile)} className="w-full text-xs text-white/40 hover:text-white/70">
              Cancel
            </button>
          )}

          <p className="text-[11px] text-white/25 text-center">
            You can change your name and avatar anytime.
          </p>
        </div>
      </form>
    </div>
  );
}
