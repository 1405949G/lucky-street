# AGENTS - Lucky Street Project Instructions

> **Auto-read by AI in new sessions. This is the full website. Read this + `games/README.md:1` before creating games.**

## TEXT LOCK — UI Text Must Never Change Without Explicit User Prompt (AI: obey strictly)

**Rule: AI may change colours, shapes, spacing, shadows, hover animations, and add icons — but MUST NOT change any user-facing text.**

- **Single source of truth:** `client/src/content/copy.js:1` holds every string the player reads (brand, buttons, modals, toasts, tips, lobby, game rules).
- **Visual-only allowlist:** `client/src/ui/theme.js:1`, `client/src/ui/primitives.jsx:1`, `client/src/index.css:1`, `tailwind.config.js:1`, `client/public/assets/*` — edit these for visuals.
- **Blocked without `change text:` prompt:** Do NOT edit `client/src/content/copy.js:1`, do NOT alter string literals in `client/src/components/*`, `games/*/client/*`, or `games/*/manifest.js` labels/descriptions.
- **If you need new text:** Ask the user. Do not invent copy. Wait for explicit `change text: "old" -> "new"` or user approval to add a key to `copy.js`.
- **Icons:** Add icons/symbols via `client/src/ui/theme.js:18` `icons` registry or inline SVG — never by replacing words.
- **This protects playability:** Text was locked after revert `930f746` because mass UI revamps kept breaking wording. Visuals go in `client/src/ui/` so a visuals-only AI never touches game logic `server/src/durable/LuckyStreetDO.js:1` or `client/src/context/SocketContext.jsx:1`.

## Project Context

- **Monorepo:** `lucky-street/` is the **full website** (not `reference/Veil Street Game/` which is legacy reference for recreating Veil Street later).
- **Purpose:** Real-time party game lobby - identity + ephemeral rooms + host/player permission matrix + live sync. Games are pluggable modules.
- **Root docs:** `README.md:1` (quick start), `ARCHITECTURE.md:1` (wire protocol), `TESTING.md:1` (manual checklist), `games/README.md:1` (game template).

## Tech Stack - Option B (Pure Cloudflare, no Render)

**Current target: 100% Cloudflare free tier, deployed via GitHub Desktop + Cloudflare Dashboard (no terminal).**

| Layer | Implementation | File |
|-------|----------------|------|
| **Frontend** | React 18 + Vite + Tailwind + React Router. Dual-mode socket: `socket.io-client` for Node fallback, **native WebSocket** for Workers. | `client/src/context/SocketContext.jsx:1` auto-selects: `VITE_SERVER_URL` contains `workers.dev` -> native WS (`/ws`), else `socket.io`. |
| **Backend (Option B)** | **Cloudflare Workers + Durable Object** (`LuckyStreetDO` singleton `global`) - holds `users` + `rooms` Maps in-memory + `storage.setAlarm` for 5-min GC. Reuses same logic as Node. | `server/src/worker.js:1` (entry), `server/src/durable/LuckyStreetDO.js:1` (all events), `server/wrangler.toml:1` |
| **Backend (Option A fallback)** | Node 20 + Express 4 + Socket.io (`server/src/index.js:14`) - kept for local `node --watch` or Render. Same `users.js`/`rooms.js` logic. | `server/src/index.js:1`, `server/src/users.js:17`, `server/src/rooms.js:14` |
| **Catalog** | Single source: `games/<id>/manifest.js` imported by `server/src/games.js:1`. | `games/veil-street/manifest.js:1` is canonical template |
| **Ephemeral DB** | `users` Map: `lower -> {socketId, username, avatar, timer, expiresAt}` + `rooms` Map. GC 5min (`GC_MS`). In DO uses `setAlarm`, in Node uses `setTimeout` + grace reclaim. | `server/src/users.js:17`, `server/src/durable/LuckyStreetDO.js:1` `alarm()` |

**No Render needed for Option B.** Frontend on **Pages**, backend on **Workers** - both free, both GitHub-connected.

## How It Works (for AI)

