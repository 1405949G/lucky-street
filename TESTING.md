# Manual Test Checklist

## Identity & Caching
- [ ] Open http://localhost:5173 → IdentityModal appears (no profile). Pick username "Maya" + red avatar + Upload png → Base64 preview → Save. Refresh → no modal, still Maya.
- [ ] Close tab, reopen → still Maya (localStorage).
- [ ] Open second browser/incognito, try "Maya" → server rejects: "already taken".
- [ ] Disconnect Maya (close tab), within 5 min try new tab "Maya" → grace reclaim succeeds (or blocked if strict mode). After 5 min (or GC_MS=10000 + wait 11s), try again → succeeds as freed.

## Direct Room Link
- [ ] As Alice, create room → copy /room/XXXX link. Open incognito with no profile, paste link → blocking IdentityModal appears, cannot see lobby behind. Complete profile → lobby loads.
- [ ] With existing profile, paste link → directly enters lobby, no blocking.

## Room Browser
- [ ] Two browsers: A creates room, B sees live RoomCard appear without refresh (slotsText update).
- [ ] Card shows: Host Name, game label, padlock if private, "X / Y Players (including Z Bots)".
- [ ] Filter box: type host name → filters live.
- [ ] Join by ID box: enter 4-char code, with correct case-insensitive, join. Wrong ID → error.

## Room Creation
- [ ] Create Room modal: dropdown games (Veil Street, Lucky Roulette, etc.). Select "Lucky Roulette" → Max Players autofills 8. Edit to 6 → overwrite persists.
- [ ] Leave password empty → open room (🔓). Set "secret" → private (🔒). Creation generates 4-char ID e.g., "7F2A" shown in invite card.

## Lobby Permissions
- [ ] Host: change game → all clients see game change instantly; Max Players resets to new game's default (overwritable).
- [ ] Host: move slider (e.g., Rounds 5→8) → players see instantly (global visibility).
- [ ] Host: Add Bot "AlphaBot" purple → all see bot in grid. Rename bot → all see rename. Remove bot → all see removal. Kick player → kicked sees "You were kicked" toast and returns to /.
- [ ] Host: rename self "Alice2" → succeeds, invite card host updates, rooms browser updates.
- [ ] Player: try to change game via devtools `socket.emit("lobby:updateGame")` → server rejects "Only host can do this".
- [ ] Player: Add Bot → rejected. Rename bot → rejected. Can rename self to "Bob2" → succeeds (global uniqueness checked). Try duplicate "Alice" → rejected.
- [ ] Any rename / game / option change reflects across 3+ tabs instantly.

## Automated
```bash
cd server && node src/index.js  # health at /api/health
cd client && npm run build      # vite build passes
cd client && node test-lucky.js # full socket flow passes (run with GC_MS small for GC test)
```
