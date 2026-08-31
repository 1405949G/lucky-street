# Content — Text Lock

This folder holds **all user-facing text**.

- `copy.js:1` is the single source of truth (app/roomBrowser/lobby/common + per-game labels via manifest).
- Visual-only AI must **never edit** `copy.js:1`.
- Text changes require explicit user prompt like: `change text: "old" -> "new"` (one key + its consumer).

Visual AI — where to work instead:
- Global shell: `client/src/ui/theme.js:1`, `client/src/ui/primitives.jsx:1`, `client/src/index.css:1`, `tailwind.config.js:1`, `client/public/assets/*`
- Per-game: `games/<id>/client/*` owns its own colours/hero/icons — do NOT import global theme
