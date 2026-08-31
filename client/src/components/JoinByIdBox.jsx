import React, { useState } from "react";

export default function JoinByIdBox({ onJoin }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState(null);

  function submit(e) {
    e.preventDefault();
    setErr(null);
    const c = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(c)) return setErr("Enter 4-character ID (A-Z, 0-9)");
    onJoin(c);
  }

  function extractCode(raw) {
    const s = raw.toUpperCase().trim();
    // If it's a share link like https://.../room/OK6W — take last segment after /
    if (s.includes("/")) {
      const last = s.split("/").pop().split("?")[0].split("#")[0];
      const cleaned = last.replace(/[^A-Z0-9]/g, "").slice(0, 4);
      if (/^[A-Z0-9]{4}$/.test(cleaned)) return cleaned;
    }
    // Otherwise take last 4 alphanumerics (handles pasted link)
    const alnum = s.replace(/[^A-Z0-9]/g, "");
    return alnum.slice(-4).slice(0, 4);
  }

  return (
    <div className="rounded-[22px] glass-lantern p-4 relative overflow-hidden">
      <div className="absolute -top-10 -right-10 w-24 h-24 bg-[#c9734b]/10 blur-xl rounded-full pointer-events-none" />
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-sm">🔑</span>
        <h3 className="font-[900] text-white text-sm tracking-wide">Join by Room ID</h3>
      </div>
      <p className="text-xs text-white/50 mt-1.5 leading-relaxed">Enter the 4-character code from your friend’s invite link.</p>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          value={code}
          onChange={e => setCode(extractCode(e.target.value))}
          onPaste={e => {
            const pasted = (e.clipboardData || window.clipboardData).getData("text");
            const extracted = extractCode(pasted);
            if (extracted.length === 4) {
              e.preventDefault();
              setCode(extracted);
            }
          }}
          placeholder="A1B2"
          maxLength={12}
          className="flex-1 px-4 py-3 rounded-2xl bg-[#1a1d1f] border border-white/15 text-white placeholder:text-white/30 font-mono font-[900] tracking-[0.22em] text-center uppercase outline-none focus:border-[#c9734b]/40"
        />
        <button type="submit" className="px-6 py-3 rounded-2xl bg-gradient-to-br from-[#fff8e7] via-[#f3ecd8] to-[#d88a63] hover:from-white hover:to-[#f3ecd8] text-[#1a1d1f] text-sm font-[900] shadow-cafe border border-[#c9734b]/18">Join</button>
      </form>
      {err && <p className="text-xs text-rose-300 mt-2 font-bold bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">{err}</p>}
      <p className="text-[11px] text-white/25 mt-2 text-center tracking-wide">Codes are short — e.g. <span className="font-mono font-bold text-amber-200/60">7K2P</span> • Share links also work</p>
    </div>
  );
}
