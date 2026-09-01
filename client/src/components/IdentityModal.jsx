// TEXT LOCK — strings from client/src/content/copy.js:1 (do not edit text here without explicit user prompt)
﻿/**
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
  const { socket, profileError, clearProfileError } = useContext(SocketContext);

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

  // Clear stale taken error that belongs to own name when modal opens
  useEffect(() => {
    const isOwn = (username.trim().toLowerCase() === (profile?.username || "").toLowerCase());
    if (isOwn && profileError && /already taken/i.test(profileError)) clearProfileError?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Clear local error when user starts typing
  useEffect(() => { if (localError) setLocalError(null); }, [username]);

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
      setSubmitting(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setSubmitting(false);
        setLocalError("Connection is slow - please try again");
      }, 6000);
      const next = { username: trimmed, avatar, avatarType: "color" };
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
    <div className={`fixed inset-0 z-[80] flex items-center justify-center p-4 ${blocking ? "bg-[#070b14]/90 backdrop-blur-md" : "bg-[#070b14]/80 backdrop-blur-md"}`}>
      <form onSubmit={handleSubmit} className="w-full max-w-[420px] rounded-[24px] bg-[#142a3d] border border-white/10 shadow-2xl overflow-hidden animate-[slideUp_0.25s_ease-out]">
        <div className="px-6 pt-6 pb-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20 mx-auto">
            <span className="font-display font-black text-[#0a1e2e] text-xl">LS</span>
          </div>
          <h2 className="font-display font-extrabold text-[20px] text-center text-[#f3ecd8] mt-3">{title}</h2>
          <p className="text-sm text-white/60 text-center mt-1">
            Choose how you’ll appear to others.
          </p>
          {blockingNote && <p className="text-xs text-amber-200/80 text-center mt-2 font-medium">🔒 {blockingNote}</p>}
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

          {(() => {
            const isOwnName = username.trim().toLowerCase() === (profile?.username || "").toLowerCase();
            const isTaken = (m) => /already taken/i.test(m || "");
            let displayError = null;
            if (localError) {
              // Don't show taken error when it's about own name (stale)
              if (!(isOwnName && isTaken(localError))) displayError = localError;
            } else if (profileError) {
              if (!isOwnName) displayError = profileError;
              // isOwnName -> hide profileError entirely (was stale from previous attempt)
            }
            return displayError ? (
              <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-2.5">
                <p className="text-xs font-bold text-rose-300">{displayError}</p>
              </div>
            ) : null;
          })()}

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
            You can change your name and avatar anytime.
          </p>
        </div>
      </form>
    </div>
  );
}
