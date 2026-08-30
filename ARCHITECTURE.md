# Lucky Street - Architecture & Wire Protocol

## 1. Overview
```
Browser (React/Vite)  ←- Socket.io -->  Node/Express Server  -->  In-Memory Maps
   localStorage                  WebSocket events            Users Map, Rooms Map
   ├─ luckyStreet:profile                                ├─ GC timer (5 min)
   └─ direct link /room/:id  ──► blocking modal if no profile
```

## 2. Client-Side Identity & Profile Caching
**File:** `client/src/utils/storage.js:1`, `client/src/context/ProfileContext.jsx:1`, `client/src/components/IdentityModal.jsx:1`

- Key: `localStorage["luckyStreet:profile"] = { username, avatar, avatarType, updatedAt }`
- Avatar: either `PALETTE` hex (e.g. `#f59e0b`) or `data:image/...;base64,...` string (via `FileReader` in `utils/avatar.js:10`)
- Flow:
  1. `ProfileProvider` hydrates from `loadProfile()` on mount.
  2. If `null`, `showOnboarding=true` -> `IdentityModal` (non-blocking on `/`, blocking on `/room/:id`).
  3. On submit, client emits `profile:register` -> server validates global uniqueness; on `ok` saves to localStorage and hides modal.
  4. On refresh/return, hydrate skips onboarding.
  5. Direct link: `Lobby.jsx:34` checks `hasProfile`; if false renders `<IdentityModal blocking />` that prevents `room:join` until completed.

## 3. Ephemeral Identity Database
**File:** `server/src/users.js:1`

- Structure:
  ```js
  byName: Map<lowerName, { socketId, username, avatar, timer, expiresAt, connected }>
  bySocket: Map<socketId, lowerName>
  ```
- `register(socketId, username, avatar)` - case-insensitive duplicate check. If `existing.timer` (grace) -> treat as owner reconnect: clear timer, update `socketId`, return. Else if active duplicate -> throw.
- `handleDisconnect(socketId)` - set `connected=false`, `expiresAt=now+5min`, start `setTimeout` that deletes entry and `bySocket` after `gcMs`. Logs `[users] GC expired`.
- `handleReconnect(socketId, username)` - explicit reclaim (also covered by `register` grace path).
- Env override: `GC_MS=10000` for testing.
- Swap to Redis: replace `Map` with `redis` + `SET username socketId EX 300` + `subscribe` for expiry events; adapter interface is same.

## 4. Main Page / Room Browser UI
**File:** `client/src/components/RoomBrowser.jsx:1`, `RoomCard.jsx:1`, `JoinByIdBox.jsx:1`, `PasswordModal.jsx:1`, `server/src/rooms.js:14`

- Server's `RoomManager.listPublic()` builds card metrics:
  ```js
  slotsText = `${players.length + bots.length} / ${maxPlayers} Players (including ${bots.length} Bots)`
  isPrivate = !!passwordHash  // padlock icon
  ```
- Live updates: `RoomManager.onRoomsChanged` -> `io.emit("rooms:update", list)` on every create/join/leave/kick/game-change. Client `SocketContext` stores `rooms` and `RoomBrowser` memo-filters.
- Filter: by `id`, `hostName`, `gameLabel` (search box).
- Join by ID box: validates `^[A-Z0-9]{4}$`, then `onJoinRoom({id})` -> if `isPrivate` shows `PasswordModal`, else `socket.emit("room:join")`.

## 5. Room Creation Flow
**File:** `client/src/components/CreateRoomModal.jsx:1`, `server/src/games.js:1` (= re-exports `games/*/manifest.js`), `server/src/rooms.js:42`, `server/src/utils.js:6`, `games/README.md:1`

- Game modules live in `lucky-street/games/<gameId>/manifest.js` (see `AGENTS.md:1` rule). `server/src/games.js:1` is the registry that imports them - **to add a game, create `games/<id>/manifest.js` then register in `games.js`** (detailed in `games/README.md:1`).
- Each manifest defines `defaultMaxPlayers`, `optionSchema`. Host dropdown (`CreateRoomModal.jsx:18`) triggers `useEffect` that autofills `maxPlayers` from selected game's defaults (spec: dynamic defaults). Host can overwrite before submit.
- Optional password field; if non-empty, `hashPassword()` (djb2 placeholder, prod -> bcrypt).
- On submit: `socket.emit("room:create", {gameId, maxPlayers, password, gameOptions})`
- Server: `generateRoomId(existingSet)` -> 4-char `ABCDEFGHJKLMNPQRSTUVWXYZ0123456789` via `crypto.getRandomValues`, collision-checked. Creates room, `socket.join(id)`, broadcasts `rooms:update` and `lobby:update`.

