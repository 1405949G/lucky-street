/**
 * server/src/worker.js — Cloudflare Workers entry (Option B: pure Cloudflare, no Render)
 * Single global Durable Object `lucky-street/lobby` holds all users + rooms.
 * Keeps same JSON protocol as Express server but over native WebSocket.
 * See wrangler.toml, durable/LuckyStreetDO.js, AGENTS.md
 */

import { LuckyStreetDO } from "./durable/LuckyStreetDO.js";
export { LuckyStreetDO };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS helper
    const corsHeaders = (req) => {
      const origin = req.headers.get("Origin") || env.CLIENT_ORIGIN || "*";
      const allowOrigin = env.CLIENT_ORIGIN && env.CLIENT_ORIGIN !== "*" ? env.CLIENT_ORIGIN : origin;
      return {
        "Access-Control-Allow-Origin": allowOrigin,
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Upgrade, Connection, Sec-WebSocket-Key, Sec-WebSocket-Version",
        "Access-Control-Allow-Credentials": "true",
      };
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    // Health at edge (no DO needed)
    if (url.pathname === "/api/health") {
      return new Response(JSON.stringify({ ok: true, mode: "worker", durable: "LuckyStreetDO" }), {
        headers: { ...corsHeaders(request), "Content-Type": "application/json" },
      });
    }

    // All other /api + /ws -> forward to global DO for single source of truth
    // This keeps rooms + users consistent without needing per-room DO sharding
    if (url.pathname.startsWith("/api/") || url.pathname === "/ws" || url.pathname.startsWith("/socket.io")) {
      const id = env.LOBBY_DO.idFromName("global");
      const stub = env.LOBBY_DO.get(id);
      // Forward original request (preserves Upgrade header for WS)
      return stub.fetch(request);
    }

    return new Response("Not found", { status: 404, headers: corsHeaders(request) });
  },
};
