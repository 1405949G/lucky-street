import React, { useContext, useEffect, useState } from "react";
import { SocketContext, fetchWithRetry } from "../context/SocketContext.jsx";

export default function AdminView() {
  const { serverUrl } = useContext(SocketContext);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  const base = (serverUrl || "").replace(/\/$/, "");

  async function load() {
    setLoading(true); setErr(null);
    try {
      const r = await fetchWithRetry(`${base}/api/admin/rooms`, {}, 3);
      const j = await r.json();
      setData(j);
    } catch (e) { setErr(String(e.message || e)); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function delOne(id) {
    if (!confirm(`Delete room ${id}?`)) return;
    try {
      const r = await fetchWithRetry(`${base}/api/rooms/${id}`, { method: "DELETE" }, 3);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "delete failed");
      load();
    } catch (e) { alert(e.message); }
  }
  async function clearAll() {
    if (!confirm(`Delete ALL ${data?.count || 0} rooms?`)) return;
    try {
      const r = await fetchWithRetry(`${base}/api/admin/clear`, { method: "POST" }, 3);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "clear failed");
      load();
    } catch (e) { alert(e.message); }
  }

  return (
    <div className="max-w-[760px] mx-auto px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display font-black text-xl text-[#f3ecd8]">Admin - Rooms (DO)</h1>
        <div className="flex gap-2">
          <button onClick={load} className="px-4 py-2 rounded-full bg-[#23272a] border border-white/10 text-white text-sm">Refresh</button>
          <button onClick={clearAll} className="px-4 py-2 rounded-full bg-rose-500 text-white text-sm font-bold">Clear All</button>
          <a href="/" className="px-4 py-2 rounded-full bg-[#f3ecd8] text-[#0e2533] text-sm font-bold">? Home</a>
        </div>
      </div>
      <p className="text-xs text-white/50 mt-1">Replaces Worker KV browse. Durable Object storage: <code className="bg-[#23272a] px-1 rounded">{base}/api/admin/rooms</code> - <a className="underline" href={`${base}/api/admin/state`} target="_blank" rel="noreferrer">state</a> • <code className="bg-[#23272a] px-1 rounded">DELETE /api/rooms/:id</code> / <code className="bg-[#23272a] px-1 rounded">POST /api/admin/clear</code></p>
      {err && <div className="mt-3 rounded-xl bg-rose-500/20 px-3 py-2 text-sm text-rose-200">{err}</div>}
      {loading && <p className="text-white/60 mt-3">Loading•</p>}
      {data && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-white/70">{data.count} room(s) • <span className="text-white/40">pendingLeaves: {data.pendingLeaves?.length || 0}</span></p>
          {data.rooms?.length === 0 ? <div className="rounded-xl bg-[#1e2326] border border-white/10 p-6 text-center text-white/50">No rooms - storage empty</div> : null}
          {data.rooms?.map(r => (
            <div key={r.id} className="rounded-2xl bg-[#142a3d] border border-white/10 p-4">
              <div className="flex justify-between gap-3">
                <div>
                  <span className="font-mono font-black tracking-widest text-[#f3ecd8]">{r.id}</span>
                  <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-[#23272a] border border-white/10 text-white/60">{r.game} • {r.maxPlayers} max</span>
                  <p className="text-xs text-white/50 mt-1">Host: {r.hostName} ({r.hostId?.slice(0,8)}) • {r.players?.length} players + {r.bots?.length} bots • {new Date(r.createdAt).toLocaleString()}</p>
                  <details className="mt-2">
                    <summary className="text-xs text-amber-300 cursor-pointer">View JSON</summary>
                    <pre className="mt-2 text-[11px] bg-black/30 p-3 rounded-xl overflow-auto max-h-[320px] text-white/80">{JSON.stringify(r, null, 2)}</pre>
                  </details>
                </div>
                <button onClick={() => delOne(r.id)} className="h-fit px-3 py-1.5 rounded-full bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-8 rounded-xl bg-[#0f2231]/60 border border-white/10 p-4">
        <h3 className="font-bold text-white text-sm">How DO differs from KV</h3>
        <ul className="text-xs text-white/60 mt-2 space-y-1 list-disc list-inside">
            <li><b>KV you used</b>: global <code>KV.put("room:AB12")</code> - eventually consistent, browse in Dashboard ? KV ? Browse, manual delete.</li>
          <li><b>DO now</b>: single Durable Object <code>LuckyStreetDO (id=global)</code> with SQLite <code>state.storage.put("rooms", Map)</code> - strongly consistent, transactional, + <code>state.storage.setAlarm()</code> for 10s refresh grace & 5-min name GC. Survives hibernation via <code>blockConcurrencyWhile</code>.</li>
          <li>View here, or <code>curl {base}/api/rooms</code> (public list), <code>curl {base}/api/admin/rooms</code> (full), <code>curl -X DELETE {base}/api/rooms/AB12</code>.</li>
            <li>Rooms auto-delete when <code>players.length===0</code> (explicit Leave ? instant, close tab ? 10s grace then delete via <code>alarm()</code>).</li>
        </ul>
      </div>
    </div>
  );
}
