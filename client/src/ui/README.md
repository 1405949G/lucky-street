# UI — Visual-Only Layer (global shell only)

Main menu + lobby chrome. Per-game look lives in `games/<id>/client/` — do not touch games here.

Edit here for colours, shapes, spacing, shadows, hover animations, icons.

**DO NOT change text.** Text lives in `../content/copy.js`.

Allowed (global shell):
- `theme.js` — palette, radii, class maps, icons registry for shell
- `primitives.jsx` — optional Card/Button/Input/Badge helpers (shell only)
- `../../index.css` + `tailwind.config.js` + `public/assets/*`

Per-game: `games/<id>/client/Game.jsx:1` owns its own colours/hero/icons. When scoping a visual pass, pick ONE: global shell OR one game's folder — never both in one run (avoids retesting all games).

Forbidden without `change text:` prompt:
- Any string in `copy.js`
- Adding/removing words in `client/src/components/*` or `games/*/client/*`
- Changing `copy.*` values via Edit

If you need new text, ask the user to update `copy.js`.
