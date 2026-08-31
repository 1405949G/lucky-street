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
    <div className="rounded-2xl bg-[#0f2231]/80 border border-white/10 p-4">
      <h3 className="font-extrabold text-white text-sm">Join by Room ID</h3>
      <p className="text-xs text-white/50 mt-1">Enter the 4-character code from your friend’s invite link.</p>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase().slice(0, 4))}
          placeholder="A1B2"
          maxLength={4}
          className="flex-1 px-3.5 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 font-mono font-bold tracking-[0.18em] text-center uppercase outline-none focus:border-[#3aa8d6]"
        />
        <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#f3ecd8] hover:bg-white text-[#0e2533] text-sm font-extrabold">Join</button>
      </form>
      {err && <p className="text-xs text-rose-400 mt-2">{err}</p>}
    </div>
  );
}
