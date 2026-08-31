import React, { useState } from "react";

export default function PasswordModal({ roomId, onSubmit, onClose, error, clearError }) {
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState(null);
  const displayErr = err || error;

  function submit(e) {
    e.preventDefault();
    if (!pwd) return setErr("Please enter the password");
    if (clearError) clearError();
    setErr(null);
    onSubmit(pwd);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#070b14]/70 -sm">
      <form onSubmit={submit} className="w-full max-w-[360px] rounded-2xl bg-[#142a3d] border border-white/10 p-6 shadow-2xl">
        <h3 className="font-extrabold text-white">🔒 Private Room</h3>
        <p className="text-sm text-white/60 mt-1">Room <span className="font-mono font-bold text-white">{roomId}</span> is password-protected.</p>
        <input
          value={pwd}
          onChange={e => { setPwd(e.target.value); if (err) setErr(null); if (clearError) clearError(); }}
          placeholder="Enter room password"
          type="password"
          className="mt-4 w-full px-3.5 py-3 rounded-xl bg-[#23272a] border border-white/15 text-white placeholder:text-white/30 text-sm outline-none focus:border-amber-400/50 focus:bg-[#1e2326]"
          autoFocus
        />
        {displayErr && <div className="mt-3 rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-2.5"><p className="text-xs font-bold text-rose-300">{displayErr}</p></div>}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-[#23272a] hover:bg-[#1e2326] border border-white/10 text-white font-bold">Cancel</button>
          <button type="submit" className="flex-1 py-2.5 rounded-xl bg-[#f3ecd8] hover:bg-white text-[#0e2533] font-extrabold">Join</button>
        </div>
      </form>
    </div>
  );
}
