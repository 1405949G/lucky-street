export default {
  id: "street-rally",
  label: "Street Rally",
  description: "Dice racing down Lucky Street — first to finish wins",
  minPlayers: 2,
  maxPlayers: 6,
  defaultMaxPlayers: 6,
  supportsBots: true,
  defaultOptions: { laps: 3, powerUps: true, track: "city" },
  optionSchema: [
    { key: "laps", label: "Laps", type: "slider", min: 1, max: 5, step: 1 },
    { key: "powerUps", label: "Power-Ups", type: "toggle" },
    { key: "track", label: "Track", type: "select", options: ["city", "desert", "harbor"] },
  ],
};
