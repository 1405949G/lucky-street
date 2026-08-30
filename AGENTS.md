# AGENTS — Lucky Street Project Instructions

> **This file is auto-read by AI in new sessions.** Keep it concise and actionable.

## Project Context
- **Monorepo:** `lucky-street/` is the active Lucky Street lobby system — **the full website**. `reference/Avalon Game/` is reference only (legacy static) for recreating Avalon later.
- **Stack:** `client` = React 18 + Vite + Tailwind + Socket.io-client; `server` = Node 20 + Express 4 + Socket.io.
- **Ephemeral stores:** `server/src/users.js:17` (global username Map + 5-min GC) and `server/src/rooms.js:14` (rooms Map). See `ARCHITECTURE.md:1` for full wire protocol.

## How to Add a New Game — The Rule

> **ALL new games go inside `lucky-street/games/<gameId>/` as a separate folder.** Do NOT inline into `server/src/games.js` long-term and do NOT create top-level siblings like `Avalon Game`.

### Folder Contract

```
lucky-street/
  games/
    README.md                 # this guide (detailed)
    <gameId>/                 # e.g. ludo, fake-answers, street-rally
      manifest.js             # REQUIRED — see template below
      # optional extensions:
      server.js               # custom server state machine / validation
      client/
        Game.jsx              # actual play UI (mounted at /room/:id/play)
        assets/               # images, sounds
      rules.md                # design notes
  server/src/games.js:1       # registry that re-exports manifests
  client/src/context/SocketContext.jsx:12 # receives games:list from server
```

### 1 Required File: `manifest.js`

Every game **must** export a default manifest with this shape (example `ludo`):

```js
// lucky-street/games/ludo/manifest.js
export default {
  id: "ludo",                                 // kebab-case, matches folder name
  label: "Ludo",                              // shown in CreateRoomModal dropdown
  description: "Race 4 tokens home",          // subtitle in lobby
  minPlayers: 2,
  maxPlayers: 4,
  defaultMaxPlayers: 4,                       // autofilled in CreateRoomModal.jsx:18
  defaultOptions: { diceCount: 1, safeSpots: true, quickMode: false },
  optionSchema: [                             // rendered generically in Lobby.jsx:385
    { key: "diceCount", label: "Dice", type: "slider", min: 1, max: 2, step: 1 },
    { key: "safeSpots", label: "Safe Spots", type: "toggle" },
    { key: "quickMode", label: "Quick Mode", type: "toggle" },
    // type: "select" also supported: {key:"track", type:"select", options:["city","desert"]}
  ]
}
```

- `defaultMaxPlayers` is **autofilled** when host picks game; host can overwrite (`client/src/components/CreateRoomModal.jsx:18` `useEffect` + `server/src/rooms.js:60` reset).
- `optionSchema` drives host sliders/toggles in `client/src/components/Lobby.jsx:385` and validation in `server/src/rooms.js:100`.

### 2 Register It

Add to `server/src/games.js:6` registry (single source of truth):

```js
import ludoManifest from "../../games/ludo/manifest.js";
import qsManifest from "../../games/quest-of-shadows/manifest.js";

export const GAMES = {
  "quest-of-shadows": qsManifest,
  "ludo": ludoManifest,
  // ...
};
export const getGame = (id) => GAMES[id] || null;
```

`server/src/index.js:30` emits `games:list` on connect; `client/src/components/CreateRoomModal.jsx:9` and `Lobby.jsx:135` consume it. No other lobby code changes needed for lobby-only games.

### 3 Optional: Custom Game Logic

- **Lobby-only game** (just config + options): manifest only — done.
- **Full game** (needs play state): add `games/<id>/server.js` exporting `setupRoom(room)`, `handleAction(...)` and `games/<id>/client/Game.jsx` rendering board. Mount via new route `/room/:id/play` in `client/src/App.jsx:1`. Keep lobby generic; game logic isolated.

### 4 Verify

```bash
cd lucky-street/server && node src/index.js # health at /api/health, /api/games includes new id
cd lucky-street/client && npm run build     # vite build passes
# manual: create room → see new game in dropdown → max autofills → options sync live across tabs
```

### Do NOT

- Do not add games inside `reference/Avalon Game/` — that's reference only.
- Do not create games as top-level `C:/.../Lucky StreeT/NewGame/` sibling — monorepo is `lucky-street/`.
- Do not duplicate `GAMES` object in both server and client — import from `games/<id>/manifest.js`.

### References (file:line)

- Catalog: `server/src/games.js:1`
- Room create autofill: `server/src/rooms.js:42` + `client/src/components/CreateRoomModal.jsx:18`
- Lobby permission matrix: `server/src/rooms.js:86`, `server/src/index.js:120`
- Live sync: `server/src/rooms.js:14` `listPublic()` slotsText + `client/src/components/Lobby.jsx:1`
- GC/identity: `server/src/users.js:17`, `client/src/utils/storage.js:5`

When adding a game, read `lucky-street/games/README.md` for full template and checklist.

