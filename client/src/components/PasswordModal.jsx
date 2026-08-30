import React, { useState } from "react";

export default function PasswordModal({ roomId, onSubmit, onClose }) {
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState(null);

  function submit(e) {
    e.preventDefault();
    if (!pwd) return setErr("Password required");
    onSubmit(pwd);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#070b14]/70 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-[360px] rounded-2xl bg-[#142a3d] border border-white/10 p-6 shadow-2xl">
        <h3 className="font-extrabold text-white">🔒 Private Room</h3>
        <p className="text-sm text-white/60 mt-1">Room <span className="font-mono font-bold text-white">{roomId}</span> is password-protected.</p>
        <input
          value={pwd}
          onChange={e => setPwd(e.target.value)}
          placeholder="Enter room password"
          type="password"
          className="mt-4 w-full px-3.5 py-3 rounded-xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 text-sm outline-none focus:border-amber-400/50"
          autoFocus
        />
        {err && <p className="text-xs text-rose-400 mt-2">{err}</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-bold">Cancel</button>
          <button type="submit" className="flex-1 py-2.5 rounded-xl bg-[#f3ecd8] hover:bg-white text-[#0e2533] font-extrabold">Join</button>
        </div>
      </form>
    </div>
  );
}
