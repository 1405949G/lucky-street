/**
 * games/quest-of-shadows/manifest.js — Canonical game module template
 * Copy this file to games/<newId>/manifest.js when adding a game.
 * See ../README.md for full guide and AGENTS.md for AI rule.
 */
export default {
  id: "quest-of-shadows",
  label: "Quest of Shadows",
  description: "Social deduction — Good vs Evil, Merlin & Assassin",
  minPlayers: 5,
  maxPlayers: 10,
  defaultMaxPlayers: 10,
  defaultOptions: {
    percival: true,
    morgana: true,
    mordred: false,
    oberon: false,
  },
  optionSchema: [
    { key: "percival", label: "Percival", type: "toggle", side: "GOOD" },
    { key: "morgana", label: "Morgana", type: "toggle", side: "EVIL" },
    { key: "mordred", label: "Mordred", type: "toggle", side: "EVIL" },
    { key: "oberon", label: "Oberon", type: "toggle", side: "EVIL" },
  ],
};