### 1. Identity & Profile Caching (`client/src/utils/storage.js:5` + `server/src/users.js:17`)
- Client key `localStorage["luckyStreet:profile"] = {username, avatar (hex or base64), avatarType}`. `AvatarPicker` (`client/src/components/AvatarPicker.jsx:1`) converts file -> base64.
- `ProfileContext` hydrates; if null -> `IdentityModal` (non-blocking on `/`, blocking on `/room/:id` `Lobby.jsx:34`). On submit emits `profile:register` -> DO/Node validates global uniqueness (case-insensitive). Return refresh bypasses modal.
- `profile:register` grace reclaim: if `users` entry has `timer` (disconnected), clear timer, update `socketId` -> owner reconnect succeeds. Active duplicate -> reject.

### 2. Rooms & GC
- `generateRoomId()` (`server/src/utils.js:6`) 4-char `A-Z0-9` via `crypto`. `RoomManager.create()` (`server/src/rooms.js:42`) stores `hostId/hostName/game/maxPlayers/passwordHash/gameOptions/players/bots`.
- `listPublic()` builds card: `slotsText = "${players+ bots} / ${max} Players (including ${bots} Bots)"` + `isPrivate` padlock (`server/src/rooms.js:14`).
- Disconnect -> `handleDisconnect` sets `expiresAt = now+GC_MS`, starts timer/alarm. Reconnect within grace -> cancel. After `GC_MS` -> delete `byName`/`bySocket` -> name freed.

