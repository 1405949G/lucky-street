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
    <div className={`fixed inset-0 z-[80] flex items-center justify-center p-4 ${blocking ? "bg-[#121416]/88 backdrop-blur-md" : "bg-[#121416]/76 backdrop-blur-md"}`}>
      <form onSubmit={handleSubmit} className="w-full max-w-[420px] rounded-[24px] glass-lantern shadow-2xl overflow-hidden animate-[slideUp_0.35s_ease-out]">
        <div className="relative h-[112px] overflow-hidden">
          <img src="/assets/hero-grey.svg" alt="" className="w-full h-full object-cover object-bottom opacity-88" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a1d1f] via-[#23272a]/55 to-transparent" />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#f9fafb] to-[#e5e7eb] border border-white/15 flex items-center justify-center shadow-cafe mx-auto">
              <svg viewBox="0 0 42 26" className="w-[28px] h-[18px]">
                <rect x="2" y="3" width="16.5" height="16.5" rx="3.2" fill="#f9fafb" stroke="rgba(0,0,0,0.08)" strokeWidth="0.7"/>
                <circle cx="6.2" cy="7.2" r="1.3" fill="#23272a"/><circle cx="14.3" cy="7.2" r="1.3" fill="#23272a"/>
                <circle cx="10.25" cy="11.25" r="1.4" fill="#6b7280"/><circle cx="6.2" cy="15.3" r="1.3" fill="#23272a"/><circle cx="14.3" cy="15.3" r="1.3" fill="#23272a"/>
                <rect x="23.5" y="3" width="16.5" height="16.5" rx="3.2" fill="#f9fafb" stroke="rgba(0,0,0,0.08)" strokeWidth="0.7"/>
                <circle cx="27.7" cy="7.2" r="1.3" fill="#23272a"/><circle cx="35.8" cy="7.2" r="1.3" fill="#23272a"/>
                <circle cx="31.75" cy="11.25" r="1.4" fill="#6b7280"/><circle cx="27.7" cy="15.3" r="1.3" fill="#23272a"/><circle cx="35.8" cy="15.3" r="1.3" fill="#23272a"/>
              </svg>
            </div>
            <h2 className="font-display font-[900] text-[18px] text-center text-white mt-2 leading-none">{title}</h2>
            <p className="text-xs text-white/60 text-center mt-1">Choose how you’ll appear to others.</p>
          </div>
        </div>
        <div className="px-6 pt-5 pb-2 text-center">
          {blockingNote && <p className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-white/70 text-xs font-bold">🔒 {blockingNote}</p>}
        </div>

        <div className="px-6 pb-6 space-y-4">
          <div>
            <label className="text-xs font-bold tracking-widest text-white/60">YOUR NAME</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g., Alex"
              maxLength={20}
              className="mt-1.5 w-full px-4 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 text-sm font-semibold outline-none focus:border-[#9ca3af]/45 focus:bg-white/15"
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
            className="w-full py-3.5 rounded-full bg-gradient-to-br from-[#fff8e7] via-[#f3ecd8] to-[#d88a63] hover:from-white hover:to-[#f3ecd8] disabled:opacity-50 text-[#1a1d1f] font-[900] tracking-wide shadow-cafe border border-[#c9734b]/18 transition-colors"
          >
            {submitting ? "Checking…" : blocking ? "Enter Lobby" : "Save & Continue"}
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
