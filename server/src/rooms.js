/**
 * server/src/rooms.js — Room CRUD + Lobby Permission Matrix
 * In-memory ephemeral rooms Map.
 *
 * Room shape:
 * {
 *   id: "A1B2" (4-char),
 *   hostId: socketId, hostName: string,
 *   game: string (gameId),
 *   maxPlayers: number,
 *   passwordHash: string|null,
 *   gameOptions: object,
 *   players: [{ id: socketId, name, avatar, isHost }],
 *   bots: [{ id: "bot_xxx", name, avatarColor }],
 *   createdAt: number,
 *   updatedAt: number
 * }
 *
 * Permission matrix enforced in methods (host-only vs self-only)
 */

import { generateRoomId, isValidRoomId, hashPassword, verifyPassword, clamp } from "./utils.js";
import { getGame, defaultMaxFor } from "./games.js";

const BOT_NAMES = [
  "Ava", "Milo", "Zoe", "Finn", "Luna", "Kai", "Nova", "Rex",
  "Mia", "Nash", "Jade", "Cole", "Aria", "Kiko", "Zane", "Ivy",
  "Theo", "Blake", "Ruby", "Jace", "Sage", "Axel", "Mira", "Leo"
];

function pickBotName(room) {
  const taken = new Set([...room.players.map(p => p.name.toLowerCase()), ...room.bots.map(b => b.name.toLowerCase())]);
  const available = BOT_NAMES.filter(n => !taken.has(n.toLowerCase()));
  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)];
  }
  // fallback: pick any unused variant without numbers — shuffle and append invisible char? Just pick random and ensure uniqueness by retrying with suffixless random
  // All names taken (rare) — pick random BOT_NAMES + try to find not-taken with minimal suffix
  for (let i = 0; i < 20; i++) {
    const cand = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    if (!taken.has(cand.toLowerCase())) return cand;
  }
  // last resort: allow requested name (will be checked for duplicate elsewhere)
  return BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
}

function pickRandomHost(players) {
  if (players.length === 0) return null;
  return players[Math.floor(Math.random() * players.length)];
}

export class RoomManager {
  constructor({ onRoomsChanged = null } = {}) {
    /** Map<roomId, room> */
    this.rooms = new Map();
    this.onRoomsChanged = onRoomsChanged;
  }

  _notify() {
    if (this.onRoomsChanged) this.onRoomsChanged(this.listPublic());
  }

  listPublic() {
    // Public card metrics for browser
    return [...this.rooms.values()].map(r => ({
      id: r.id,
      hostName: r.hostName,
      hostId: r.hostId,
      game: r.game,
      gameLabel: (getGame(r.game)?.label) || r.game,
      maxPlayers: r.maxPlayers,
      currentPlayers: r.players.length,
      botCount: r.bots.length,
      // "X / Y Players (including Z Bots)" where X = players+ bots, Y = max
      slotsText: `${r.players.length + r.bots.length} / ${r.maxPlayers} Players (including ${r.bots.length} Bots)`,
      isPrivate: !!r.passwordHash,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      gameOptions: r.gameOptions
    }));
  }

  get(roomId) {
    const id = String(roomId).toUpperCase();
    return this.rooms.get(id) || null;
  }

  getFull(roomId) {
    // includes players/bots details for lobby sync
    const r = this.get(roomId);
    if (!r) return null;
    return {
      id: r.id,
      hostId: r.hostId,
      hostName: r.hostName,
      game: r.game,
      gameLabel: getGame(r.game)?.label || r.game,
      maxPlayers: r.maxPlayers,
      isPrivate: !!r.passwordHash,
      gameOptions: r.gameOptions,
      players: r.players.map(p => ({ ...p })),
      bots: r.bots.map(b => ({ ...b })),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      slotsText: `${r.players.length + r.bots.length} / ${r.maxPlayers} Players (including ${r.bots.length} Bots)`
    };
  }

