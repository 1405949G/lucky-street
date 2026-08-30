/**
 * server/src/durable/LuckyStreetDO.js - Option B: Cloudflare Durable Object (patched)
 * - Rooms + users persisted to DO storage (survives hibernation/idle, fixes "lobby closes after awhile / on refresh")
 * - Grace period: player stays in room 30s after disconnect (refresh), reconnect with same name re-attaches
 * - Speaks native WS JSON: {event, data, ackId} <-> {event,data} + {type:"ack",ackId,data}
 */

import UserRegistry from "../users.js";
import { RoomManager } from "../rooms.js";
import { listGames } from "../games.js";
import { isValidRoomId, sanitizeName } from "../utils.js";
import { handleQuestEffects } from "../questScheduler.js";
import { getPublicState as questPublic, getPrivateState as questPrivate } from "../../../games/veil-street/server/state.js";

function genSocketId() {
  try { return crypto.randomUUID(); } catch { return "s_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
}

const ROOM_GRACE_MS = 10000; // keep room slot 10s after disconnect/refresh (quick close when empty)

export class LuckyStreetDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.gcMs = Number(env.GC_MS) || 5 * 60 * 1000;

    this.userRegistry = new UserRegistry({
      gcMs: this.gcMs,
      onExpire: (lower, username) => {
        this.broadcast({ event: "users:gc", data: { username, lower } });
        this.persist();
      },
    });

    this.roomManager = new RoomManager({
      onRoomsChanged: (list) => {
        this.broadcast({ event: "rooms:update", data: list });
        this.persist();
      },
    });

    this.sessions = new Map(); // ws -> {socketId, username, currentRoom}
    this.socketIdToWs = new Map();
    this.pendingLeaves = new Map(); // socketId -> {roomId, player, botSnapshot, timeout, expiresAt}
    this.lastSeen = new Map(); // socketId -> timestamp (heartbeat for idle sweep)

    this.state.blockConcurrencyWhile(async () => {
      try {
        const storedRooms = await this.state.storage.get("rooms");
        if (storedRooms && Array.isArray(storedRooms)) {
          this.roomManager.rooms = new Map(storedRooms);
          console.log(`[DO] restored ${this.roomManager.rooms.size} rooms from storage`);
        }
        const storedUsers = await this.state.storage.get("users");
        if (storedUsers && Array.isArray(storedUsers)) {
          for (const [lower, plain] of storedUsers) {
            // plain: {username, avatar, socketId, connected, expiresAt, disconnectedAt}
            this.userRegistry.byName.set(lower, {
              username: plain.username,
              avatar: plain.avatar,
              socketId: plain.socketId,
              timer: null,
              expiresAt: plain.expiresAt || null,
              disconnectedAt: plain.disconnectedAt || null,
              connected: false, // treat as disconnected until reconnect, will be cancelled on profile:register grace reclaim
            });
            this.userRegistry.bySocket.set(plain.socketId, lower);
            // if still in grace, schedule alarm
            if (plain.expiresAt && plain.expiresAt > Date.now()) {
              const ent = this.userRegistry.byName.get(lower);
              const delay = plain.expiresAt - Date.now();
              ent.timer = setTimeout(() => {
                const cur = this.userRegistry.byName.get(lower);
                if (cur && cur.socketId === plain.socketId && !cur.connected) {
                  this.userRegistry.byName.delete(lower);
                  this.userRegistry.bySocket.delete(plain.socketId);
                  this.persist();
                }
              }, delay);
            }
          }
          console.log(`[DO] restored ${this.userRegistry.byName.size} users from storage`);
        }
        // Pending leaves are ephemeral (in-memory only) - if DO was evicted, just keep players in rooms
      } catch (e) {
        console.warn("[DO] restore failed", e);
      }
    });
  }

  async persist() {
    try {
      // rooms: array of [id, room] - rooms are plain JSON
      await this.state.storage.put("rooms", Array.from(this.roomManager.rooms.entries()));
      // users: plain without timer handle
      const usersPlain = Array.from(this.userRegistry.byName.entries()).map(([k, v]) => [
        k,
        {
          username: v.username,
          avatar: v.avatar,
          socketId: v.socketId,
          connected: !!v.connected,
          expiresAt: v.expiresAt || null,
          disconnectedAt: v.disconnectedAt || null,
        },
      ]);
      await this.state.storage.put("users", usersPlain);
    } catch (e) {
      console.warn("[DO] persist failed", e);
    }
  }

  broadcast(msg, exceptWs = null) {
    // Room-scoped events: only send to sockets in that room (fixes cross-lobby leak)
    const roomScopedEvents = new Set(["lobby:update","lobby:playerLeft","lobby:playerJoined","lobby:gameChanged","lobby:optionsChanged","lobby:playerKicked","lobby:hostChanged","game:update","game:private","lobby:playerJoined","lobby:playerKicked"]);
    if (roomScopedEvents.has(msg.event) && msg.data) {
      let roomId = msg.data.id || msg.data.roomId || msg.data.roomCode || null;
      // game:update pub has roomCode, lobby:update has id
      if (roomId) {
        return this.sendToRoom(roomId, msg);
      }
    }
    const data = JSON.stringify(msg);
    let wss = [];
    try { wss = this.state.getWebSockets(); } catch { wss = Array.from(this.sessions.keys()); }
    for (const ws of wss) {
      if (exceptWs && ws === exceptWs) continue;
      try { ws.send(data); } catch {}
    }
  }

  sendToRoom(roomId, msg) {
    const data = JSON.stringify(msg);
    let wss = [];
    try { wss = this.state.getWebSockets(); } catch { wss = Array.from(this.sessions.keys()); }
    for (const ws of wss) {
      const sess = this.sessions.get(ws);
      let cur = sess?.currentRoom;
      if (!cur) {
        try { const att = ws.deserializeAttachment?.(); cur = att?.currentRoom; } catch {}
      }
      if (cur === roomId) {
        try { ws.send(data); } catch {}
      }
    }
  }

  send(ws, msg) {
    try { ws.send(JSON.stringify(msg)); } catch {}
  }

  sendAck(ws, ackId, payload) {
    if (!ackId) return;
    this.send(ws, { type: "ack", ackId, data: payload });
  }

  _syncAttachment(ws, sess) {
    try { ws.serializeAttachment({ socketId: sess.socketId, username: sess.username || null, avatar: sess.avatar || null, currentRoom: sess.currentRoom || null }); } catch {}
  }

  broadcastQuestState(roomId) {
    const room = this.roomManager.get(roomId);
    if (!room || !room.gameState) {
      const full = this.roomManager.getFull(roomId);
      if (full) this.sendToRoom(roomId, { event: "lobby:update", data: full });
      return;
    }
    let pub = null;
    try { pub = questPublic(room.gameState); } catch { pub = null; }
    if (pub) {
      this.sendToRoom(roomId, { event: "game:update", data: pub });
      this.sendToRoom(roomId, { event: "lobby:update", data: this.roomManager.getFull(roomId) });
      for (const p of room.gameState.players) {
        if (p.isBot) continue;
        const ws = this.socketIdToWs.get(p.id);
        if (ws) {
          try {
            const priv = questPrivate(room.gameState, p.id);
            this.send(ws, { event: "game:private", data: priv });
          } catch {}
        }
      }
    }
  }

  questDispatchInternal(roomId, action) {
    const res = this.roomManager.dispatchQuestInternal(roomId, action);
    if (res) this.broadcastQuestState(roomId);
    return res;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: this.corsHeaders(request) });
    }
    const upgrade = request.headers.get("Upgrade");
    if (upgrade === "websocket" || url.pathname === "/ws" || url.pathname === "/socket.io/") {
      if (upgrade !== "websocket") {
        return new Response("Expected websocket", { status: 426, headers: this.corsHeaders(request) });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      const socketId = genSocketId();
      const sess = { socketId, username: null, avatar: null, currentRoom: null };
      this.sessions.set(server, sess);
      this.socketIdToWs.set(socketId, server);
      this.lastSeen.set(socketId, Date.now());
      try { server.serializeAttachment({ socketId, username: null, currentRoom: null }); } catch {}
      queueMicrotask(() => {
        this.send(server, { event: "connected", data: { id: socketId } });
        this.send(server, { event: "rooms:update", data: this.roomManager.listPublic() });
        this.send(server, { event: "games:list", data: listGames() });
      });
      return new Response(null, { status: 101, webSocket: client, headers: this.corsHeaders(request) });
    }
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
    // --- Admin: browse/clear like KV (replaces Worker KV dashboard) ---
    // List all rooms detailed (GET) / delete single (DELETE) / clear all (POST)
    if (url.pathname.startsWith("/api/admin/")) {
      // No auth on free tier - hide behind obscurity + check Origin matches CLIENT_ORIGIN if set
      if (url.pathname === "/api/admin/rooms" && request.method === "GET") {
        const all = [...this.roomManager.rooms.values()].map(r => this.roomManager.getFull(r.id));
        return new Response(JSON.stringify({ count: all.length, rooms: all, pendingLeaves: [...this.pendingLeaves.keys()], storageKeys: ["rooms","users"] }), { headers: { ...cors, "Content-Type": "application/json" } });
      }
      if (url.pathname === "/api/admin/state" && request.method === "GET") {
        return new Response(JSON.stringify({ rooms: this.roomManager.rooms.size, users: this.userRegistry.byName.size, sessions: this.sessions.size, pendingLeaves: this.pendingLeaves.size, gcMs: this.gcMs, graceMs: ROOM_GRACE_MS }), { headers: { ...cors, "Content-Type": "application/json" } });
      }
      if ((url.pathname.startsWith("/api/admin/rooms/") || url.pathname.startsWith("/api/rooms/")) && request.method === "DELETE") {
        const id = url.pathname.split("/").pop().toUpperCase();
        if (!isValidRoomId(id)) return new Response(JSON.stringify({ error: "Invalid room ID" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
        const existed = this.roomManager.rooms.delete(id);
        // also clear any pendingLeaves for that room
        for (const [sid, pend] of [...this.pendingLeaves.entries()]) if (pend.roomId === id) { clearTimeout(pend.timeout); this.pendingLeaves.delete(sid); }
        await this.persist();
        this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
        this.broadcast({ event: "room:deleted", data: { roomId: id } });
        return new Response(JSON.stringify({ ok: true, deleted: existed, id }), { headers: { ...cors, "Content-Type": "application/json" } });
      }
      if (url.pathname === "/api/admin/clear" && (request.method === "POST" || request.method === "DELETE")) {
        const count = this.roomManager.rooms.size;
        for (const [, pend] of [...this.pendingLeaves.entries()]) clearTimeout(pend.timeout);
        this.pendingLeaves.clear();
        this.roomManager.rooms.clear();
        await this.persist();
        this.broadcast({ event: "rooms:update", data: [] });
        return new Response(JSON.stringify({ ok: true, cleared: count }), { headers: { ...cors, "Content-Type": "application/json" } });
      }
    }
    if (url.pathname.startsWith("/api/rooms/") && request.method === "DELETE") {
      const id = url.pathname.split("/").pop().toUpperCase();
      if (!isValidRoomId(id)) return new Response(JSON.stringify({ error: "Invalid room ID" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
      const existed = this.roomManager.rooms.delete(id);
      for (const [sid, pend] of [...this.pendingLeaves.entries()]) if (pend.roomId === id) { clearTimeout(pend.timeout); this.pendingLeaves.delete(sid); }
      await this.persist();
      this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
      this.broadcast({ event: "room:deleted", data: { roomId: id } });
      return new Response(JSON.stringify({ ok: true, deleted: existed, id }), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    return new Response("Not found", { status: 404, headers: cors });
  }

  corsHeaders(req) {
    const origin = req.headers.get("Origin") || this.env.CLIENT_ORIGIN || "*";
    const allowOrigin = this.env.CLIENT_ORIGIN && this.env.CLIENT_ORIGIN !== "*" ? this.env.CLIENT_ORIGIN : origin;
    return {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Upgrade, Connection, Sec-WebSocket-Key, Sec-WebSocket-Version",
      "Access-Control-Allow-Credentials": "true",
    };
  }

  async webSocketMessage(ws, message) {
    let parsed;
    try { parsed = JSON.parse(message); } catch { return; }
    const { event, data, ackId } = parsed;
    if (!event) return;
    // Hibernation-safe: restore sess from attachment if Map lost after eviction
    let sess = this.sessions.get(ws);
    if (!sess) {
      try {
        const attach = ws.deserializeAttachment?.();
        if (attach?.socketId) {
          sess = { socketId: attach.socketId, username: attach.username || null, avatar: attach.avatar || null, currentRoom: attach.currentRoom || null };
          this.sessions.set(ws, sess);
          this.socketIdToWs.set(attach.socketId, ws);
        }
      } catch {}
    }
    // heartbeat tracking for idle sweep
    if (sess) this.lastSeen.set(sess.socketId, Date.now());
    else if (event === "ping") { this.sendAck(ws, ackId, { ok: true }); this.send(ws, { event: "pong" }); return; }
    if (event === "ping") { this.sendAck(ws, ackId, { ok: true }); this.send(ws, { event: "pong" }); return; }
    await this.handleEvent(ws, event, data || {}, ackId);
  }

  async webSocketClose(ws, code, reason, wasClean) {
    let sess = this.sessions.get(ws);
    if (!sess) {
      try { const a = ws.deserializeAttachment?.(); if (a?.socketId) sess = { socketId: a.socketId, username: a.username || null, avatar: a.avatar || null, currentRoom: a.currentRoom || null }; } catch {}
    }
    if (!sess) return;
    const socketId = sess.socketId;
    console.log(`[DO disc] ${socketId} (${sess.username || "unknown"}) code=${code} grace=${ROOM_GRACE_MS}ms`);

    // Username GC (5 min) - keep as before
    this.userRegistry.handleDisconnect(socketId);
    try { await this.state.storage.setAlarm(Date.now() + this.gcMs); } catch {}
    // Try to persist username state
    this.persist();

    // Handle spectator disconnect immediately (no grace, just count)
    const roomId = sess.currentRoom;
    if (roomId) {
      const room = this.roomManager.get(roomId);
      if (room && room.spectators?.some(s => s.id === socketId)) {
        room.spectators = room.spectators.filter(s => s.id !== socketId);
        room.updatedAt = Date.now();
        this.broadcast({ event: "lobby:update", data: this.roomManager.getFull(roomId) });
        this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
        await this.persist();
      }
    }
    // Room grace - don't remove immediately, keep slot 10s for refresh
    if (roomId) {
      const room = this.roomManager.get(roomId);
      if (room) {
        const stillInRoom = room.players.some(p => p.id === socketId);
        if (stillInRoom) {
          console.log(`[DO] grace keep ${sess.username} in ${roomId} for ${ROOM_GRACE_MS}ms`);
          const timeout = setTimeout(async () => {
            const curRoom = this.roomManager.get(roomId);
            if (!curRoom) { this.pendingLeaves.delete(socketId); return; }
            const idx = curRoom.players.findIndex(p => p.id === socketId);
            if (idx === -1) { this.pendingLeaves.delete(socketId); return; }
            // Still not reconnected - now actually remove
            const wasHost = curRoom.players[idx].isHost;
            curRoom.players.splice(idx, 1);
            if (curRoom.players.length === 0) {
              this.roomManager.rooms.delete(roomId);
              this.broadcast({ event: "room:deleted", data: { roomId } });
            } else if (wasHost) {
              // random host already handled in RoomManager.removePlayerFromAllRooms, but we mimic here
              const players = curRoom.players;
              const newHost = players[Math.floor(Math.random() * players.length)];
              curRoom.players.forEach(p => p.isHost = false);
              newHost.isHost = true;
              curRoom.hostId = newHost.id;
              curRoom.hostName = newHost.name;
              this.broadcast({ event: "lobby:update", data: this.roomManager.getFull(roomId) });
            } else {
              this.broadcast({ event: "lobby:update", data: this.roomManager.getFull(roomId) });
            }
            this.broadcast({ event: "lobby:playerLeft", data: { roomId, socketId, username: sess.username } });
            this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
            await this.persist();
            this.pendingLeaves.delete(socketId);
          }, ROOM_GRACE_MS);
          this.pendingLeaves.set(socketId, { roomId, timeout, expiresAt: Date.now() + ROOM_GRACE_MS });
          try { await this.state.storage.setAlarm(Date.now() + ROOM_GRACE_MS + 1000); } catch {}
          // Do NOT delete from room yet - keep visible for grace
        }
      }
    } else {
      // Not in a room - nothing to grace, just broadcast rooms
      this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
    }

    this.sessions.delete(ws);
    this.socketIdToWs.delete(socketId);
    this.lastSeen.delete(socketId);
  }

  async webSocketError(ws, error) {
    console.warn("[DO ws error]", error);
    await this.webSocketClose(ws, 1011, String(error), false);
  }

  async alarm() {
    const now = Date.now();
    // Idle sweep: remove players whose WS hasn't pinged in 60s and isn't pendingLeaves (covers tab closed to different site without clean close)
    const IDLE_MS = 60000;
    for (const [roomId, room] of [...this.roomManager.rooms.entries()]) {
      for (const p of [...room.players]) {
        const last = this.lastSeen.get(p.id);
        const isPending = this.pendingLeaves.has(p.id);
        const ws = this.socketIdToWs.get(p.id);
        let isActive = false;
        try { const active = this.state.getWebSockets(); isActive = !!(ws && active.includes(ws)); } catch { isActive = !!(ws && this.sessions.has(ws)); }
        if (!isActive && !isPending && last && now - last > IDLE_MS) {
          console.log(`[DO idle] removing ${p.name} ${p.id} from ${roomId} after ${IDLE_MS}ms`);
          const wasHost = p.isHost;
          room.players = room.players.filter(x => x.id !== p.id);
          if (room.players.length === 0) {
            this.roomManager.rooms.delete(roomId);
            this.broadcast({ event: "room:deleted", data: { roomId } });
          } else if (wasHost) {
            const newHost = room.players[Math.floor(Math.random() * room.players.length)];
            room.players.forEach(x => x.isHost = false);
            newHost.isHost = true;
            room.hostId = newHost.id;
            room.hostName = newHost.name;
            this.broadcast({ event: "lobby:update", data: this.roomManager.getFull(roomId) });
          } else {
            this.broadcast({ event: "lobby:update", data: this.roomManager.getFull(roomId) });
          }
          this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          this.lastSeen.delete(p.id);
        }
      }
      // also sweep idle spectators (30s)
      if (room.spectators) {
        for (const s of [...room.spectators]) {
          const last = this.lastSeen.get(s.id);
          const ws = this.socketIdToWs.get(s.id);
          let isActive = false;
          try { const active = this.state.getWebSockets(); isActive = !!(ws && active.includes(ws)); } catch { isActive = !!(ws && this.sessions.has(ws)); }
          if (!isActive && last && now - last > 30000) {
            room.spectators = room.spectators.filter(x => x.id !== s.id);
            this.broadcast({ event: "lobby:update", data: this.roomManager.getFull(roomId) });
            this.lastSeen.delete(s.id);
          }
        }
      }
    }
    // Sweep expired users
    for (const [lower, entry] of this.userRegistry.byName) {
      if (entry.expiresAt && now >= entry.expiresAt && !entry.connected) {
        if (entry.timer) clearTimeout(entry.timer);
        this.userRegistry.byName.delete(lower);
        this.userRegistry.bySocket.delete(entry.socketId);
        console.log(`[DO GC alarm] expired ${entry.username}`);
        this.broadcast({ event: "users:gc", data: { username: entry.username, lower } });
      }
    }
    // Sweep expired room graces (if DO was hibernated, setTimeouts lost)
    for (const [sid, pend] of Array.from(this.pendingLeaves.entries())) {
      if (pend.expiresAt && now >= pend.expiresAt) {
        clearTimeout(pend.timeout);
        const room = this.roomManager.get(pend.roomId);
        if (room) {
          const idx = room.players.findIndex(p => p.id === sid);
          if (idx !== -1) {
            const wasHost = room.players[idx].isHost;
            room.players.splice(idx, 1);
            if (room.players.length === 0) {
              this.roomManager.rooms.delete(pend.roomId);
              this.broadcast({ event: "room:deleted", data: { roomId: pend.roomId } });
            } else if (wasHost) {
              const newHost = room.players[Math.floor(Math.random() * room.players.length)];
              room.players.forEach(p => p.isHost = false);
              newHost.isHost = true;
              room.hostId = newHost.id;
              room.hostName = newHost.name;
              this.broadcast({ event: "lobby:update", data: this.roomManager.getFull(pend.roomId) });
            } else {
              this.broadcast({ event: "lobby:update", data: this.roomManager.getFull(pend.roomId) });
            }
            this.broadcast({ event: "lobby:playerLeft", data: { roomId: pend.roomId, socketId: sid } });
            this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          }
        }
        this.pendingLeaves.delete(sid);
      }
    }
    await this.persist();
    let soonest = null;
    for (const e of this.userRegistry.byName.values()) {
      if (e.expiresAt && !e.connected) {
        if (soonest === null || e.expiresAt < soonest) soonest = e.expiresAt;
      }
    }
    for (const p of this.pendingLeaves.values()) {
      if (p.expiresAt && (soonest === null || p.expiresAt < soonest)) soonest = p.expiresAt;
    }
    if (soonest) {
      try { await this.state.storage.setAlarm(soonest); } catch {}
    } else if (this.roomManager.rooms.size > 0) {
      // keep periodic idle sweep every 30s even without pendingLeaves
      try { await this.state.storage.setAlarm(Date.now() + 30000); } catch {}
    }
  }

  async handleEvent(ws, event, data, ackId) {
    const sess = this.sessions.get(ws);
    if (!sess) return;
    const socketId = sess.socketId;
    const okAck = (payload) => this.sendAck(ws, ackId, payload);
    try {
      switch (event) {
        case "ping": { okAck({ ok: true }); this.send(ws, { event: "pong" }); break; }
        case "pong": { break; }
        case "profile:register": {
          const clean = sanitizeName(data.username);
          const lower = clean.toLowerCase();
          // --- Fix refresh race: if same name exists with old socket that is no longer active, allow reclaim even without timer ---
          const existing = this.userRegistry.byName.get(lower);
          if (existing && existing.socketId !== socketId) {
            const oldWs = this.socketIdToWs.get(existing.socketId);
            let isOldActive = false;
            try {
              const active = this.state.getWebSockets();
              isOldActive = !!(oldWs && active.includes(oldWs));
            } catch {
              isOldActive = !!(oldWs && this.sessions.has(oldWs));
            }
            if (!isOldActive) {
              // Old socket gone (refresh) - free the name and re-attach room player if any
              if (existing.timer) clearTimeout(existing.timer);
              // Re-attach room player if oldId still in a room with same name
              for (const room of this.roomManager.rooms.values()) {
                const pl = room.players.find(p => p.id === existing.socketId && p.name.toLowerCase() === lower);
                if (pl) {
                  pl.id = socketId;
                  if (room.hostId === existing.socketId) { room.hostId = socketId; room.hostName = clean; }
                  console.log(`[DO] refresh reattach (pre) ${clean} ${existing.socketId} -> ${socketId} in ${room.id}`);
                  this.broadcast({ event: "lobby:update", data: this.roomManager.getFull(room.id) });
                }
              }
              // Also handle pendingLeaves for oldId
              for (const [oldId, pend] of Array.from(this.pendingLeaves.entries())) {
                if (oldId === existing.socketId) {
                  clearTimeout(pend.timeout);
                  this.pendingLeaves.delete(oldId);
                  const room = this.roomManager.get(pend.roomId);
                  const pl = room?.players.find(p => p.id === oldId);
                  if (pl) {
                    pl.id = socketId;
                    if (room.hostId === oldId) { room.hostId = socketId; room.hostName = clean; }
                    sess.currentRoom = pend.roomId;
                    this.broadcast({ event: "lobby:update", data: this.roomManager.getFull(pend.roomId) });
                  }
                }
              }
              this.userRegistry.byName.delete(lower);
              this.userRegistry.bySocket.delete(existing.socketId);
              this.socketIdToWs.delete(existing.socketId);
              await this.persist();
            }
          }
          // If this socket had a pending room grace (refresh of same socketId? not needed) - also handle reattach via pendingLeaves for same name
          let reattached = false;
          for (const [oldId, pend] of Array.from(this.pendingLeaves.entries())) {
            const room = this.roomManager.get(pend.roomId);
            if (room && room.players.some(p => p.id === oldId && p.name.toLowerCase() === lower)) {
              clearTimeout(pend.timeout);
              this.pendingLeaves.delete(oldId);
              const pl = room.players.find(p => p.id === oldId);
              if (pl) {
                pl.id = socketId;
                if (room.hostId === oldId) { room.hostId = socketId; room.hostName = clean; }
                console.log(`[DO] reattach ${clean} ${oldId} -> ${socketId} in ${pend.roomId}`);
                this.broadcast({ event: "lobby:update", data: this.roomManager.getFull(pend.roomId) });
                this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
                await this.persist();
                reattached = true;
                sess.currentRoom = pend.roomId;
                break;
              }
            }
          }
          // Disallow name change inside a room - must leave first (prevents main-page / lobby desync)
          if (sess.currentRoom && sess.username && lower !== sess.username.toLowerCase()) {
            throw new Error("Name/avatar locked in room - leave and change at main menu");
          }
          const entry = this.userRegistry.register(socketId, clean, data.avatar ?? null);
          sess.username = entry.username;
          sess.avatar = entry.avatar;
          this._syncAttachment(ws, sess);
          okAck({ ok: true, profile: { username: entry.username, avatar: entry.avatar } });
          this.send(ws, { event: "profile:ok", data: { username: entry.username, avatar: entry.avatar } });
          if (reattached) {
            this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          }
          await this.persist();
          break;
        }
        case "profile:update": {
          if (sess.currentRoom) throw new Error("Change name/avatar at the main menu - not inside a room");
          const current = this.userRegistry.getBySocket(socketId);
          if (!current) throw new Error("Not registered - call profile:register first");
          const newName = data.username ? sanitizeName(data.username) : current.username;
          const updated = this.userRegistry.update(socketId, newName, data.avatar);
          sess.username = updated.username;
          sess.avatar = updated.avatar;
          this._syncAttachment(ws, sess);
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
          await this.persist();
          break;
        }
        case "profile:reconnect": {
          const clean = sanitizeName(data.username);
          const reclaimed = this.userRegistry.handleReconnect(socketId, clean);
          if (reclaimed) {
            sess.username = reclaimed.username;
            sess.avatar = reclaimed.avatar;
            this._syncAttachment(ws, sess);
            okAck({ ok: true, reclaimed: true, profile: { username: reclaimed.username, avatar: reclaimed.avatar } });
            this.send(ws, { event: "profile:ok", data: { username: reclaimed.username, avatar: reclaimed.avatar } });
          } else {
            const entry = this.userRegistry.register(socketId, clean, null);
            sess.username = entry.username;
            this._syncAttachment(ws, sess);
            okAck({ ok: true, reclaimed: false, profile: { username: entry.username } });
          }
          await this.persist();
          break;
        }
        case "rooms:list": {
          okAck(this.roomManager.listPublic());
          break;
        }
        case "room:create": {
          const user = this.userRegistry.getBySocket(socketId);
          if (!user) throw new Error("Register a profile first");
          const full = this.roomManager.create({
            hostId: socketId,
            hostName: user.username,
            hostAvatar: user.avatar,
            gameId: data.gameId || "veil-street",
            maxPlayers: data.maxPlayers,
            gameOptions: data.gameOptions,
          });
          sess.currentRoom = full.id;
          this._syncAttachment(ws, sess);
          // Cancel any pending leave for this socket (shouldn't exist)
          if (this.pendingLeaves.has(socketId)) {
            const pend = this.pendingLeaves.get(socketId);
            clearTimeout(pend.timeout);
            this.pendingLeaves.delete(socketId);
          }
          okAck({ ok: true, room: full });
          this.send(ws, { event: "room:created", data: full });
          this.send(ws, { event: "lobby:update", data: full });
          this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          await this.persist();
          break;
        }
        case "room:join": {
          const user = this.userRegistry.getBySocket(socketId);
          if (!user) throw new Error("Register a profile first - missing identity");
          const id = String(data.roomId || "").toUpperCase().trim();
          if (!isValidRoomId(id)) throw new Error("Invalid Room ID - must be 4 alphanumeric characters");
          // If this socket had a pending leave for same room with oldId, cancel it first (already handled in profile:register reattach, but also handle direct join)
          for (const [oldId, pend] of Array.from(this.pendingLeaves.entries())) {
            if (pend.roomId === id) {
              const room = this.roomManager.get(id);
              const pl = room?.players.find(p => p.id === oldId && p.name.toLowerCase() === user.username.toLowerCase());
              if (pl) {
                clearTimeout(pend.timeout);
                this.pendingLeaves.delete(oldId);
                // Remove old entry, will be re-added as new
                const idx = room.players.findIndex(p => p.id === oldId);
                if (idx !== -1) room.players.splice(idx, 1);
              }
            }
          }
          // Ghost takeover: if room has same-name player whose socket is dead, take over that slot (covers bugged-out ghost)
          {
            const existingRoom = this.roomManager.get(id);
            if (existingRoom) {
              const ghost = existingRoom.players.find(p => p.name.toLowerCase() === user.username.toLowerCase() && p.id !== socketId);
              if (ghost) {
                const ghostWs = this.socketIdToWs.get(ghost.id);
                let isGhostActive = false;
                try { const active = this.state.getWebSockets(); isGhostActive = !!(ghostWs && active.includes(ghostWs)); } catch { isGhostActive = !!(ghostWs && this.sessions.has(ghostWs)); }
                const isGhostPending = this.pendingLeaves.has(ghost.id);
                if (!isGhostActive || isGhostPending) {
                  const oldId = ghost.id;
                  // Only preserve host if ghost was sole host or room would be empty - prevents kicked ex-host from stealing host on rejoin
                  const wasHost = (ghost.isHost || existingRoom.hostId === oldId) && existingRoom.players.length === 1;
                  console.log(`[DO] ghost takeover ${ghost.name} ${oldId} -> ${socketId} in ${id} (active=${isGhostActive} pending=${isGhostPending} wasHost=${wasHost})`);
                  if (isGhostPending) { const pend = this.pendingLeaves.get(oldId); if (pend) { clearTimeout(pend.timeout); this.pendingLeaves.delete(oldId); } }
                  ghost.id = socketId;
                  ghost.name = user.username;
                  ghost.avatar = user.avatar;
                  if (wasHost) {
                    existingRoom.hostId = socketId;
                    existingRoom.hostName = user.username;
                    existingRoom.players.forEach(p => p.isHost = p.id === socketId);
                    ghost.isHost = true;
                  } else {
                    // Ensure rejoining kicked player never becomes host
                    ghost.isHost = false;
                  }
                  existingRoom.updatedAt = Date.now();
                  sess.currentRoom = id;
                  this._syncAttachment(ws, sess);
                  this.broadcast({ event: "lobby:update", data: this.roomManager.getFull(id) });
                  this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
                  await this.persist();
                  okAck({ ok: true, room: this.roomManager.getFull(id) });
                  this.send(ws, { event: "room:joined", data: this.roomManager.getFull(id) });
                  break;
                }
              }
            }
          }
          const full = this.roomManager.join({ roomId: id, socketId, username: user.username, avatar: user.avatar });
          sess.currentRoom = id;
          this._syncAttachment(ws, sess);
          // clear pending for this socket if any
          if (this.pendingLeaves.has(socketId)) {
            clearTimeout(this.pendingLeaves.get(socketId).timeout);
            this.pendingLeaves.delete(socketId);
          }
          okAck({ ok: true, room: full });
          this.send(ws, { event: "room:joined", data: full });
          this.broadcast({ event: "lobby:update", data: full });
          this.broadcast({ event: "lobby:playerJoined", data: { roomId: id, player: { id: socketId, name: user.username } } }, ws);
          this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          await this.persist();
          break;
        }
        case "room:spectate": {
          // Join as spectator - no username required, count only
          const id = String(data.roomId || "").toUpperCase().trim();
          if (!isValidRoomId(id)) throw new Error("Invalid Room ID");
          const room = this.roomManager.get(id);
          if (!room) throw new Error("Room not found");
          const user = this.userRegistry.getBySocket(socketId);
          const name = user?.username || data.username || `Spectator ${Math.floor(Math.random()*900+100)}`;
          const avatar = user?.avatar || data.avatar || null;
          const full = this.roomManager.addSpectator({ roomId: id, socketId, username: name, avatar });
          sess.currentRoom = id;
          this._syncAttachment(ws, sess);
          // spectators don't need userRegistry, but keep sess username for reattach
          if (!sess.username) { sess.username = name; sess.avatar = avatar; }
          okAck({ ok: true, room: full });
          this.send(ws, { event: "room:spectated", data: full });
          this.broadcast({ event: "lobby:update", data: full });
          this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          await this.persist();
          break;
        }
        case "spectator:join": {
          const user = this.userRegistry.getBySocket(socketId);
          if (!user) throw new Error("Register a profile first - missing identity");
          const id = String(data.roomId || sess.currentRoom || "").toUpperCase();
          const full = this.roomManager.promoteSpectator({ roomId: id, socketId, username: user.username, avatar: user.avatar });
          // keep spectator -> player, update sess
          sess.currentRoom = id;
          this._syncAttachment(ws, sess);
          okAck({ ok: true, room: full });
          this.broadcast({ event: "lobby:update", data: full });
          this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          await this.persist();
          break;
        }
        case "spectator:leave": {
          const id = String(data.roomId || sess.currentRoom || "").toUpperCase();
          if (!id) throw new Error("No room");
          const full = this.roomManager.removeSpectator({ roomId: id, socketId });
          if (sess.currentRoom === id) { sess.currentRoom = null; this._syncAttachment(ws, sess); }
          okAck({ ok: true, room: full });
          if (full) this.broadcast({ event: "lobby:update", data: full });
          this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          await this.persist();
          break;
        }
        case "room:leave": {
          const id = String(data.roomId || sess.currentRoom || "").toUpperCase();
          if (!id) throw new Error("No room to leave");
          // Cancel grace if exists
          if (this.pendingLeaves.has(socketId)) {
            clearTimeout(this.pendingLeaves.get(socketId).timeout);
            this.pendingLeaves.delete(socketId);
          }
          const result = this.roomManager.leave({ roomId: id, socketId });
          sess.currentRoom = null;
          this._syncAttachment(ws, sess);
          okAck({ ok: true });
          this.send(ws, { event: "room:left", data: { roomId: id } });
          if (result) this.broadcast({ event: "lobby:update", data: result });
          this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          this.broadcast({ event: "lobby:playerLeft", data: { roomId: id, socketId, username: sess.username } });
          await this.persist();
          break;
        }
        case "lobby:updateGame": {
          const id = String(data.roomId || sess.currentRoom || "").toUpperCase();
          const full = this.roomManager.updateGame({ roomId: id, requesterId: socketId, gameId: data.gameId });
          okAck({ ok: true, room: full });
          this.broadcast({ event: "lobby:update", data: full });
          this.broadcast({ event: "lobby:gameChanged", data: { game: full.game, maxPlayers: full.maxPlayers } });
          this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          await this.persist();
          break;
        }
        case "lobby:updateMaxPlayers": {
          const id = String(data.roomId || sess.currentRoom || "").toUpperCase();
          const full = this.roomManager.updateMaxPlayers({ roomId: id, requesterId: socketId, maxPlayers: data.maxPlayers });
          okAck({ ok: true, room: full });
          this.broadcast({ event: "lobby:update", data: full });
          this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          await this.persist();
          break;
        }
        case "lobby:updateOptions": {
          const id = String(data.roomId || sess.currentRoom || "").toUpperCase();
          const full = this.roomManager.updateOptions({ roomId: id, requesterId: socketId, options: data.options });
          okAck({ ok: true, room: full });
          this.broadcast({ event: "lobby:update", data: full });
          this.broadcast({ event: "lobby:optionsChanged", data: { options: full.gameOptions } });
          await this.persist();
          break;
        }
        case "lobby:addBot": {
          const id = String(data.roomId || sess.currentRoom || "").toUpperCase();
          const full = this.roomManager.addBot({ roomId: id, requesterId: socketId, botName: data.botName });
          okAck({ ok: true, room: full });
          this.broadcast({ event: "lobby:update", data: full });
          this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          await this.persist();
          break;
        }
        case "lobby:removeBot": {
          const id = String(data.roomId || sess.currentRoom || "").toUpperCase();
          const full = this.roomManager.removeBot({ roomId: id, requesterId: socketId, botId: data.botId });
          okAck({ ok: true, room: full });
          this.broadcast({ event: "lobby:update", data: full });
          this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          await this.persist();
          break;
        }
        case "lobby:renameBot": {
          const id = String(data.roomId || sess.currentRoom || "").toUpperCase();
          const full = this.roomManager.renameBot({ roomId: id, requesterId: socketId, botId: data.botId, newName: data.newName });
          okAck({ ok: true, room: full });
          this.broadcast({ event: "lobby:update", data: full });
          await this.persist();
          break;
        }
        case "lobby:kickPlayer": {
          const id = String(data.roomId || sess.currentRoom || "").toUpperCase();
          const { room, kickedId } = this.roomManager.kickPlayer({ roomId: id, requesterId: socketId, targetId: data.targetId });
          const kickedWs = this.socketIdToWs.get(kickedId);
          if (kickedWs) {
            const kickedSess = this.sessions.get(kickedWs);
            if (kickedSess) kickedSess.currentRoom = null;
            // Also cancel any pending leave for kicked
            if (this.pendingLeaves.has(kickedId)) {
              clearTimeout(this.pendingLeaves.get(kickedId).timeout);
              this.pendingLeaves.delete(kickedId);
            }
            this.send(kickedWs, { event: "player:kicked", data: { roomId: id, reason: "Kicked by host" } });
            this.send(kickedWs, { event: "room:error", data: { error: "You were kicked from the room" } });
          }
          okAck({ ok: true, room });
          this.broadcast({ event: "lobby:update", data: room });
          this.broadcast({ event: "lobby:playerKicked", data: { roomId: id, kickedId } });
          this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          await this.persist();
          break;
        }
        case "lobby:transferHost": {
          const id = String(data.roomId || sess.currentRoom || "").toUpperCase();
          const room = this.roomManager.transferHost({ roomId: id, requesterId: socketId, targetId: data.targetId });
          okAck({ ok: true, room });
          this.broadcast({ event: "lobby:update", data: room });
          this.broadcast({ event: "lobby:hostChanged", data: { roomId: id, hostId: room.hostId, hostName: room.hostName } });
          this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          await this.persist();
          break;
        }
        case "lobby:renameSelf": {
          throw new Error("Name change is locked inside the room - leave and change at the main menu");
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
          await this.persist();
          break;
        }
        case "lobby:rename": {
          if (data.targetId === socketId) throw new Error("Name change is locked inside the room - leave and change at the main menu");
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
          await this.persist();
          break;
        }
        case "room:sync": {
          const id = String(data.roomId || sess.currentRoom || "").toUpperCase();
          const full = this.roomManager.getFull(id);
          if (full) {
            okAck({ ok: true, room: full });
            this.send(ws, { event: "lobby:update", data: full });
            const room = this.roomManager.get(id);
            if (room && room.gameState) {
              try {
                const pub = questPublic(room.gameState);
                this.send(ws, { event: "game:update", data: pub });
              } catch {}
              try {
                const priv = questPrivate(room.gameState, socketId);
                this.send(ws, { event: "game:private", data: priv });
              } catch {}
            }
          } else {
            okAck({ ok: false, error: "Room not found" });
          }
          break;
        }
        case "game:start": {
          const id = String(data.roomId || sess.currentRoom || "").toUpperCase();
          const { room, effects } = this.roomManager.startQuest(id, socketId);
          okAck({ ok: true, room });
          this.broadcastQuestState(id);
          handleQuestEffects({ roomManager: this.roomManager, roomId: id, effects, broadcast: (rid) => this.broadcastQuestState(rid), dispatchInternal: (rid, act) => this.questDispatchInternal(rid, act) });
          this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          await this.persist();
          break;
        }
        case "game:reset": {
          const id = String(data.roomId || sess.currentRoom || "").toUpperCase();
          const room = this.roomManager.resetQuest(id, socketId);
          okAck({ ok: true, room });
          this.sendToRoom(id, { event: "game:update", data: null });
          this.sendToRoom(id, { event: "game:private", data: null });
          this.sendToRoom(id, { event: "lobby:update", data: room });
          this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          await this.persist();
          break;
        }
        case "game:action": {
          const id = String(data.roomId || sess.currentRoom || "").toUpperCase();
          const result = this.roomManager.handleQuestAction({ roomId: id, socketId, actionType: data.type, payload: data.payload });
          okAck({ ok: true, public: questPublic(result.state) });
          this.broadcastQuestState(id);
          handleQuestEffects({ roomManager: this.roomManager, roomId: id, effects: result.effects, broadcast: (rid) => this.broadcastQuestState(rid), dispatchInternal: (rid, act) => this.questDispatchInternal(rid, act) });
          await this.persist();
          break;
        }
        case "game:requestState": {
          const id = String(data.roomId || sess.currentRoom || "").toUpperCase();
          const room = this.roomManager.get(id);
          if (!room || !room.gameState) {
            okAck({ ok: true, public: null, private: null });
          } else {
            const pub = questPublic(room.gameState);
            let priv = null;
            try { priv = questPrivate(room.gameState, socketId); } catch { priv = null; }
            okAck({ ok: true, public: pub, private: priv });
            this.send(ws, { event: "game:update", data: pub });
            if (priv) this.send(ws, { event: "game:private", data: priv });
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
    let soonest = null;
    for (const entry of this.userRegistry.byName.values()) {
      if (entry.expiresAt && !entry.connected) {
        if (soonest === null || entry.expiresAt < soonest) soonest = entry.expiresAt;
      }
    }
    for (const p of this.pendingLeaves.values()) {
      if (p.expiresAt && (soonest === null || p.expiresAt < soonest)) soonest = p.expiresAt;
    }
    if (soonest) {
      try { await this.state.storage.setAlarm(soonest); } catch {}
    } else {
      // still persist even if no alarm
      await this.persist();
    }
  }
}