## 6. Lobby Management & Permission Matrix
**File:** `server/src/rooms.js:86`, `server/src/index.js:120`, `client/src/components/Lobby.jsx:1`

| Action | Who | Server check | Event |
|--------|-----|--------------|-------|
| change game | host only | `_assertHost(roomId, requesterId)` | `lobby:updateGame` -> resets `maxPlayers` to game's default + `gameOptions` to defaults |
| change maxPlayers | host | clamp 2-12, ≥ occupancy | `lobby:updateMaxPlayers` |
| update options (sliders/toggles) | host | validates against `optionSchema` | `lobby:updateOptions` -> `io.to(roomId).emit("lobby:update")` |
| add bot (custom name) | host | capacity check, name unique in room | `lobby:addBot` |
| remove bot | host | find by `botId` | `lobby:removeBot` |
| rename bot | host | duplicate check in room | `lobby:renameBot` |
| kick player | host | not self, exists | `lobby:kickPlayer` -> `kickedSocket.leave()` + `player:kicked` |
| rename self | self (host or player) | global duplicate via `UserRegistry` + room duplicate | `lobby:renameSelf` / `lobby:rename` (host self or bot) |

- Global visibility: after any lobby mutation, server does `io.to(roomId).emit("lobby:update", full)` + `broadcastRooms()`. All clients in room instantly re-render `Lobby`'s `room` state via `socket.on("lobby:update")`. No polling.
- Player permission: `renamePlayer` checks `isSelf || (isHost && targetIsBot)`; host cannot rename other humans (spec: host can only rename self + bots).

## 7. Socket Wire Protocol (complete)

**Client -> Server**
```
profile:register {username, avatar} -> ack {ok, profile} / {ok:false, error}
profile:update {username, avatar}
profile:reconnect {username}
rooms:list -> ack [rooms]
room:create {gameId, maxPlayers, password, gameOptions} -> ack {ok, room}
room:join {roomId, password?} -> ack {ok, room}
room:leave {roomId}
room:sync {roomId} -> ack {ok, room}
lobby:updateGame {roomId, gameId}
lobby:updateMaxPlayers {roomId, maxPlayers}
lobby:updateOptions {roomId, options}
lobby:addBot {roomId, botName, avatarColor}
lobby:removeBot {roomId, botId}
lobby:renameBot {roomId, botId, newName}
lobby:kickPlayer {roomId, targetId}
lobby:renameSelf {roomId, newName}
lobby:rename {roomId, targetId, newName}
```

**Server -> Client**
```
rooms:update [ {id, hostName, gameLabel, maxPlayers, currentPlayers, botCount, slotsText, isPrivate} ]
games:list [ {id, label, defaultMaxPlayers, optionSchema} ]
profile:ok {username, avatar}
profile:error {error}
room:created full
room:joined full
room:error {error}
lobby:update full
lobby:playerJoined {roomId, player}
lobby:playerLeft {roomId, socketId}
lobby:playerKicked {roomId, kickedId}
player:kicked {roomId}
user:renamed {socketId, username}
```

## 8. Modular Code Structure
```
lucky-street/
  AGENTS.md                    # AI rule: games go in games/<id>/manifest.js
  games/
    README.md                  # how to add a game (source of truth)
    veil-street/manifest.js  # canonical template - copy me
    lucky-roulette/manifest.js
    street-rally/manifest.js
    checkpoint-chaos/manifest.js
  server/src/
    index.js  - Express + Socket.io bootstrap (lines 1: address)
    users.js  - UserRegistry class (lines 1:247)
    rooms.js  - RoomManager class (lines 1:210)
    games.js  - Registry that re-exports games/*/manifest.js (add import here per AGENTS.md)
    utils.js  - ID gen, sanitize, hash (lines 1:40)

  client/src/
    context/ProfileContext.jsx - localStorage cache
    context/SocketContext.jsx  - socket lifecycle + rooms/games
    utils/storage.js - load/save profile
    utils/avatar.js  - color palette + Base64
    components/IdentityModal.jsx - onboarding + blocking overlay
    components/AvatarPicker.jsx - color + file -> Base64
    components/RoomBrowser.jsx - live grid + search
    components/RoomCard.jsx - host, game, padlock, slotsText
    components/JoinByIdBox.jsx - 4-char manual join
    components/PasswordModal.jsx - secure password entry
    components/CreateRoomModal.jsx - game dropdown + autofill max
    components/Lobby.jsx - permission matrix + live sync (renders optionSchema generically)
```

## 9. Future Scaling
- Replace `Map` with Redis (`ioredis`): `SET username:alice socketId EX 300 NX` for uniqueness, `EXPIRE` for GC, `PUBLISH` for cross-instance `rooms:update`.
- Add `bcrypt` for passwords, `zod` for payload validation, `rate-limiter` for register spam.
- Persist rooms to DB if desired, but spec is ephemeral.

