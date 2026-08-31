# UI — Visual-Only Layer

Edit here for colours, shapes, spacing, shadows, hover animations, icons.

**DO NOT change text.** Text lives in `../content/copy.js`.

Allowed:
- `theme.js` — colours, radii, class maps, icons registry
- `primitives.jsx` — Card/Button/Input/Badge (visual classes)
- `../../index.css` + `tailwind.config.js` + `public/assets/*`

Forbidden without user prompt:
- Any string in `copy.js`
- Adding/removing words in `client/src/components/*` or `games/*/client/*`
- Changing `copy.*` values via Edit

If you need new text, ask the user to update `copy.js`.
