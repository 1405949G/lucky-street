# `lucky-street/games/` - Game Modules

> **Source of truth for adding games.** AI in new sessions: read `../AGENTS.md:1` first, then this file.

## Why a Folder Per Game?

Lobby (`server/src/rooms.js:14`, `client/src/components/Lobby.jsx:1`) is generic - it only knows `GAMES[id]` manifests. Each game's config, options, and optional play logic lives isolated in `games/<gameId>/`, so adding `ludo` never touches `users.js` or `RoomBrowser`.

```
games/
  README.md                      # you are here
  good-vs-evil/
    manifest.js                  # canonical example - copy this to start
  lucky-roulette/
    manifest.js
  street-rally/
    manifest.js
  checkpoint-chaos/
    manifest.js
  my-new-game/                   # your next game
    manifest.js                  # REQUIRED
    README.md                    # optional design notes
    server.js                    # optional: custom server handlers
    client/
      Game.jsx                   # optional: play UI
```

## Quick Start: Add a Game in 3 Steps

### Step 1 - Create folder + manifest

```bash
mkdir lucky-street/games/my-new-game
```

Copy template `games/good-vs-evil/manifest.js` to `games/my-new-game/manifest.js` and edit:

```js
// games/my-new-game/manifest.js
export default {
  id: "my-new-game",                 // MUST match folder name (kebab-case)
  label: "My New Game",
  description: "One-line pitch for lobby card",
  minPlayers: 2,
  maxPlayers: 6,
  defaultMaxPlayers: 4,              // autofilled in CreateRoomModal.jsx:18
  defaultOptions: {
    rounds: 5,
    powerUps: true,
    track: "city"
  },
  // Drives Lobby.jsx:385 - host sees these, players see read-only
  optionSchema: [
    { key: "rounds",  label: "Rounds",   type: "slider", min: 3, max: 10, step: 1 },
    { key: "powerUps",label: "Power-Ups",type: "toggle" },
    { key: "track",   label: "Track",    type: "select", options: ["city","desert","harbor"] }
    // also: {key, label, type:"slider", min, max, step, unit:"s"}
  ]
}
```

**Rules:**
- `id` === folder name.
- `defaultMaxPlayers` clamped 2-12 but respects `min/max` display.
- `optionSchema` types: `toggle` (boolean), `slider` (number), `select` (enum). Unknown keys are ignored by `server/src/rooms.js:100`.

### Step 2 - Register

Edit `server/src/games.js:1`:

```js
import myNewGame from "../../games/my-new-game/manifest.js";
import quest from "../../games/good-vs-evil/manifest.js";

export const GAMES = {
  "good-vs-evil": quest,
  "my-new-game": myNewGame,
};
export function getGame(id){ return GAMES[id]||null }
export function listGames(){ return Object.values(GAMES) }
export function defaultMaxFor(id){ return getGame(id)?.defaultMaxPlayers ?? 6 }
```

Same file is the server's `games:list` source (`server/src/index.js:30` `socket.emit("games:list", listGames())`) consumed by `client/src/components/CreateRoomModal.jsx:9` and `Lobby.jsx:135`. For a truly shared import, have `server/src/games.js` re-export from `games/*/manifest.js` and have client import via Vite alias or duplicate manifests - keep them in sync.

### Step 3 - Verify

```bash
# server
cd lucky-street/server && npm run dev
# curl check
curl http://localhost:3001/api/games | jq .[].id  # should include "my-new-game"

# client
cd lucky-street/client && npm run build   # must pass
# manual: open http://localhost:5173 -> Create Room dropdown shows "My New Game" -> max autofills 4
# open 2 tabs, host changes slider -> other tab updates instantly via lobby:update
```

## Optional: Full Game (beyond lobby)

If `my-new-game` needs actual play (not just lobby config):

```
games/my-new-game/
  manifest.js
  server.js         # export { onRoomCreate(room), onPlayerAction(room, playerId, action) }
  client/
    Game.jsx        # export default function MyNewGame({room, me}) { ... }
    styles.css
```

Wire it:

- **Server:** in `server/src/index.js:1` add `import * as myGame from "../../games/my-new-game/server.js"` and route `socket.on("game:action", ...)` to `myGame.onPlayerAction`.
- **Client:** in `client/src/App.jsx:1` add route `<Route path="/room/:roomId/play" element={<GameRouter/>}>` that switches on `room.game` to render `games/my-new-game/client/Game.jsx`.

Keep lobby (`RoomManager` + `UserRegistry`) untouched - games handle their own state.

## Checklist (AI: follow exactly)

- [ ] New folder `lucky-street/games/<kebab-id>/` with `manifest.js` matching template
- [ ] `id` equals folder name, `defaultOptions` keys match `optionSchema` keys
- [ ] Registered in `server/src/games.js:6` `GAMES`
- [ ] `npm run build` passes (`client/vite.config.js:1`)
- [ ] `GET /api/games` lists new id, `CreateRoomModal` autofills `defaultMaxPlayers`, `Lobby` sliders toggle live
- [ ] No files added inside `Good vs Evil Game/` - that's legacy
- [ ] No sibling `C:/.../Lucky StreeT/NewGame` at workspace root

## Examples to Copy

- Simplest (toggles only): `games/good-vs-evil/manifest.js`
- Sliders + selects: `games/street-rally/manifest.js`, `games/lucky-roulette/manifest.js`

## Where AI Should Look in New Sessions

1. `lucky-street/AGENTS.md:1` - short rule (folder per game)
2. `lucky-street/games/README.md` (this file) - detailed template
3. `lucky-street/ARCHITECTURE.md:1` - wire protocol, permission matrix
4. `lucky-street/server/src/games.js:1`, `client/src/components/Lobby.jsx:385` - how `optionSchema` is consumed

