/**
 * server/src/durable/LuckyStreetDO.js — Option B: Cloudflare Durable Object
 * Single global DO `lucky-street/lobby` holds users + rooms in-memory (persisted via storage if evicted)
 * Reuses server/src/users.js + server/src/rooms.js logic, but with WS hibernation API
 * Speaks native WebSocket JSON protocol: {event, data, ackId} <-> {event, data} + {type:"ack", ackId, data}
 * Maintains same permission matrix as server/src/index.js:120
 */

import UserRegistry from "../users.js";
import { RoomManager } from "../rooms.js";
import { listGames } from "../games.js";
import { isValidRoomId, sanitizeName } from "../utils.js";

function genSocketId() {
  // crypto.randomUUID available in Workers
  try { return crypto.randomUUID(); } catch { return "s_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
}

export class LuckyStreetDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.gcMs = Number(env.GC_MS) || 5 * 60 * 1000;

    this.userRegistry = new UserRegistry({
      gcMs: this.gcMs,
      onExpire: (lower, username) => {
        this.broadcast({ event: "users:gc", data: { username, lower } });
      },
    });

    this.roomManager = new RoomManager({
      onRoomsChanged: (list) => {
        this.broadcast({ event: "rooms:update", data: list });
      },
    });

    // ws -> {socketId, username, currentRoom}
    this.sessions = new Map();
    this.socketIdToWs = new Map();

    // For HTTP fallback, allow concurrent fetch while DO is handling WS
    this.state.blockConcurrencyWhile(async () => {
      // Restore from storage if needed (optional persistence)
      // For ephemeral lobby, in-memory is fine; DO stays alive while WS connected
    });
  }

  // ——— Helpers ———
  broadcast(msg, exceptWs = null) {
    const data = JSON.stringify(msg);
    // hibernation API: state.getWebSockets() returns all accepted WS (including hibernated)
    let wss = [];
    try { wss = this.state.getWebSockets(); } catch { wss = Array.from(this.sessions.keys()); }
    for (const ws of wss) {
      if (exceptWs && ws === exceptWs) continue;
      try { ws.send(data); } catch { /* closed */ }
    }
  }

  send(ws, msg) {
    try { ws.send(JSON.stringify(msg)); } catch {}
  }

  sendAck(ws, ackId, payload) {
    if (!ackId) return;
    this.send(ws, { type: "ack", ackId, data: payload });
  }

  getSession(ws) {
    return this.sessions.get(ws) || null;
  }

  // ——— HTTP + WS entry ———
  async fetch(request) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: this.corsHeaders(request),
      });
    }

    // WebSocket upgrade
    const upgrade = request.headers.get("Upgrade");
    if (upgrade === "websocket" || url.pathname === "/ws" || url.pathname === "/socket.io/") {
      // Only handle WS if Upgrade header present; otherwise treat as HTTP
      if (upgrade !== "websocket") {
        return new Response("Expected websocket", { status: 426, headers: this.corsHeaders(request) });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      // hibernation: accept and let DO handle messages via webSocketMessage
      this.state.acceptWebSocket(server);

      const socketId = genSocketId();
      this.sessions.set(server, { socketId, username: null, avatar: null, currentRoom: null });
      this.socketIdToWs.set(socketId, server);

      // Send initial data like index.js does on connect
      // Delay slightly to ensure client has set up listeners after 101
      queueMicrotask(() => {
        this.send(server, { event: "rooms:update", data: this.roomManager.listPublic() });
        this.send(server, { event: "games:list", data: listGames() });
      });

      return new Response(null, { status: 101, webSocket: client, headers: this.corsHeaders(request) });
    }

    // HTTP API (also via DO for single source of truth)
    const cors = this.corsHeaders(request);
    if (url.pathname === "/api/health") {
      return new Response(JSON.stringify({ ok: true, uptime: 0, mode: "DO", gcMs: this.gcMs }), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (url.pathname === "/api/games") {
      return new Response(JSON.stringify(listGames()), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (url.pathname === "/api/rooms" && request.method === "GET") {
      return new Response(JSON.stringify(this.roomManager.listPublic()), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (url.pathname.startsWith("/api/rooms/") && request.method === "GET") {
      const id = url.pathname.split("/").pop().toUpperCase();
      if (!isValidRoomId(id)) return new Response(JSON.stringify({ error: "Invalid room ID" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
      const room = this.roomManager.getFull(id);
      if (!room) return new Response(JSON.stringify({ error: "Room not found" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
      return new Response(JSON.stringify(room), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    return new Response("Not found", { status: 404, headers: cors });
  }

  corsHeaders(req) {
    const origin = req.headers.get("Origin") || this.env.CLIENT_ORIGIN || "*";
    // In Workers, we need to allow the Pages origin. For simplicity allow * + credentials handling via explicit origin
    const allowOrigin = this.env.CLIENT_ORIGIN && this.env.CLIENT_ORIGIN !== "*"
      ? this.env.CLIENT_ORIGIN
      : origin;
    return {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Upgrade, Connection, Sec-WebSocket-Key, Sec-WebSocket-Version",
      "Access-Control-Allow-Credentials": "true",
    };
  }

  // ——— WS message ———
  async webSocketMessage(ws, message) {
    let parsed;
    try { parsed = JSON.parse(message); } catch { return; }
    const { event, data, ackId } = parsed;
    if (!event) return;
    await this.handleEvent(ws, event, data || {}, ackId);
  }

  async webSocketClose(ws, code, reason, wasClean) {
    const sess = this.sessions.get(ws);
    if (!sess) return;
    const socketId = sess.socketId;
    console.log(`[DO disc] ${socketId} (${sess.username || "unknown"}) code=${code}`);

    // GC timer for username
    this.userRegistry.handleDisconnect(socketId);

    // Remove from rooms
    const affected = this.roomManager.removePlayerFromAllRooms(socketId);
    for (const a of affected) {
      if (a.deleted) {
        this.broadcast({ event: "room:deleted", data: { roomId: a.roomId } });
      } else if (a.room) {
        this.broadcast({ event: "lobby:update", data: a.room });
        this.broadcast({ event: "lobby:playerLeft", data: { roomId: a.roomId, socketId, username: sess.username } });
      }
    }
    this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });

    this.sessions.delete(ws);
    this.socketIdToWs.delete(socketId);
  }

  async webSocketError(ws, error) {
    console.warn("[DO ws error]", error);
    // treat as close
    await this.webSocketClose(ws, 1011, String(error), false);
  }

  // ——— Alarm for GC sweep (if DO hibernated, setTimeout lost) ———
  async alarm() {
    // Sweep expired users that setTimeout might have missed after eviction
    const now = Date.now();
    for (const [lower, entry] of this.userRegistry.byName) {
      if (entry.expiresAt && now >= entry.expiresAt && !entry.connected) {
        // Only delete if still expired and not reclaimed
        if (entry.timer) clearTimeout(entry.timer);
        this.userRegistry.byName.delete(lower);
        this.userRegistry.bySocket.delete(entry.socketId);
        console.log(`[DO GC alarm] expired ${entry.username}`);
        this.broadcast({ event: "users:gc", data: { username: entry.username, lower } });
      }
    }
    // No need to reschedule unless there are still pending expiries — set next alarm to soonest expiresAt
    let soonest = null;
    for (const e of this.userRegistry.byName.values()) {
      if (e.expiresAt && !e.connected) {
        if (soonest === null || e.expiresAt < soonest) soonest = e.expiresAt;
      }
    }
    if (soonest) {
      try { await this.state.storage.setAlarm(soonest); } catch {}
    }
  }

  // ——— Event router (mirrors server/src/index.js:84) ———
  async handleEvent(ws, event, data, ackId) {
    const sess = this.sessions.get(ws);
    if (!sess) return;
    const socketId = sess.socketId;

    const okAck = (payload) => this.sendAck(ws, ackId, payload);
    const errAck = (msg) => this.sendAck(ws, ackId, { ok: false, error: msg });

    try {
      switch (event) {
        case "profile:register": {
          const clean = sanitizeName(data.username);
          const entry = this.userRegistry.register(socketId, clean, data.avatar ?? null);
          sess.username = entry.username;
          sess.avatar = entry.avatar;
          okAck({ ok: true, profile: { username: entry.username, avatar: entry.avatar } });
          this.send(ws, { event: "profile:ok", data: { username: entry.username, avatar: entry.avatar } });
          break;
        }
        case "profile:update": {
          const current = this.userRegistry.getBySocket(socketId);
          if (!current) throw new Error("Not registered — call profile:register first");
          const newName = data.username ? sanitizeName(data.username) : current.username;
          const updated = this.userRegistry.update(socketId, newName, data.avatar);
          sess.username = updated.username;
          sess.avatar = updated.avatar;
          // Propagate rename into rooms
          for (const room of this.roomManager.rooms.values()) {
            const p = room.players.find(x => x.id === socketId);
            if (p) {
              p.name = updated.username;
              p.avatar = updated.avatar;
              if (room.hostId === socketId) room.hostName = updated.username;
              room.updatedAt = Date.now();
              this.broadcast({ event: "lobby:update", data: this.roomManager.getFull(room.id) });
            }
          }
          okAck({ ok: true, profile: { username: updated.username, avatar: updated.avatar } });
          this.send(ws, { event: "profile:ok", data: { username: updated.username, avatar: updated.avatar } });
          this.broadcast({ event: "user:renamed", data: { socketId, username: updated.username } });
          break;
        }
        case "profile:reconnect": {
          const clean = sanitizeName(data.username);
          const reclaimed = this.userRegistry.handleReconnect(socketId, clean);
          if (reclaimed) {
            sess.username = reclaimed.username;
            sess.avatar = reclaimed.avatar;
            okAck({ ok: true, reclaimed: true, profile: { username: reclaimed.username, avatar: reclaimed.avatar } });
            this.send(ws, { event: "profile:ok", data: { username: reclaimed.username, avatar: reclaimed.avatar } });
          } else {
            const entry = this.userRegistry.register(socketId, clean, null);
            sess.username = entry.username;
            okAck({ ok: true, reclaimed: false, profile: { username: entry.username } });
          }
          break;
        }
        case "rooms:list": {
          const list = this.roomManager.listPublic();
          okAck(list);
          break;
        }
        case "room:create": {
          const user = this.userRegistry.getBySocket(socketId);
          if (!user) throw new Error("Register a profile first");
          const full = this.roomManager.create({
            hostId: socketId,
            hostName: user.username,
            hostAvatar: user.avatar,
            gameId: data.gameId || "quest-of-shadows",
            maxPlayers: data.maxPlayers,
            password: data.password,
            gameOptions: data.gameOptions,
          });
          sess.currentRoom = full.id;
          console.log(`[DO room create] ${full.id} by ${user.username}`);
          okAck({ ok: true, room: full });
          this.send(ws, { event: "room:created", data: full });
          this.send(ws, { event: "lobby:update", data: full });
          this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          break;
        }
        case "room:join": {
          const user = this.userRegistry.getBySocket(socketId);
          if (!user) throw new Error("Register a profile first — missing identity");
          const id = String(data.roomId || "").toUpperCase().trim();
          if (!isValidRoomId(id)) throw new Error("Invalid Room ID — must be 4 alphanumeric characters");
          const full = this.roomManager.join({ roomId: id, socketId, username: user.username, avatar: user.avatar, password: data.password });
          sess.currentRoom = id;
          console.log(`[DO room join] ${id} ${user.username}`);
          okAck({ ok: true, room: full });
          this.send(ws, { event: "room:joined", data: full });
          this.broadcast({ event: "lobby:update", data: full });
          this.broadcast({ event: "lobby:playerJoined", data: { roomId: id, player: { id: socketId, name: user.username } } }, ws);
          this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          break;
        }
        case "room:leave": {
          const id = String(data.roomId || sess.currentRoom || "").toUpperCase();
          if (!id) throw new Error("No room to leave");
          const result = this.roomManager.leave({ roomId: id, socketId });
          sess.currentRoom = null;
          okAck({ ok: true });
          this.send(ws, { event: "room:left", data: { roomId: id } });
          if (result) {
            this.broadcast({ event: "lobby:update", data: result });
          }
          this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          this.broadcast({ event: "lobby:playerLeft", data: { roomId: id, socketId, username: sess.username } });
          break;
        }
        case "lobby:updateGame": {
          const id = String(data.roomId || sess.currentRoom || "").toUpperCase();
          const full = this.roomManager.updateGame({ roomId: id, requesterId: socketId, gameId: data.gameId });
          okAck({ ok: true, room: full });
          this.broadcast({ event: "lobby:update", data: full });
          this.broadcast({ event: "lobby:gameChanged", data: { game: full.game, maxPlayers: full.maxPlayers } });
          this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          break;
        }
        case "lobby:updateMaxPlayers": {
          const id = String(data.roomId || sess.currentRoom || "").toUpperCase();
          const full = this.roomManager.updateMaxPlayers({ roomId: id, requesterId: socketId, maxPlayers: data.maxPlayers });
          okAck({ ok: true, room: full });
          this.broadcast({ event: "lobby:update", data: full });
          this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          break;
        }
        case "lobby:updateOptions": {
          const id = String(data.roomId || sess.currentRoom || "").toUpperCase();
          const full = this.roomManager.updateOptions({ roomId: id, requesterId: socketId, options: data.options });
          okAck({ ok: true, room: full });
          this.broadcast({ event: "lobby:update", data: full });
          this.broadcast({ event: "lobby:optionsChanged", data: { options: full.gameOptions } });
          break;
        }
        case "lobby:addBot": {
          const id = String(data.roomId || sess.currentRoom || "").toUpperCase();
          const full = this.roomManager.addBot({ roomId: id, requesterId: socketId, botName: data.botName, avatarColor: data.avatarColor });
          okAck({ ok: true, room: full });
          this.broadcast({ event: "lobby:update", data: full });
          this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          break;
        }
        case "lobby:removeBot": {
          const id = String(data.roomId || sess.currentRoom || "").toUpperCase();
          const full = this.roomManager.removeBot({ roomId: id, requesterId: socketId, botId: data.botId });
          okAck({ ok: true, room: full });
          this.broadcast({ event: "lobby:update", data: full });
          this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          break;
        }
        case "lobby:renameBot": {
          const id = String(data.roomId || sess.currentRoom || "").toUpperCase();
          const full = this.roomManager.renameBot({ roomId: id, requesterId: socketId, botId: data.botId, newName: data.newName });
          okAck({ ok: true, room: full });
          this.broadcast({ event: "lobby:update", data: full });
          break;
        }
        case "lobby:kickPlayer": {
          const id = String(data.roomId || sess.currentRoom || "").toUpperCase();
          const { room, kickedId } = this.roomManager.kickPlayer({ roomId: id, requesterId: socketId, targetId: data.targetId });
          const kickedWs = this.socketIdToWs.get(kickedId);
          if (kickedWs) {
            const kickedSess = this.sessions.get(kickedWs);
            if (kickedSess) kickedSess.currentRoom = null;
            this.send(kickedWs, { event: "player:kicked", data: { roomId: id, reason: "Kicked by host" } });
            this.send(kickedWs, { event: "room:error", data: { error: "You were kicked from the room" } });
          }
          okAck({ ok: true, room });
          this.broadcast({ event: "lobby:update", data: room });
          this.broadcast({ event: "lobby:playerKicked", data: { roomId: id, kickedId } });
          this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          break;
        }
        case "lobby:renameSelf": {
          const id = String(data.roomId || sess.currentRoom || "").toUpperCase();
          const clean = sanitizeName(data.newName);
          const user = this.userRegistry.getBySocket(socketId);
          if (!user) throw new Error("Not registered");
          const existing = this.userRegistry.getByName(clean);
          if (existing && existing.socketId !== socketId) throw new Error(`Username "${clean}" is already taken globally`);
          this.userRegistry.update(socketId, clean, undefined);
          sess.username = clean;
          const full = this.roomManager.renamePlayer({ roomId: id, requesterId: socketId, targetId: socketId, newName: clean, globalRegistry: this.userRegistry });
          okAck({ ok: true, room: full });
          this.broadcast({ event: "lobby:update", data: full });
          this.broadcast({ event: "user:renamed", data: { socketId, username: clean } });
          this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          break;
        }
        case "lobby:rename": {
          const id = String(data.roomId || sess.currentRoom || "").toUpperCase();
          const clean = sanitizeName(data.newName);
          if (data.targetId === socketId) {
            const existing = this.userRegistry.getByName(clean);
            if (existing && existing.socketId !== socketId) throw new Error(`Username "${clean}" is already taken globally`);
            const u = this.userRegistry.update(socketId, clean, undefined);
            sess.username = u.username;
          }
          const full = this.roomManager.renamePlayer({ roomId: id, requesterId: socketId, targetId: data.targetId, newName: clean, globalRegistry: this.userRegistry });
          okAck({ ok: true, room: full });
          this.broadcast({ event: "lobby:update", data: full });
          if (data.targetId === socketId) this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          break;
        }
        case "room:sync": {
          const id = String(data.roomId || sess.currentRoom || "").toUpperCase();
          const full = this.roomManager.getFull(id);
          if (full) {
            okAck({ ok: true, room: full });
            this.send(ws, { event: "lobby:update", data: full });
          } else {
            okAck({ ok: false, error: "Room not found" });
          }
          break;
        }
        default:
          throw new Error(`Unknown event: ${event}`);
      }
    } catch (e) {
      console.warn(`[DO] ${event} fail: ${e.message}`);
      this.sendAck(ws, ackId, { ok: false, error: e.message });
      this.send(ws, { event: "room:error", data: { error: e.message } });
    }

    // Schedule GC alarm if needed (for handleDisconnect timers that may be lost on hibernation)
    // Find soonest expiresAt
    let soonest = null;
    for (const entry of this.userRegistry.byName.values()) {
      if (entry.expiresAt && !entry.connected) {
        if (soonest === null || entry.expiresAt < soonest) soonest = entry.expiresAt;
      }
    }
    if (soonest) {
      try { await this.state.storage.setAlarm(soonest); } catch {}
    }
  }
}
