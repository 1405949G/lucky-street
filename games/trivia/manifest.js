/**
 * games/trivia/manifest.js - Trivia (1-12p)
 * Simple trivia — play for the high score.
 * See ../README.md + AGENTS.md for AI rule.
 */
export default {
  id: "trivia",
  label: "Trivia",
  description: "Simple trivia — play for the high score.",
  minPlayers: 1,
  maxPlayers: 12,
  defaultMaxPlayers: 12,
  supportsBots: false,
  defaultOptions: {
    questionCount: 10,
    timerSeconds: 20,
    questionType: "Random", // Random, Multiple Choice, True / False
  },
  optionSchema: [
    { key: "questionCount", label: "Questions", type: "slider", min: 5, max: 50, step: 5 },
    { key: "timerSeconds", label: "Timer", type: "slider", min: 0, max: 60, step: 5 },
    { key: "questionType", label: "Type", type: "select", options: ["Random","Multiple Choice","True / False"] },
  ],
};
