/**
 * server/src/durable/LuckyStreetDO.js — Option B: Cloudflare Durable Object (patched)
 * - Rooms + users persisted to DO storage (survives hibernation/idle, fixes "lobby closes after awhile / on refresh")
 * - Grace period: player stays in room 30s after disconnect (refresh), reconnect with same name re-attaches
 * - Speaks native WS JSON: {event, data, ackId} <-> {event,data} + {type:"ack",ackId,data}
 */

import UserRegistry from "../users.js";
import { RoomManager } from "../rooms.js";
import { listGames } from "../games.js";
import { isValidRoomId, sanitizeName } from "../utils.js";

function genSocketId() {
  try { return crypto.randomUUID(); } catch { return "s_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
}

const ROOM_GRACE_MS = 30000; // keep room slot 30s after disconnect/refresh

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
        // Pending leaves are ephemeral (in-memory only) — if DO was evicted, just keep players in rooms
      } catch (e) {
        console.warn("[DO] restore failed", e);
      }
    });
  }

  async persist() {
    try {
      // rooms: array of [id, room] — rooms are plain JSON
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
    const data = JSON.stringify(msg);
    let wss = [];
    try { wss = this.state.getWebSockets(); } catch { wss = Array.from(this.sessions.keys()); }
    for (const ws of wss) {
      if (exceptWs && ws === exceptWs) continue;
      try { ws.send(data); } catch {}
    }
  }

  send(ws, msg) {
    try { ws.send(JSON.stringify(msg)); } catch {}
  }

  sendAck(ws, ackId, payload) {
    if (!ackId) return;
    this.send(ws, { type: "ack", ackId, data: payload });
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
      this.sessions.set(server, { socketId, username: null, avatar: null, currentRoom: null });
      this.socketIdToWs.set(socketId, server);
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
    return new Response("Not found", { status: 404, headers: cors });
  }

  corsHeaders(req) {
    const origin = req.headers.get("Origin") || this.env.CLIENT_ORIGIN || "*";
    const allowOrigin = this.env.CLIENT_ORIGIN && this.env.CLIENT_ORIGIN !== "*" ? this.env.CLIENT_ORIGIN : origin;
    return {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Upgrade, Connection, Sec-WebSocket-Key, Sec-WebSocket-Version",
      "Access-Control-Allow-Credentials": "true",
    };
  }

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
    console.log(`[DO disc] ${socketId} (${sess.username || "unknown"}) code=${code} grace=${ROOM_GRACE_MS}ms`);

    // Username GC (5 min) — keep as before
    this.userRegistry.handleDisconnect(socketId);
    try { await this.state.storage.setAlarm(Date.now() + this.gcMs); } catch {}
    // Try to persist username state
    this.persist();

    // Room grace — don't remove immediately, keep slot 30s for refresh
    const roomId = sess.currentRoom;
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
            // Still not reconnected — now actually remove
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
          // Do NOT delete from room yet — keep visible for grace
        }
      }
    } else {
      // Not in a room — nothing to grace, just broadcast rooms
      this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
    }

    this.sessions.delete(ws);
    this.socketIdToWs.delete(socketId);
  }

  async webSocketError(ws, error) {
    console.warn("[DO ws error]", error);
    await this.webSocketClose(ws, 1011, String(error), false);
  }

  async alarm() {
    const now = Date.now();
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
    }
  }

  async handleEvent(ws, event, data, ackId) {
    const sess = this.sessions.get(ws);
    if (!sess) return;
    const socketId = sess.socketId;
    const okAck = (payload) => this.sendAck(ws, ackId, payload);
    try {
      switch (event) {
        case "profile:register": {
          const clean = sanitizeName(data.username);
          // If this socket had a pending room grace, cancel it and re-attach with new id
          let reattached = false;
          for (const [oldId, pend] of Array.from(this.pendingLeaves.entries())) {
            const oldSessName = (() => { try { const e = this.userRegistry.byName.get(clean.toLowerCase()); return e?.username; } catch { return null; } })();
            // Check if pending leave's room still has oldId and new username matches (case-insensitive)
            const room = this.roomManager.get(pend.roomId);
            if (room && room.players.some(p => p.id === oldId && p.name.toLowerCase() === clean.toLowerCase())) {
              clearTimeout(pend.timeout);
              this.pendingLeaves.delete(oldId);
              // Update room player's id to new socketId
              const pl = room.players.find(p => p.id === oldId);
              if (pl) {
                pl.id = socketId;
                if (room.hostId === oldId) { room.hostId = socketId; room.hostName = clean; }
                console.log(`[DO] reattach ${clean} ${oldId} -> ${socketId} in ${pend.roomId}`);
                this.broadcast({ event: "lobby:update", data: this.roomManager.getFull(pend.roomId) });
                this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
                await this.persist();
                reattached = true;
                // Also need to move currentRoom for new sess
                sess.currentRoom = pend.roomId;
                break;
              }
            }
          }
          const entry = this.userRegistry.register(socketId, clean, data.avatar ?? null);
          sess.username = entry.username;
          sess.avatar = entry.avatar;
          // If we reattached, old socketId's user entry was already handled via grace reclaim in register (it clears timer and moves)
          okAck({ ok: true, profile: { username: entry.username, avatar: entry.avatar } });
          this.send(ws, { event: "profile:ok", data: { username: entry.username, avatar: entry.avatar } });
          if (reattached) {
            // Also broadcast rooms again
            this.broadcast({ event: "rooms:update", data: this.roomManager.listPublic() });
          }
          await this.persist();
          break;
        }
        case "profile:update": {
          const current = this.userRegistry.getBySocket(socketId);
          if (!current) throw new Error("Not registered — call profile:register first");
          const newName = data.username ? sanitizeName(data.username) : current.username;
          const updated = this.userRegistry.update(socketId, newName, data.avatar);
          sess.username = updated.username;
          sess.avatar = updated.avatar;
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
            okAck({ ok: true, reclaimed: true, profile: { username: reclaimed.username, avatar: reclaimed.avatar } });
            this.send(ws, { event: "profile:ok", data: { username: reclaimed.username, avatar: reclaimed.avatar } });
          } else {
            const entry = this.userRegistry.register(socketId, clean, null);
            sess.username = entry.username;
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
            gameId: data.gameId || "quest-of-shadows",
            maxPlayers: data.maxPlayers,
            password: data.password,
            gameOptions: data.gameOptions,
          });
          sess.currentRoom = full.id;
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
          if (!user) throw new Error("Register a profile first — missing identity");
          const id = String(data.roomId || "").toUpperCase().trim();
          if (!isValidRoomId(id)) throw new Error("Invalid Room ID — must be 4 alphanumeric characters");
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
          const full = this.roomManager.join({ roomId: id, socketId, username: user.username, avatar: user.avatar, password: data.password });
          sess.currentRoom = id;
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
