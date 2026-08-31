# Content — Text Lock

This folder holds **all user-facing text**.

- `copy.js` is the single source of truth.
- Visual-only AI must **never edit** `copy.js`.
- Text changes require explicit user prompt like: `change text: ...`

Visual AI — where to work instead:
- `client/src/ui/theme.js`
- `client/src/ui/primitives.jsx`
- `client/src/index.css`
- `tailwind.config.js`
- `client/public/assets/*` (icons/hero)
