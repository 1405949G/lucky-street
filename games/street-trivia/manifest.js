/**
 * games/street-trivia/manifest.js - Street Trivia (1-12p)
 * Simple trivia — play for the high score, teams can share a device, solo allowed.
 * See ../README.md + AGENTS.md for AI rule.
 */
export default {
  id: "street-trivia",
  label: "Street Trivia",
  description: "Simple trivia — chase the high score. Teams share a device, solo allowed",
  minPlayers: 1,
  maxPlayers: 12,
  defaultMaxPlayers: 12,
  supportsBots: false,
  defaultOptions: {
    questionCount: 10,
    timerSeconds: 20,
    category: "mixed",
    difficulty: "mixed",
  },
  optionSchema: [
    { key: "questionCount", label: "Questions", type: "slider", min: 5, max: 30, step: 1 },
    { key: "timerSeconds", label: "Timer (s)", type: "slider", min: 10, max: 45, step: 5 },
    { key: "category", label: "Category", type: "select", options: ["mixed","general","science","history","geography","pop","movies","music","sports","tech"] },
    { key: "difficulty", label: "Difficulty", type: "select", options: ["mixed","easy","medium","hard"] },
  ],
};
