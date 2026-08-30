import React, { useRef, useState } from "react";
import { PALETTE, fileToBase64, isBase64Image } from "../utils/avatar.js";

export default function AvatarPicker({ value, onChange }) {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);

  const isImage = isBase64Image(value);

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      const b64 = await fileToBase64(file);
      onChange(b64);
    } catch (err) {
      setError(err.message || "Could not load image");
    } finally {
      setLoading(false);
      // reset input so same file can be re-picked
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div
          className="w-16 h-16 rounded-full border-2 border-white/15 flex items-center justify-center overflow-hidden shrink-0 bg-white/5"
          style={isImage ? {} : { background: value || PALETTE[0] }}
        >
          {isImage ? (
            <img src={value} alt="avatar" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xl font-black text-white/90">?</span>
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-white">Avatar</p>
          <p className="text-xs text-white/50">Choose a colour or upload a photo</p>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={loading}
              className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-bold text-white disabled:opacity-50"
            >{loading ? "Loading…" : "Upload Image"}</button>
            {isImage && (
              <button
                type="button"
                onClick={() => onChange(PALETTE[0])}
                className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white/70"
              >Use Colour</button>
            )}
          </div>
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

      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onFile} />

      {error && <p className="text-xs text-rose-400">{error}</p>}
      <p className="text-[11px] text-white/30">Square photos look best. You can change this anytime.</p>
    </div>
  );
}
