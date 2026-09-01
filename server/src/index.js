/**
 * server/src/index.js - Express + Socket.io bootstrap
 * Implements:
 *  - ephemeral user registry with 5-min GC
 *  - room manager with host/player permission matrix
 *  - live rooms broadcast
 *  - invite link handling (room ID in URL)
 *
 * Run: npm run dev  (node --watch)
 * Env: PORT=3001  GC_MS=300000  CLIENT_ORIGIN=http://localhost:5173
 */

import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import UserRegistry from "./users.js";
import { RoomManager } from "./rooms.js";
import { listGames, getGame } from "./games.js";
import { isValidRoomId, sanitizeName } from "./utils.js";
import { handleQuestEffects } from "./questScheduler.js";
import { getPublicState as questPublic, getPrivateState as questPrivate } from "../../games/good-vs-evil/server/state.js";
import { handleTriviaEffects } from "../../games/trivia/server/scheduler.js";
import { getPublicState as triviaPublic, getPrivateState as triviaPrivate } from "../../games/trivia/server/state.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());

// HTTP fallback for room list (for non-socket clients / health)
app.get("/api/health", (req, res) => res.json({ ok: true, uptime: process.uptime() }));
app.get("/api/games", (req, res) => res.json(listGames()));

// Will be set after roomManager creation
let roomManager; // initialized below

app.get("/api/rooms", (req, res) => {
  if (!roomManager) return res.json([]);
  res.json(roomManager.listPublic());
});

app.get("/api/rooms/:id", (req, res) => {
  const id = String(req.params.id).toUpperCase();
  if (!isValidRoomId(id)) return res.status(400).json({ error: "Invalid room ID" });
  const room = roomManager.getFull(id);
  if (!room) return res.status(404).json({ error: "Room not found" });
  // Don't leak passwordHash
  const { ...safe } = room;
  res.json(safe);
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CLIENT_ORIGIN, methods: ["GET", "POST"] },
  pingInterval: 25000,
  pingTimeout: 20000,
});

// --- Registry & Rooms ---
const userRegistry = new UserRegistry({
  onExpire: (lower, username) => {
    // broadcast updated user count? optional
    io.emit("users:gc", { username, lower });
  }
});

roomManager = new RoomManager({
  onRoomsChanged: (list) => {
    io.emit("rooms:update", list);
  }
});

// 10-min inactivity auto-close for lobby rooms without starting any game
const INACTIVITY_MS_NODE = 10 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  const deleted = roomManager.sweepInactive(now);
  if (deleted.length) {
    for (const { roomId } of deleted) {
      io.to(roomId).emit("room:closed", { roomId, reason: "inactivity" });
      io.emit("room:deleted", { roomId, reason: "inactivity" });
      // Clear socket.data.currentRoom for those in room
      for (const [, sock] of io.sockets.sockets) {
        if (sock.data.currentRoom === roomId) {
          sock.data.currentRoom = null;
          try { sock.leave(roomId); } catch {}
        }
      }
      console.log(`[rooms] auto-closed inactive ${roomId} after ${INACTIVITY_MS_NODE}ms`);
    }
  }
}, 30000);

function broadcastRooms() {
  io.emit("rooms:update", roomManager.listPublic());
}

function emitLobbyUpdate(roomId) {
  const full = roomManager.getFull(roomId);
  if (!full) return;
  io.to(roomId).emit("lobby:update", full);
  // Also update global browser list
  broadcastRooms();
}

function broadcastQuestState(roomId) {
  const room = roomManager.get(roomId);
  if (!room || !room.gameState) {
    emitLobbyUpdate(roomId);
    return;
  }
  const pub = questPublic(room.gameState);
  io.to(roomId).emit("game:update", pub);
  io.to(roomId).emit("lobby:update", roomManager.getFull(roomId));
  // Private per player (humans only, bots ignored)
  for (const p of room.gameState.players) {
    if (p.isBot) continue;
    const sock = io.sockets.sockets.get(p.id);
    if (sock) {
      try {
        const priv = questPrivate(room.gameState, p.id);
        sock.emit("game:private", priv);
      } catch {}
    }
  }
}

