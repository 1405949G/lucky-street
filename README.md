# Lucky Street - Real-time Party Game Lobby

> Principal Full-Stack reference implementation: **React 18 + Vite + Tailwind + Socket.io** on the frontend, **Node.js + Express + Socket.io** on the backend, with in-memory ephemeral stores that can be swapped to Redis.

Live: `client` -> http://localhost:5173 , `server` -> http://localhost:3001

## Tech Stack Recommendation (and why)

| Layer | Choice | Why |
|-------|--------|-----|
| **Frontend** | **React 18 + Vite** + **React Router 6** | SPA routing for `/` (browser) and `/room/:id` (direct link + blocking guard), instant HMR, tiny bundle |
| **Realtime** | **Socket.io 4** (client + server) | Room abstraction, auto-reconnect, fallback polling, ack callbacks, broadcast to room |
| **Styling** | **Tailwind CSS 3** | Dark Table Party theme (`#0a1e2e`, `#142a3d`), glass modals, slot cards |
| **Backend** | **Node.js 20 + Express 4** | Minimal HTTP for health/games/rooms + WebSocket mount on same port |
| **Ephemeral DB** | **In-Memory `Map` / `Set`** (swap to Redis) | Meets spec's `Map/Set or Redis`; GC via `setTimeout` mirrors Redis `EXPIRE` |
| **Identity Cache** | **`localStorage` + server `Map`** | Client persistence + server global uniqueness + 5-min GC |

See `ARCHITECTURE.md` for wire protocol, permission matrix, and scaling notes. See `TESTING.md` for manual checklist.

## Quick Start

```bash
# 1. server - http://localhost:3001
cd "lucky-street/server"
npm install
npm run dev          # or: PORT=3001 GC_MS=300000 node src/index.js

# 2. client - http://localhost:5173
cd "../client"
npm install
npm run dev          # or: npm run build && npm run preview

# optional: both at once from lucky-street root
cd ".."
npm install          # installs concurrently
npm run dev          # runs server and client together
```

