/**
 * games/trivia/server/config.js - Trivia config
 */
export const PHASES = Object.freeze({
  LOBBY: "LOBBY",
  QUESTION: "QUESTION",
  REVEAL: "REVEAL",
  GAME_OVER: "GAME_OVER",
});

export const ALLOWED_TRANSITIONS = Object.freeze({
  [PHASES.LOBBY]: ["SETUP_GAME"],
  [PHASES.QUESTION]: ["SUBMIT_ANSWER", "REVEAL_QUESTION", "TIMER_EXPIRED", "FORCE_REVEAL"],
  [PHASES.REVEAL]: ["NEXT_QUESTION", "ACK_REVEAL", "GAME_OVER"],
  [PHASES.GAME_OVER]: ["RESET", "SETUP_GAME"],
});

export const CATEGORIES = ["general","science","history","geography","pop","movies","music","sports","tech","random"];

export const REVEAL_MS = 4500; // public reveal duration before next Q
export const STORAGE_VERSION = 1;

export function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
