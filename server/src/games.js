/**
 * server/src/games.js - Game catalog (authoritative)
 * SINGLE SOURCE: imports manifests from lucky-street/games/<id>/manifest.js
 * To add a game: create lucky-street/games/<newId>/manifest.js (see games/README.md)
 * then import and add entry below. Do NOT inline large objects here.
 * See AGENTS.md and games/README.md for AI instructions in new sessions.
 */

import veilStreet from "../../games/veil-street/manifest.js";
import luckyRoulette from "../../games/lucky-roulette/manifest.js";
import streetRally from "../../games/street-rally/manifest.js";
import checkpointChaos from "../../games/checkpoint-chaos/manifest.js";
import streetTrivia from "../../games/street-trivia/manifest.js";

// When you add a game, import its manifest here and add to GAMES below:
// import myNewGame from "../../games/my-new-game/manifest.js";

export const GAMES = {
  "veil-street": veilStreet,
  "lucky-roulette": luckyRoulette,
  "street-rally": streetRally,
  "checkpoint-chaos": checkpointChaos,
  "street-trivia": streetTrivia,
  // "my-new-game": myNewGame,
};

export function getGame(id) {
  return GAMES[id] || null;
}

export function listGames() {
  return Object.values(GAMES);
}

export function defaultMaxFor(gameId) {
  const g = getGame(gameId);
  return g ? g.defaultMaxPlayers : 6;
}