Env:
- `PORT` (server, default 3001)
- `GC_MS` (server, default 300000 = 5 min; use 10000 for testing)
- `VITE_SERVER_URL` (client, default http://localhost:3001) - set in `client/.env`

## Adding a New Game (AI: also see AGENTS.md:1 and games/README.md:1)

> **Rule:** All new games go in `lucky-street/games/<gameId>/manifest.js` - not inline in `server/src/games.js`, not as workspace sibling.

```bash
mkdir lucky-street/games/my-new-game
cp lucky-street/games/veil-street/manifest.js lucky-street/games/my-new-game/manifest.js
# edit id/label/options, then register in lucky-street/server/src/games.js:1
```

See `games/README.md:1` for manifest template + checklist. Lobby's `optionSchema` drives host sliders/toggles with zero lobby changes.

## Project Structure
```
lucky-street/
  AGENTS.md                    # AI instructions - read in new sessions
  games/                         # ← ADD GAMES HERE
    README.md                  # how to add a game (detailed)
    veil-street/manifest.js # canonical example - copy me
    lucky-roulette/manifest.js
    street-rally/manifest.js
    checkpoint-chaos/manifest.js
    my-new-game/manifest.js    # your new game
  server/
    package.json
    src/
      index.js      # Express + Socket.io bootstrap, permission wiring, live broadcast
      users.js      # UserRegistry - Map + 5-min GC timers, case-insensitive uniqueness
      rooms.js      # RoomManager - CRUD, password hash, bots, host/player guards, slotsText
      games.js      # Registry that re-exports games/*/manifest.js (add import here)
      utils.js      # generateRoomId (4-char alphanumeric), sanitizeName, hashPassword
  client/
    package.json
    vite.config.js
    tailwind.config.js
    index.html
    src/
      main.jsx                 # ProfileProvider -> SocketProvider -> BrowserRouter
      App.jsx                  # "/" (RoomBrowser + Create + JoinById) and "/room/:id" (Lobby)
      context/ProfileContext.jsx  # load/save luckyStreet:profile in localStorage
      context/SocketContext.jsx   # io(), rooms:update, games:list, profile:register
      utils/storage.js         # loadProfile / saveProfile / hasProfile
      utils/avatar.js          # PALETTE + fileToBase64 (Base64 avatar)
      components/
        IdentityModal.jsx      # first-time onboarding + blocking overlay for direct links
        AvatarPicker.jsx       # color swatches + file upload -> Base64
        RoomBrowser.jsx        # live grid, search filter, room count
        RoomCard.jsx           # host, gameLabel, padlock, "X / Y Players (including Z Bots)"
        JoinByIdBox.jsx        # 4-char input + validation
        PasswordModal.jsx      # secure entry for private rooms
        CreateRoomModal.jsx    # game dropdown -> autofills maxPlayers, optional password
        Lobby.jsx              # permission matrix, host controls, global live sync
  ARCHITECTURE.md
  TESTING.md
```

## Key Flows (spec coverage)

**Spec 1 - Client Identity & Profile Caching**
- `IdentityModal` writes `localStorage["luckyStreet:profile"] = {username, avatar}` (avatar Base64 if image)
- `ProfileContext` hydrates on mount; if present skips onboarding
- Direct link `/room/A1B2` -> `Lobby` checks `hasProfile` -> if missing renders blocking `<IdentityModal blocking />` that prevents `room:join` until completed

**Spec 2 - Ephemeral Identity DB**
- `server/src/users.js:17` `byName: Map<lower, entry>` - rejects duplicate on `profile:register` if active; allows grace reclaim within timer
- On `disconnect` -> `handleDisconnect` starts `setTimeout(GC_MS)`; on `register` with same name within grace -> cancels timer (owner reconnect)
- After `GC_MS` expiry -> `byName.delete(lower)` + `bySocket.delete(oldId)` -> name freed; tested with `GC_MS=4000`

**Spec 3 - Main Page / Room Browser**
- `rooms:update` broadcast on every lobby mutation -> `RoomBrowser` live
- Card metrics: `hostName`, `gameLabel`, padlock if `isPrivate`, `slotsText: "${total}/${max} Players (including ${bots} Bots)"`
- Join by ID box: validates `^[A-Z0-9]{4}$`, triggers password modal if `isPrivate`

**Spec 4 - Room Creation**
- `CreateRoomModal` `select game` -> `useEffect` autofills `maxPlayers` from `GAMES[gameId].defaultMaxPlayers` (host can overwrite)
- Optional password -> `hashPassword` (djb2 placeholder)
- Server `generateRoomId` -> 4-char alphanumeric `A-Z0-9` via `crypto.getRandomValues`, collision-checked

**Spec 5 - Lobby Permission Matrix**
- Host only: `lobby:updateGame` (also resets max to new game's default), `updateMaxPlayers`, `updateOptions` (sliders/toggles), `addBot`/`removeBot`/`renameBot` (custom names), `kickPlayer`, `renameBot` + own rename
- Player only: `lobby:renameSelf` (own name, global uniqueness checked)
- All changes -> `io.to(roomId).emit("lobby:update", full)` -> instant sync on all clients in room

## Socket Events (see server/src/index.js:1, ARCHITECTURE.md:7)
- **C->S:** `profile:register`, `profile:update`, `rooms:list`, `room:create`, `room:join`, `room:leave`, `room:sync`, `lobby:updateGame`, `lobby:updateMaxPlayers`, `lobby:updateOptions`, `lobby:addBot`, `lobby:removeBot`, `lobby:renameBot`, `lobby:kickPlayer`, `lobby:renameSelf`, `lobby:rename`
- **S->C:** `profile:ok`, `profile:error`, `rooms:update`, `games:list`, `room:created`, `room:joined`, `room:error`, `lobby:update`, `player:kicked`, `user:renamed`


