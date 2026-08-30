export default {
  id: "lucky-roulette",
  label: "Lucky Roulette",
  description: "Fast betting & bluffing for the whole street",
  minPlayers: 2,
  maxPlayers: 8,
  defaultMaxPlayers: 8,
  supportsBots: false,
  defaultOptions: { rounds: 5, startingChips: 1000, allowSpectators: false },
  optionSchema: [
    { key: "rounds", label: "Rounds", type: "slider", min: 3, max: 10, step: 1 },
    { key: "startingChips", label: "Chips", type: "slider", min: 500, max: 5000, step: 500 },
    { key: "allowSpectators", label: "Spectators", type: "toggle" },
  ],
};
