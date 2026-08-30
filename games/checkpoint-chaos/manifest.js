export default {
  id: "checkpoint-chaos",
  label: "Checkpoint Chaos",
  description: "Co-op chaos — hit every checkpoint before time runs out",
  minPlayers: 2,
  maxPlayers: 4,
  defaultMaxPlayers: 4,
  defaultOptions: { difficulty: "normal", timeLimit: 120, friendlyFire: false },
  optionSchema: [
    { key: "difficulty", label: "Difficulty", type: "select", options: ["easy", "normal", "hard"] },
    { key: "timeLimit", label: "Time Limit", type: "slider", min: 60, max: 300, step: 30, unit: "s" },
    { key: "friendlyFire", label: "Friendly Fire", type: "toggle" },
  ],
};
