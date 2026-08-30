/**
 * games/veil-street/manifest.js - Veil Street (social deduction, 5-10p)
 * See ../README.md for full guide and AGENTS.md for AI rule.
 */
export default {
  id: "veil-street",
  label: "Veil Street",
  description: "Social deduction - Good vs Evil, hidden roles",
  minPlayers: 5,
  maxPlayers: 10,
  defaultMaxPlayers: 10,
  supportsBots: true,
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