function questDispatchInternal(roomId, action) {
  const res = roomManager.dispatchQuestInternal(roomId, action);
  if (res) broadcastQuestState(roomId);
  return res;
}

function broadcastTriviaState(roomId) {
  const room = roomManager.get(roomId);
  if (!room || !room.gameState) { emitLobbyUpdate(roomId); return; }
  const pub = triviaPublic(room.gameState);
  io.to(roomId).emit("game:update", pub);
  io.to(roomId).emit("lobby:update", roomManager.getFull(roomId));
  for (const p of room.gameState.players) {
    if (p.isBot) continue;
    const sock = io.sockets.sockets.get(p.id);
    if (sock) {
      try { const priv = triviaPrivate(room.gameState, p.id); sock.emit("game:private", priv); } catch {}
    }
  }
}
function triviaDispatchInternal(roomId, action){
  const res = roomManager.dispatchTriviaInternal(roomId, action);
  if (res) broadcastTriviaState(roomId);
  return res;
}
function broadcastGameState(roomId){
  const room = roomManager.get(roomId);
  if(!room || !room.gameState) return emitLobbyUpdate(roomId);
  if(room.game==="trivia") return broadcastTriviaState(roomId);
  return broadcastQuestState(roomId);
}

// --- Socket handlers ---
io.on("connection", (socket) => {
  console.log(`[conn] ${socket.id} connected`);

  // Send initial data
  socket.emit("rooms:update", roomManager.listPublic());
  socket.emit("games:list", listGames());

  // --- Profile: register (first time or reconnect) ---
  socket.on("profile:register", ({ username, avatar } = {}, ack) => {
    try {
      const clean = sanitizeName(username);
      if (socket.data.currentRoom && socket.data.username && clean.toLowerCase() !== socket.data.username.toLowerCase()) {
        throw new Error("Name/avatar locked in room - leave and change at main menu");
      }
      const entry = userRegistry.register(socket.id, clean, avatar ?? null);
      socket.data.username = entry.username;
      socket.data.avatar = entry.avatar;
      console.log(`[profile] register ${entry.username} -> ${socket.id}`);
      // ack success
      if (typeof ack === "function") ack({ ok: true, profile: { username: entry.username, avatar: entry.avatar } });
      socket.emit("profile:ok", { username: entry.username, avatar: entry.avatar });
      // Also emit users list if needed
    } catch (e) {
      console.warn(`[profile] register fail ${socket.id}: ${e.message}`);
      if (typeof ack === "function") ack({ ok: false, error: e.message });
      socket.emit("profile:error", { error: e.message });
    }
  });

  socket.on("profile:update", ({ username, avatar } = {}, ack) => {
    try {
      if (socket.data.currentRoom) throw new Error("Change name/avatar at the main menu - not inside a room");
      // Allow partial: if username provided, rename globally + in rooms
      const current = userRegistry.getBySocket(socket.id);
      if (!current) throw new Error("Not registered - call profile:register first");
      const newName = username ? sanitizeName(username) : current.username;
      const updated = userRegistry.update(socket.id, newName, avatar);
      socket.data.username = updated.username;
      socket.data.avatar = updated.avatar;

      // Propagate rename into all rooms the socket is in (only self)
      for (const room of roomManager.rooms.values()) {
        const p = room.players.find(x => x.id === socket.id);
        if (p) {
          p.name = updated.username;
          p.avatar = updated.avatar;
          if (room.hostId === socket.id) room.hostName = updated.username;
          room.updatedAt = Date.now();
          emitLobbyUpdate(room.id);
        }
      }

      if (typeof ack === "function") ack({ ok: true, profile: { username: updated.username, avatar: updated.avatar } });
      socket.emit("profile:ok", { username: updated.username, avatar: updated.avatar });
      // Notify others of rename (for global uniqueness UI?)
      io.emit("user:renamed", { socketId: socket.id, username: updated.username });
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: e.message });
      socket.emit("profile:error", { error: e.message });
    }
  });

  // Explicit reconnect reclaim (client may call after disconnect with stored username)
  socket.on("profile:reconnect", ({ username } = {}, ack) => {
    try {
      const clean = sanitizeName(username);
      // Try to cancel GC if was disconnected
      const reclaimed = userRegistry.handleReconnect(socket.id, clean);
      if (reclaimed) {
        socket.data.username = reclaimed.username;
        socket.data.avatar = reclaimed.avatar;
        if (typeof ack === "function") ack({ ok: true, reclaimed: true, profile: { username: reclaimed.username, avatar: reclaimed.avatar } });
        socket.emit("profile:ok", { username: reclaimed.username, avatar: reclaimed.avatar });
      } else {
        // Not in grace - try fresh register
        const entry = userRegistry.register(socket.id, clean, null);
        socket.data.username = entry.username;
        if (typeof ack === "function") ack({ ok: true, reclaimed: false, profile: { username: entry.username } });
      }
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: e.message });
      socket.emit("profile:error", { error: e.message });
    }
  });

  // --- Rooms: list (explicit) ---
  socket.on("rooms:list", (ack) => {
    const list = roomManager.listPublic();
    if (typeof ack === "function") ack(list);
    else socket.emit("rooms:update", list);
  });

  // --- Room: create ---
  socket.on("room:create", ({ gameId, maxPlayers, gameOptions } = {}, ack) => {
    try {
      const user = userRegistry.getBySocket(socket.id);
      if (!user) throw new Error("Register a profile first");
      const full = roomManager.create({
        hostId: socket.id,
        hostName: user.username,
        hostAvatar: user.avatar,
        gameId: gameId || "good-vs-evil",
        maxPlayers,
        gameOptions
      });
      socket.join(full.id);
      socket.data.currentRoom = full.id;
      console.log(`[room] create ${full.id} by ${user.username} game=${full.game} max=${full.maxPlayers}`);
      if (typeof ack === "function") ack({ ok: true, room: full });
      socket.emit("room:created", full);
      // Notify lobby and browser
      broadcastRooms();
      // Also emit to creator lobby:update
      socket.emit("lobby:update", full);
    } catch (e) {
      console.warn(`[room] create fail: ${e.message}`);
      if (typeof ack === "function") ack({ ok: false, error: e.message });
      socket.emit("room:error", { error: e.message });
    }
  });

  // --- Room: join ---
  socket.on("room:join", ({ roomId } = {}, ack) => {
    try {
      const user = userRegistry.getBySocket(socket.id);
      if (!user) throw new Error("Register a profile first - missing identity");
      const id = String(roomId || "").toUpperCase().trim();
      if (!isValidRoomId(id)) throw new Error("Invalid Room ID - must be 4 alphanumeric characters");
      const full = roomManager.join({ roomId: id, socketId: socket.id, username: user.username, avatar: user.avatar });
      socket.join(id);
      socket.data.currentRoom = id;
      console.log(`[room] join ${id} ${user.username}`);
      if (typeof ack === "function") ack({ ok: true, room: full });
      socket.emit("room:joined", full);
      // Notify all in room
      emitLobbyUpdate(id);
      socket.to(id).emit("lobby:playerJoined", { roomId: id, player: { id: socket.id, name: user.username } });
    } catch (e) {
      console.warn(`[room] join fail ${socket.id}: ${e.message}`);
      if (typeof ack === "function") ack({ ok: false, error: e.message });
      socket.emit("room:error", { error: e.message });
    }
  });

  // --- Room: leave ---
  socket.on("room:leave", ({ roomId } = {}, ack) => {
    try {
      const id = String(roomId || socket.data.currentRoom || "").toUpperCase();
      if (!id) throw new Error("No room to leave");
      const roomBefore = roomManager.get(id);
      // Find target by name if in grace (old socket)
      let targetId = socket.id;
      let targetName = socket.data.username || userRegistry.getBySocket(socket.id)?.username;
      if (roomBefore && !roomBefore.players.some(p => p.id === socket.id)) {
        const lower = String(targetName || "").toLowerCase();
        const byName = roomBefore.players.find(p => p.name.toLowerCase() === lower);
        if (byName) { targetId = byName.id; targetName = byName.name; }
      }
      const isGameLeave = !!(roomBefore?.gameState && roomBefore.gameState.phase !== "LOBBY" && roomBefore.gameState.phase !== "GAME_OVER");
      const isAbandonFromMenu = targetId !== socket.id || socket.data.currentRoom !== id;
      if (isGameLeave && isAbandonFromMenu) {
        // Abandon during game from main menu — cancel game and remove
        if (roomBefore.game === "trivia") {
          try { const res = roomManager.dispatchTriviaInternal(id, { type: "REMOVE_PLAYER", payload: { playerId: targetId } }); if (res) broadcastTriviaState(id); } catch {}
        }
        const curAfter = roomManager.get(id);
        if (curAfter?.gameState && curAfter.gameState.phase !== "LOBBY" && curAfter.gameState.phase !== "GAME_OVER") {
          curAfter.gameState = null;
          curAfter.gameStartedAt = null;
          curAfter.inactiveSince = Date.now();
        }
        const idx = curAfter ? curAfter.players.findIndex(p => p.id === targetId) : -1;
        if (idx !== -1) {
          const wasHost = curAfter.players[idx].isHost;
          curAfter.players.splice(idx, 1);
          if (wasHost && curAfter.players.length > 0) {
            const newHost = curAfter.players[Math.floor(Math.random() * curAfter.players.length)];
            curAfter.players.forEach(p => p.isHost = false);
            newHost.isHost = true;
            curAfter.hostId = newHost.id;
            curAfter.hostName = newHost.name;
          } else if (curAfter.players.length === 0) {
            roomManager.rooms.delete(id);
            io.emit("room:deleted", { roomId: id });
            broadcastRooms();
            if (socket.data.currentRoom === id) socket.data.currentRoom = null;
            if (typeof ack === "function") ack({ ok: true });
            socket.emit("room:left", { roomId: id });
            return;
          }
        }
        const fullAfter = roomManager.getFull(id);
        if (typeof ack === "function") ack({ ok: true });
        socket.emit("room:left", { roomId: id });
        if (socket.data.currentRoom === id) socket.data.currentRoom = null;
        socket.leave(id);
        if (fullAfter) {
          io.to(id).emit("lobby:update", fullAfter);
          io.to(id).emit("game:update", null);
          io.to(id).emit("game:private", null);
          io.to(id).emit("room:error", { error: `${targetName} left — game cancelled, back to lobby` });
        }
        broadcastRooms();
        return;
      }
      const result = roomManager.leave({ roomId: id, socketId: targetId });
      socket.leave(id);
      socket.data.currentRoom = null;
      if (typeof ack === "function") ack({ ok: true });
      socket.emit("room:left", { roomId: id });
      if (result) {
        // notify remaining
        io.to(id).emit("lobby:update", result);
        broadcastRooms();
      } else {
        broadcastRooms();
      }
      // notify leaver that they left
      io.to(id).emit("lobby:playerLeft", { roomId: id, socketId: socket.id });
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: e.message });
    }
  });

  // --- Lobby: host-only actions ---
  socket.on("lobby:updateGame", ({ roomId, gameId } = {}, ack) => {
    try {
      const id = String(roomId || socket.data.currentRoom || "").toUpperCase();
      const full = roomManager.updateGame({ roomId: id, requesterId: socket.id, gameId });
      if (typeof ack === "function") ack({ ok: true, room: full });
      emitLobbyUpdate(id);
      io.to(id).emit("lobby:gameChanged", { game: full.game, maxPlayers: full.maxPlayers });
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: e.message });
      socket.emit("room:error", { error: e.message });
    }
  });

  socket.on("lobby:updateMaxPlayers", ({ roomId, maxPlayers } = {}, ack) => {
    try {
      const id = String(roomId || socket.data.currentRoom || "").toUpperCase();
      const full = roomManager.updateMaxPlayers({ roomId: id, requesterId: socket.id, maxPlayers });
      if (typeof ack === "function") ack({ ok: true, room: full });
      emitLobbyUpdate(id);
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: e.message });
      socket.emit("room:error", { error: e.message });
    }
  });

  socket.on("lobby:updateOptions", ({ roomId, options } = {}, ack) => {
    try {
      const id = String(roomId || socket.data.currentRoom || "").toUpperCase();
      const full = roomManager.updateOptions({ roomId: id, requesterId: socket.id, options });
      if (typeof ack === "function") ack({ ok: true, room: full });
      // Global visibility: sync across all clients in room instantly
      io.to(id).emit("lobby:update", full);
      io.to(id).emit("lobby:optionsChanged", { options: full.gameOptions });
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: e.message });
      socket.emit("room:error", { error: e.message });
    }
  });

  socket.on("lobby:addBot", ({ roomId, botName } = {}, ack) => {
    try {
      const id = String(roomId || socket.data.currentRoom || "").toUpperCase();
      const full = roomManager.addBot({ roomId: id, requesterId: socket.id, botName });
      if (typeof ack === "function") ack({ ok: true, room: full });
      emitLobbyUpdate(id);
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: e.message });
      socket.emit("room:error", { error: e.message });
    }
  });

  socket.on("lobby:removeBot", ({ roomId, botId } = {}, ack) => {
    try {
      const id = String(roomId || socket.data.currentRoom || "").toUpperCase();
      const full = roomManager.removeBot({ roomId: id, requesterId: socket.id, botId });
      if (typeof ack === "function") ack({ ok: true, room: full });
      emitLobbyUpdate(id);
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: e.message });
      socket.emit("room:error", { error: e.message });
    }
  });

  socket.on("lobby:renameBot", ({ roomId, botId, newName } = {}, ack) => {
    try {
      const id = String(roomId || socket.data.currentRoom || "").toUpperCase();
      const full = roomManager.renameBot({ roomId: id, requesterId: socket.id, botId, newName });
      if (typeof ack === "function") ack({ ok: true, room: full });
      io.to(id).emit("lobby:update", full);
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: e.message });
      socket.emit("room:error", { error: e.message });
    }
  });

  socket.on("lobby:kickPlayer", ({ roomId, targetId } = {}, ack) => {
    try {
      const id = String(roomId || socket.data.currentRoom || "").toUpperCase();
      const { room, kickedId } = roomManager.kickPlayer({ roomId: id, requesterId: socket.id, targetId });
      // force kicked socket to leave room
      const kickedSocket = io.sockets.sockets.get(kickedId);
      if (kickedSocket) {
        kickedSocket.leave(id);
        kickedSocket.data.currentRoom = null;
        kickedSocket.emit("player:kicked", { roomId: id, reason: "Kicked by host" });
        kickedSocket.emit("room:error", { error: "You were kicked from the room" });
      }
      if (typeof ack === "function") ack({ ok: true, room });
      io.to(id).emit("lobby:update", room);
      io.to(id).emit("lobby:playerKicked", { roomId: id, kickedId });
      broadcastRooms();
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: e.message });
      socket.emit("room:error", { error: e.message });
    }
  });

  socket.on("lobby:transferHost", ({ roomId, targetId } = {}, ack) => {
    try {
      const id = String(roomId || socket.data.currentRoom || "").toUpperCase();
      const room = roomManager.transferHost({ roomId: id, requesterId: socket.id, targetId });
      if (typeof ack === "function") ack({ ok: true, room });
      io.to(id).emit("lobby:update", room);
      io.to(id).emit("lobby:hostChanged", { roomId: id, hostId: room.hostId, hostName: room.hostName });
      broadcastRooms();
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: e.message });
      socket.emit("room:error", { error: e.message });
    }
  });

  // --- Rename self / bot unified --- (locked: use main menu)
  socket.on("lobby:renameSelf", ({ roomId, newName } = {}, ack) => {
    try {
      throw new Error("Name change is locked inside the room - leave and change at the main menu");
      const id = String(roomId || socket.data.currentRoom || "").toUpperCase();
      const clean = sanitizeName(newName);
      // First check global uniqueness via registry
      const user = userRegistry.getBySocket(socket.id);
      if (!user) throw new Error("Not registered");
      // Try global rename first - will throw if taken
      // But we must allow same socket to keep name case change
      const existing = userRegistry.getByName(clean);
      if (existing && existing.socketId !== socket.id) throw new Error(`Username "${clean}" is already taken globally`);
      // Update registry
      userRegistry.update(socket.id, clean, undefined);
      socket.data.username = clean;

      // Update in room
      const full = roomManager.renamePlayer({ roomId: id, requesterId: socket.id, targetId: socket.id, newName: clean, globalRegistry: userRegistry });
      if (typeof ack === "function") ack({ ok: true, room: full });
      io.to(id).emit("lobby:update", full);
      io.emit("user:renamed", { socketId: socket.id, username: clean });
      broadcastRooms();
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: e.message });
      socket.emit("room:error", { error: e.message });
    }
  });

  // Generic rename (host renaming bot OR self) - self rename locked in room
  socket.on("lobby:rename", ({ roomId, targetId, newName } = {}, ack) => {
    try {
      if (targetId === socket.id) throw new Error("Name change is locked inside the room - leave and change at the main menu");
      const id = String(roomId || socket.data.currentRoom || "").toUpperCase();
      const clean = sanitizeName(newName);
      // If target is self, need global check
      if (targetId === socket.id) {
        const existing = userRegistry.getByName(clean);
        if (existing && existing.socketId !== socket.id) throw new Error(`Username "${clean}" is already taken globally`);
        const u = userRegistry.update(socket.id, clean, undefined);
        socket.data.username = u.username;
      }
      const full = roomManager.renamePlayer({ roomId: id, requesterId: socket.id, targetId, newName: clean, globalRegistry: userRegistry });
      if (typeof ack === "function") ack({ ok: true, room: full });
      io.to(id).emit("lobby:update", full);
      if (targetId === socket.id) broadcastRooms();
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: e.message });
      socket.emit("room:error", { error: e.message });
    }
  });

  // Allow client to request sync of current room
  socket.on("room:sync", ({ roomId } = {}, ack) => {
    const id = String(roomId || socket.data.currentRoom || "").toUpperCase();
    const full = roomManager.getFull(id);
    if (full) {
      if (typeof ack === "function") ack({ ok: true, room: full });
      socket.emit("lobby:update", full);
      // Also send current game state if any (public + private)
      const room = roomManager.get(id);
      if (room && room.gameState) {
        try {
          const pub = room.game==="trivia" ? triviaPublic(room.gameState) : questPublic(room.gameState);
          socket.emit("game:update", pub);
          const priv = room.game==="trivia" ? triviaPrivate(room.gameState, socket.id) : questPrivate(room.gameState, socket.id);
          socket.emit("game:private", priv);
        } catch {
          try { socket.emit("game:private", null); } catch {}
        }
      }
    } else {
      if (typeof ack === "function") ack({ ok: false, error: "Room not found" });
    }
  });

  // --- Game lifecycle (generic) ---
  socket.on("game:start", async ({ roomId } = {}, ack) => {
    try {
      const id = String(roomId || socket.data.currentRoom || "").toUpperCase();
      const rm = roomManager.get(id);
      if(!rm) throw new Error("Room not found");
      if(rm.game==="trivia"){
        const { room, effects } = await roomManager.startTrivia(id, socket.id);
        if (typeof ack === "function") ack({ ok: true, room });
        broadcastTriviaState(id);
        handleTriviaEffects({ roomManager, roomId: id, effects, broadcast: broadcastTriviaState, dispatchInternal: triviaDispatchInternal });
      } else {
        const { room, effects } = roomManager.startQuest(id, socket.id);
        if (typeof ack === "function") ack({ ok: true, room });
        broadcastQuestState(id);
        handleQuestEffects({ roomManager, roomId: id, effects, broadcast: broadcastQuestState, dispatchInternal: questDispatchInternal });
      }
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: e.message });
      socket.emit("room:error", { error: e.message });
    }
  });

  socket.on("game:reset", ({ roomId } = {}, ack) => {
    try {
      const id = String(roomId || socket.data.currentRoom || "").toUpperCase();
      const rm = roomManager.get(id);
      let room;
      if(rm && rm.game==="trivia") room = roomManager.resetTrivia(id, socket.id);
      else room = roomManager.resetQuest(id, socket.id);
      // End of game: clear indefinite grace — remove disconnected ghosts so they can join other lobbies
      const cur = roomManager.get(id);
      if (cur) {
        const toRemove = cur.players.filter(p => !io.sockets.sockets.has(p.id));
        for (const p of toRemove) {
          const idx = cur.players.findIndex(x => x.id === p.id);
          if (idx !== -1) cur.players.splice(idx, 1);
          const lower = p.name.toLowerCase();
          const ent = userRegistry.byName.get(lower);
          if (ent && ent.socketId === p.id && !ent.timer) {
            ent.connected = false;
            ent.disconnectedAt = Date.now();
            ent.expiresAt = Date.now() + userRegistry.gcMs;
            ent.timer = setTimeout(() => {
              const cur2 = userRegistry.byName.get(lower);
              if (cur2 && cur2.socketId === p.id && !cur2.connected) {
                userRegistry.byName.delete(lower);
                userRegistry.bySocket.delete(p.id);
              }
            }, userRegistry.gcMs);
          }
        }
        if (toRemove.length) {
          cur.updatedAt = Date.now();
          room = roomManager.getFull(id);
        }
      }
      if (typeof ack === "function") ack({ ok: true, room });
      io.to(id).emit("game:update", null);
      io.to(id).emit("game:private", null);
      io.to(id).emit("lobby:update", room);
      broadcastRooms();
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: e.message });
      socket.emit("room:error", { error: e.message });
    }
  });

  socket.on("game:action", ({ roomId, type, payload } = {}, ack) => {
    try {
      const id = String(roomId || socket.data.currentRoom || "").toUpperCase();
      const rm = roomManager.get(id);
      if(rm && rm.game==="trivia"){
        const result = roomManager.handleTriviaAction({ roomId: id, socketId: socket.id, actionType: type, payload });
        if (typeof ack === "function") ack({ ok: true, public: triviaPublic(result.state) });
        broadcastTriviaState(id);
        handleTriviaEffects({ roomManager, roomId: id, effects: result.effects, broadcast: broadcastTriviaState, dispatchInternal: triviaDispatchInternal });
      } else {
        const result = roomManager.handleQuestAction({ roomId: id, socketId: socket.id, actionType: type, payload });
        if (typeof ack === "function") ack({ ok: true, public: questPublic(result.state) });
        broadcastQuestState(id);
        handleQuestEffects({ roomManager, roomId: id, effects: result.effects, broadcast: broadcastQuestState, dispatchInternal: questDispatchInternal });
      }
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: e.message });
      socket.emit("room:error", { error: e.message });
    }
  });

  socket.on("game:requestState", ({ roomId } = {}, ack) => {
    try {
      const id = String(roomId || socket.data.currentRoom || "").toUpperCase();
      const room = roomManager.get(id);
      if (!room || !room.gameState) {
        if (typeof ack === "function") ack({ ok: true, public: null, private: null });
        return;
      }
      const isTrivia = room.game==="trivia";
      const pub = isTrivia ? triviaPublic(room.gameState) : questPublic(room.gameState);
      let priv = null;
      try { priv = isTrivia ? triviaPrivate(room.gameState, socket.id) : questPrivate(room.gameState, socket.id); } catch { priv = null; }
      if (typeof ack === "function") ack({ ok: true, public: pub, private: priv });
      socket.emit("game:update", pub);
      if (priv) socket.emit("game:private", priv);
    } catch (e) {
      if (typeof ack === "function") ack({ ok: false, error: e.message });
    }
  });

  // --- Disconnect: GC timer ---
  socket.on("disconnect", (reason) => {
    console.log(`[disc] ${socket.id} (${socket.data.username || "unknown"}) reason=${reason}`);
    // Start GC timer for username
    userRegistry.handleDisconnect(socket.id);
    // Remove from rooms (ephemeral; if GC expires later, name freed; but room removal immediate)
    const affected = roomManager.removePlayerFromAllRooms(socket.id);
    // Notify affected rooms
    for (const a of affected) {
      if (a.deleted) {
        io.emit("room:deleted", { roomId: a.roomId });
      } else if (a.room) {
        io.to(a.roomId).emit("lobby:update", a.room);
        io.to(a.roomId).emit("lobby:playerLeft", { roomId: a.roomId, socketId: socket.id, username: socket.data.username });
      }
    }
    broadcastRooms();
  });
});

server.listen(PORT, () => {
  console.log(`\n🎲 Lucky Street server listening on http://localhost:${PORT}`);
  console.log(`   Client origin: ${CLIENT_ORIGIN}`);
  console.log(`   GC timeout: ${userRegistry.gcMs}ms`);
  console.log(`   Health: http://localhost:${PORT}/api/health\n`);
});
