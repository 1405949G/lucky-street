/**
 * games/street-trivia/manifest.js - Street Trivia (1-12p)
 * Simple trivia — play for the high score.
 * See ../README.md + AGENTS.md for AI rule.
 */
export default {
  id: "street-trivia",
  label: "Street Trivia",
  description: "Simple trivia — play for the high score.",
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
