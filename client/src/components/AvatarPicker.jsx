import React, { useState } from "react";
import { PALETTE } from "../utils/avatar.js";

export default function AvatarPicker({ value, onChange }) {
  const [error, setError] = useState(null);

  // Solid colours only - image upload removed for reliability (was causing "Checking…" / "Connecting" stalls with large base64 via Workers)
  // Existing users with image avatars will still display, but new picks are colours only
  const isColor = typeof value === "string" && value.startsWith("#");
  const displayColor = isColor ? value : PALETTE[0];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div
          className="w-16 h-16 rounded-full border-2 border-white/15 flex items-center justify-center overflow-hidden shrink-0"
          style={{ background: displayColor }}
        >
          <span className="text-xl font-black text-white/90">?</span>
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-white">Your look</p>
          <p className="text-xs text-white/50">Pick a color</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {PALETTE.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => { setError(null); onChange(c); }}
            className={`w-8 h-8 rounded-full border-2 ${value === c ? "border-white scale-110" : "border-white/15"} transition-all`}
            style={{ background: c }}
            aria-label={`color ${c}`}
          />
        ))}
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}
      <p className="text-[11px] text-white/30">Change anytime.</p>
    </div>
  );
}
