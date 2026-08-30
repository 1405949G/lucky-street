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

  return (
    <div className="rounded-[22px] glass-lantern p-4 relative overflow-hidden">
      <div className="absolute -top-10 -right-10 w-24 h-24 bg-amber-400/10 blur-xl rounded-full pointer-events-none" />
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-xs">🔑</span>
        <h3 className="font-[900] text-white text-sm tracking-wide">Step in with code</h3>
      </div>
      <p className="text-xs text-white/50 mt-1.5 leading-relaxed">Got a 4-letter street code? Enter it — the lanterns will guide you.</p>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase().slice(0, 4))}
          placeholder="A1B2"
          maxLength={4}
          className="flex-1 px-3.5 py-3 rounded-2xl bg-white/[0.07] border border-white/15 text-white placeholder:text-white/25 font-mono font-[900] tracking-[0.22em] text-center uppercase outline-none focus:border-amber-400/40 focus:bg-white/[0.09] backdrop-blur"
        />
        <button type="submit" className="px-6 py-3 rounded-2xl bg-gradient-to-br from-[#fffbeb] via-[#fde68a] to-[#fbbf24] hover:from-white hover:to-[#fde68a] text-[#0e2533] text-sm font-[900] shadow-lantern-soft border border-amber-400/20">Join</button>
      </form>
      {err && <p className="text-xs text-rose-300 mt-2 font-bold bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">{err}</p>}
      <p className="text-[11px] text-white/25 mt-2 text-center tracking-wide">Codes are short — e.g. <span className="font-mono font-bold text-amber-200/60">7K2P</span> • Share links also work</p>
    </div>
  );
}