### 3. Lobby Permission Matrix (`server/src/rooms.js:86`, `server/src/durable/LuckyStreetDO.js:1` `handleEvent`)
- Host only: `lobby:updateGame` (resets `maxPlayers` to new game's `defaultMaxPlayers` + defaults), `updateMaxPlayers` (2-12, ≥ occupancy), `updateOptions` (validates `optionSchema`), `addBot`/`removeBot`/`renameBot` (custom names), `kickPlayer` (not self), rename bots+self.
- Player only: `lobby:renameSelf` / `lobby:rename` self (global uniqueness checked).
- All mutations -> `broadcast({event:"lobby:update", data:full})` + `rooms:update` -> all clients in room instantly re-render (`client/src/components/Lobby.jsx:1`). Host changes appear view-only for players.

### 4. Wire Protocol (same for Node and DO)
C->S: `profile:register`, `profile:update`, `rooms:list`, `room:create`, `room:join`, `room:leave`, `room:sync`, `lobby:updateGame`, `lobby:updateMaxPlayers`, `lobby:updateOptions`, `lobby:addBot`, `lobby:removeBot`, `lobby:renameBot`, `lobby:kickPlayer`, `lobby:renameSelf`/`lobby:rename`
S->C: `rooms:update`, `games:list`, `profile:ok`/`profile:error`, `room:created`/`room:joined`/`room:error`, `lobby:update`, `player:kicked`, `user:renamed`
- Native WS wraps as `{event, data, ackId}` -> `{type:"ack", ackId, data}` for ack callbacks (`client/src/context/SocketContext.jsx:1` `NativeSocket`).

## How to Add a New Game - The Rule (AI: follow exactly)

> **ALL new games go inside `lucky-street/games/<gameId>/manifest.js` as a separate folder.** Do NOT inline into `server/src/games.js` long-term and do NOT create siblings like `Lucky StreeT/MyNewGame`.

```
lucky-street/
  games/
    README.md                 # detailed guide
    <gameId>/                 # e.g. ludo, fake-answers
      manifest.js             # REQUIRED
      server.js               # optional: custom play logic
      client/
        Game.jsx              # optional: board UI mounted at /room/:id/play
```

**1 Required File: `games/<id>/manifest.js`** (copy `games/veil-street/manifest.js:1`):

```js
export default {
  id: "ludo",  // kebab, == folder name
  label: "Ludo",
  description: "Race 4 tokens home",
  minPlayers: 2, maxPlayers: 4, defaultMaxPlayers: 4, // autofilled in CreateRoomModal.jsx:18
  defaultOptions: { diceCount: 1, safeSpots: true },
  optionSchema: [ // drives Lobby.jsx:385 sliders/toggles, validated in rooms.js:100
    { key: "diceCount", label: "Dice", type: "slider", min:1, max:2, step:1 },
    { key: "safeSpots", label: "Safe Spots", type: "toggle" },
    // type:"select" also: {key:"track", type:"select", options:["city","desert"]}
  ]
}
```

**2 Register:** Add to `server/src/games.js:1`:

```js
import ludo from "../../games/ludo/manifest.js";
export const GAMES = { "veil-street": questOfShadows, "ludo": ludo };
```

`worker.js` and `index.js` both emit `games:list` on WS open; `client/src/components/CreateRoomModal.jsx:9` + `Lobby.jsx:135` consume it - no other lobby changes needed for lobby-only games.

**3 Optional full game:** add `games/<id>/server.js` + `games/<id>/client/Game.jsx`, mount route `/room/:id/play` in `client/src/App.jsx:1`. Keep lobby generic.

**4 Verify:** `curl https://<worker>/api/games` includes new id; `client` `npm run build` passes; create room -> see new game in dropdown -> max autofills -> host slider syncs live.

**Do NOT:** add inside `reference/Veil Street Game/`; create workspace sibling; duplicate `GAMES` in client/server.

## Deployment (GitHub Desktop + Cloudflare Dashboard, no terminal)

**GitHub Desktop:**
- File -> Add Local Repository -> Choose `lucky-street` -> Create Repository if needed -> Publish to `github.com/<you>/lucky-street`.

**Cloudflare (pure free, no Render):**
1. **Workers (server):** dash.cloudflare.com -> Workers & Pages -> Create -> Worker -> Connect to Git -> select `lucky-street` -> Root directory `server` -> Build not needed (Worker builds via `wrangler.toml:1`). Add bindings auto from `wrangler.toml` (`LOBBY_DO`). Set Variables: `GC_MS=300000`, `CLIENT_ORIGIN=https://<pages>.pages.dev` (fill after next step, then redeploy).
2. **Pages (client):** Create -> Pages -> Connect to Git -> same repo -> Root `client` -> Build `npm run build` / Output `dist` -> Variables: `VITE_SERVER_URL=https://lucky-street-server.<you>.workers.dev` + `NODE_VERSION=20` -> Deploy.
3. Update Worker `CLIENT_ORIGIN` to Pages URL -> Redeploy Worker. Test `https://<worker>/api/health` -> `https://<pages>/` -> create room.

Local test: `npx wrangler dev --local --port 3001` (if you have terminal) or keep `node src/index.js` fallback - client `SocketContext` auto-switches transport.

## Performance (why Option B for pure Cloudflare)

- **Render free:** single region, sleeps after 15m -> 5-15s cold start, single `Map` lost on restart.
- **Workers DO:** edge (300 PoPs), no sleep, DO `alarm()` survives hibernation, shards by `roomId` -> global ~10-30ms vs 40-120ms for Render. For test lobby difference negligible; scale to many regions favors Workers (see `ARCHITECTURE.md:9`).

## UI Visual-Only Layer (for safe re-theming)

- **Copy (locked):** `client/src/content/copy.js:1` + `client/src/content/README.md:1`
- **Theme (free to edit):** `client/src/ui/theme.js:1` (colours, radii, Tailwind class maps), `client/src/ui/primitives.jsx:1` (Card/Button/Input/Badge + Icon), `client/src/index.css:1`, `tailwind.config.js:1`
- **Assets (free):** `client/public/assets/*` — add hero/icons here, reference via `theme.js:18` icons
- **Workflow for visuals:** Prompt `visual only: update theme` → AI edits only `client/src/ui/*`, `index.css`, `tailwind.config.js`, `public/assets/*`. Text stays in `copy.js`.
- **Workflow for text:** Prompt `change text: ...` → AI may edit `copy.js:1` and the one component that imports that key. Keep diff small, one section at a time (main menu `App.jsx:1`/`RoomBrowser.jsx:1`, then lobby `Lobby.jsx:1`, then game `games/veil-street/client/Game.jsx:1`).

## References

- Catalog/DO: `server/src/games.js:1`, `server/src/durable/LuckyStreetDO.js:1`, `server/wrangler.toml:1`
- Lobby: `server/src/rooms.js:14,42,86`, `client/src/components/Lobby.jsx:1,385`, `client/src/components/CreateRoomModal.jsx:18`
- Identity/GC: `server/src/users.js:17`, `client/src/utils/storage.js:5`
- Games guide: `games/README.md:1`
- Full website = `lucky-street/`; reference = `reference/Veil Street Game/`

