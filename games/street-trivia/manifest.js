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
    category: "Random",
    questionType: "Random", // Random, Multiple Choice, True / False
  },
  optionSchema: [
    { key: "questionCount", label: "Questions", type: "slider", min: 5, max: 50, step: 1 },
    { key: "timerSeconds", label: "Timer (s)", type: "slider", min: 10, max: 45, step: 5 },
    { key: "category", label: "Category", type: "select", options: ["Random","General Knowledge","Entertainment: Books","Entertainment: Film","Entertainment: Music","Entertainment: Musicals & Theatres","Entertainment: Television","Entertainment: Video Games","Entertainment: Board Games","Science & Nature","Science: Computers","Science: Mathematics","Mythology","Sports","Geography","History","Politics","Art","Celebrities","Animals","Vehicles","Entertainment: Comics","Science: Gadgets","Entertainment: Japanese Anime & Manga","Entertainment: Cartoon & Animations"] },
    { key: "questionType", label: "Type", type: "select", options: ["Random","Multiple Choice","True / False"] },
  ],
};