  create({ hostId, hostName, hostAvatar, gameId, maxPlayers, password, gameOptions }) {
    if (!hostId || !hostName) throw new Error("Host identity required");
    const game = getGame(gameId);
    if (!game) throw new Error(`Unknown game: ${gameId}`);

    // Dynamic defaults: autofill maxPlayers from game if not provided
    let resolvedMax = maxPlayers;
    if (resolvedMax == null || resolvedMax === "" ) resolvedMax = game.defaultMaxPlayers;
    resolvedMax = Number(resolvedMax);
    if (!Number.isFinite(resolvedMax)) throw new Error("Invalid maxPlayers");
    // clamp to game's allowed range but allow host override (spec says host can overwrite)
    // Still enforce sane 2-12
    resolvedMax = clamp(resolvedMax, 2, 12);

    // Also respect game's min/max as soft bounds — warn but allow
    const id = generateRoomId(new Set(this.rooms.keys()));

    const room = {
      id,
      hostId,
      hostName,
      hostAvatar: hostAvatar || null,
      game: gameId,
      maxPlayers: resolvedMax,
      passwordHash: hashPassword(password),
      gameOptions: { ...game.defaultOptions, ...(gameOptions || {}) },
      players: [{ id: hostId, name: hostName, avatar: hostAvatar || null, isHost: true }],
      bots: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.rooms.set(id, room);
    this._notify();
    return this.getFull(id);
  }

  join({ roomId, socketId, username, avatar, password }) {
    const room = this.get(roomId);
    if (!room) throw new Error("Room not found");
    if (room.players.some(p => p.id === socketId)) throw new Error("Already in room");
    if (room.players.some(p => p.name.toLowerCase() === username.toLowerCase())) {
      throw new Error("Username already in this room");
    }
    // password check
    if (room.passwordHash && !verifyPassword(password, room.passwordHash)) {
      throw new Error("Incorrect password");
    }
    // capacity check: total slots = players + bots vs max
    const total = room.players.length + room.bots.length;
    if (total >= room.maxPlayers) throw new Error("Room is full");

    const player = { id: socketId, name: username, avatar: avatar || null, isHost: false };
    room.players.push(player);
    room.updatedAt = Date.now();
    this._notify();
    return this.getFull(room.id);
  }

  leave({ roomId, socketId }) {
    const room = this.get(roomId);
    if (!room) return null;
    const idx = room.players.findIndex(p => p.id === socketId);
    if (idx === -1) return this.getFull(room.id);

    const wasHost = room.players[idx].isHost;
    room.players.splice(idx, 1);

    if (room.players.length === 0) {
      // last player left — delete room
      this.rooms.delete(room.id);
      this._notify();
      return null;
    }

    if (wasHost) {
      // promote random remaining player to host (per spec: random player receives host)
      const newHost = pickRandomHost(room.players);
      room.hostId = newHost.id;
      room.hostName = newHost.name;
      // clear old host flags
      room.players.forEach(p => p.isHost = false);
      newHost.isHost = true;
    }
    room.updatedAt = Date.now();
    this._notify();
    return this.getFull(room.id);
  }

  // Remove player by socket disconnect (same as leave but called globally)
  removePlayerFromAllRooms(socketId) {
    const affected = [];
    for (const room of this.rooms.values()) {
      const before = room.players.length;
      const idx = room.players.findIndex(p => p.id === socketId);
      if (idx !== -1) {
        const wasHost = room.players[idx].isHost;
        room.players.splice(idx, 1);
        if (room.players.length === 0) {
          this.rooms.delete(room.id);
          affected.push({ roomId: room.id, deleted: true });
        } else {
          if (wasHost) {
            const newHost = pickRandomHost(room.players);
            room.hostId = newHost.id;
            room.hostName = newHost.name;
            room.players.forEach(p => p.isHost = false);
            newHost.isHost = true;
          }
          room.updatedAt = Date.now();
          affected.push({ roomId: room.id, deleted: false, room: this.getFull(room.id) });
        }
      }
    }
    if (affected.length) this._notify();
    return affected;
  }

  // ——— Host-only operations ———
  _assertHost(roomId, requesterId) {
    const room = this.get(roomId);
    if (!room) throw new Error("Room not found");
    if (room.hostId !== requesterId) throw new Error("Only host can do this");
    return room;
  }

  updateGame({ roomId, requesterId, gameId }) {
    const room = this._assertHost(roomId, requesterId);
    const game = getGame(gameId);
    if (!game) throw new Error("Unknown game");
    room.game = gameId;
    // Dynamic Defaults: autofill maxPlayers to game's default (spec) but keep host's ability to overwrite
    // We auto-set to default; host can then manually change via updateMaxPlayers if wants overwrite
    room.maxPlayers = game.defaultMaxPlayers;
    // Reset options to new game's defaults (preserve? then merge defaults)
    room.gameOptions = { ...game.defaultOptions };
    room.updatedAt = Date.now();
    this._notify();
    return this.getFull(room.id);
  }

  updateMaxPlayers({ roomId, requesterId, maxPlayers }) {
    const room = this._assertHost(roomId, requesterId);
    const n = Number(maxPlayers);
    if (!Number.isFinite(n) || n < 2 || n > 12) throw new Error("maxPlayers must be 2-12");
    const total = room.players.length + room.bots.length;
    if (n < total) throw new Error(`Cannot set max below current occupancy (${total})`);
    room.maxPlayers = n;
    room.updatedAt = Date.now();
    this._notify();
    return this.getFull(room.id);
  }

  updateOptions({ roomId, requesterId, options }) {
    const room = this._assertHost(roomId, requesterId);
    const game = getGame(room.game);
    if (!game) throw new Error("Game not found");
    // Validate keys exist in schema, but allow flexible
    const next = { ...room.gameOptions };
    for (const [k, v] of Object.entries(options || {})) {
      // optional type checks
      const schema = game.optionSchema.find(s => s.key === k);
      if (!schema) continue; // ignore unknown
      if (schema.type === "slider" && typeof v === "number") {
        next[k] = clamp(v, schema.min ?? 0, schema.max ?? 9999);
      } else if (schema.type === "toggle") {
        next[k] = !!v;
      } else if (schema.type === "select") {
        if (schema.options.includes(v)) next[k] = v;
      } else {
        next[k] = v;
      }
    }
    room.gameOptions = next;
    room.updatedAt = Date.now();
    // No need to notify rooms list for option change but do for sync
    // We'll broadcast lobby:update anyway
    return this.getFull(room.id);
  }

  addBot({ roomId, requesterId, botName, avatarColor }) {
    const room = this._assertHost(roomId, requesterId);
    const total = room.players.length + room.bots.length;
    if (total >= room.maxPlayers) throw new Error("Room is full — increase maxPlayers or remove a player/bot");
    let name = String(botName || "").trim().slice(0, 20);
    if (!name) name = pickBotName(room);
    // bot name uniqueness in room
    if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase()) || room.bots.some(b => b.name.toLowerCase() === name.toLowerCase())) {
      // if provided name collides, try to pick a generic unused name instead of error (no numbers)
      const auto = pickBotName(room);
      // if auto is same as requested (shouldn't happen) then error
      if (auto.toLowerCase() === name.toLowerCase()) {
        throw new Error(`Name "${name}" already taken in this room`);
      }
      name = auto;
    }
    const bot = {
      id: `bot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      avatar: avatarColor || null,
      avatarColor: avatarColor || "#8b5cf6",
      isBot: true
    };
    room.bots.push(bot);
    room.updatedAt = Date.now();
    this._notify();
    return this.getFull(room.id);
  }

  removeBot({ roomId, requesterId, botId }) {
    const room = this._assertHost(roomId, requesterId);
    const idx = room.bots.findIndex(b => b.id === botId);
    if (idx === -1) throw new Error("Bot not found");
    room.bots.splice(idx, 1);
    room.updatedAt = Date.now();
    this._notify();
    return this.getFull(room.id);
  }

  renameBot({ roomId, requesterId, botId, newName }) {
    const room = this._assertHost(roomId, requesterId);
    const bot = room.bots.find(b => b.id === botId);
    if (!bot) throw new Error("Bot not found");
    const name = String(newName).trim().slice(0, 20);
    if (!name) throw new Error("Name required");
    if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase()) || room.bots.some(b => b.id !== botId && b.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Name "${name}" already taken in this room`);
    }
    bot.name = name;
    room.updatedAt = Date.now();
    return this.getFull(room.id);
  }

  kickPlayer({ roomId, requesterId, targetId }) {
    const room = this._assertHost(roomId, requesterId);
    if (targetId === room.hostId) throw new Error("Cannot kick yourself");
    const idx = room.players.findIndex(p => p.id === targetId);
    if (idx === -1) throw new Error("Player not found in room");
    room.players.splice(idx, 1);
    room.updatedAt = Date.now();
    this._notify();
    return { room: this.getFull(room.id), kickedId: targetId };
  }

  transferHost({ roomId, requesterId, targetId }) {
    const room = this._assertHost(roomId, requesterId);
    if (targetId === room.hostId) throw new Error("Already host");
    const target = room.players.find(p => p.id === targetId);
    if (!target) throw new Error("Player not found in room");
    // clear old host
    room.players.forEach(p => p.isHost = false);
    target.isHost = true;
    room.hostId = target.id;
    room.hostName = target.name;
    room.updatedAt = Date.now();
    this._notify();
    return this.getFull(room.id);
  }

  // ——— Player permissions: rename self; host can also rename any; also need global uniqueness check outside —
  renamePlayer({ roomId, requesterId, targetId, newName, globalRegistry = null }) {
    const room = this.get(roomId);
    if (!room) throw new Error("Room not found");
    const isHost = room.hostId === requesterId;
    const isSelf = requesterId === targetId;
    // Host can rename self or any bot; player can only rename self
    // For human targets: only self or host can rename
    const targetIsBot = room.bots.some(b => b.id === targetId);
    const targetIsHuman = room.players.some(p => p.id === targetId);

    if (targetIsBot) {
      if (!isHost) throw new Error("Only host can rename bots");
      return this.renameBot({ roomId, requesterId, botId: targetId, newName });
    }

    if (targetIsHuman) {
      if (!isSelf && !isHost) throw new Error("You can only rename yourself");
      // Host renaming another human? Spec says host can change their own username, as well as any bot's username.
      // So host can change own username plus bots. Interpretation: host cannot rename other humans except bots.
      // But spec says: Host Permissions: Can change their own username, as well as any bot's username.
      // Player Permissions: Regular players can only modify their own username.
      // So host cannot rename other humans — enforce
      if (!isSelf && isHost) throw new Error("Host can only rename self and bots");
      const name = String(newName).trim().slice(0, 20);
      if (!name) throw new Error("Name required");
      // room-level duplicate check
      if (room.players.some(p => p.id !== targetId && p.name.toLowerCase() === name.toLowerCase()) || room.bots.some(b => b.name.toLowerCase() === name.toLowerCase())) {
        throw new Error(`Name "${name}" already taken in room`);
      }
      // global duplicate check via registry (if provided)
      if (globalRegistry) {
        const existing = globalRegistry.getByName(name);
        // Allow if same socket owns that name already (case change)
        if (existing && existing.socketId !== targetId) {
          // If that name is reserved but not active, also block
          throw new Error(`Username "${name}" is taken globally`);
        }
      }
      const player = room.players.find(p => p.id === targetId);
      player.name = name;
      // If host renames self, update hostName
      if (targetId === room.hostId) room.hostName = name;
      room.updatedAt = Date.now();
      this._notify();
      return this.getFull(room.id);
    }

    throw new Error("Target not found");
  }

  // For direct room join via URL: check if room exists and password required
  canJoinPreview(roomId) {
    const room = this.get(roomId);
    if (!room) return { exists: false };
    return { exists: true, isPrivate: !!room.passwordHash, hostName: room.hostName, game: room.game };
  }
}
