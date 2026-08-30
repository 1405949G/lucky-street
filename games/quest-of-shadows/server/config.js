/**
 * games/quest-of-shadows/server/config.js — Ported from reference Avalon Game v3
 * Pure constants, no side effects.
 */
export const PHASES = Object.freeze({
  LOBBY: 'LOBBY',
  ROLE_REVEAL: 'ROLE_REVEAL',
  TEAM_PROPOSAL: 'TEAM_PROPOSAL',
  TEAM_VOTE: 'TEAM_VOTE',
  TEAM_VOTE_REVEAL: 'TEAM_VOTE_REVEAL',
  QUEST_VOTE: 'QUEST_VOTE',
  QUEST_REVEAL: 'QUEST_REVEAL',
  ASSASSINATION: 'ASSASSINATION',
  GAME_OVER: 'GAME_OVER',
});

export const ALLOWED_TRANSITIONS = Object.freeze({
  [PHASES.LOBBY]: ['SETUP_GAME', 'CREATE_ROOM', 'JOIN_ROOM'],
  [PHASES.ROLE_REVEAL]: ['MARK_REVEALED', 'NEXT_REVEAL', 'COMPLETE_REVEAL', 'REVEAL_ROLE'],
  [PHASES.TEAM_PROPOSAL]: ['PROPOSE_TEAM'],
  [PHASES.TEAM_VOTE]: ['SUBMIT_TEAM_VOTE', 'FORCE_TEAM_VOTE_REVEAL', 'TIMER_EXPIRED'],
  [PHASES.TEAM_VOTE_REVEAL]: ['RESOLVE_TEAM_VOTE'],
  [PHASES.QUEST_VOTE]: ['SUBMIT_QUEST_VOTE', 'FORCE_QUEST_REVEAL'],
  [PHASES.QUEST_REVEAL]: ['RESOLVE_QUEST'],
  [PHASES.ASSASSINATION]: ['ASSASSINATE'],
  [PHASES.GAME_OVER]: ['RESET', 'SETUP_GAME'],
});

export const QUEST_SIZES = Object.freeze({
  5: Object.freeze([2, 3, 2, 3, 3]),
  6: Object.freeze([2, 3, 4, 3, 4]),
  7: Object.freeze([2, 3, 3, 4, 4]),
  8: Object.freeze([3, 4, 4, 5, 5]),
  9: Object.freeze([3, 4, 4, 5, 5]),
  10: Object.freeze([3, 4, 4, 5, 5]),
});

export const FAILS_REQUIRED = Object.freeze({
  5: Object.freeze([1, 1, 1, 1, 1]),
  6: Object.freeze([1, 1, 1, 1, 1]),
  7: Object.freeze([1, 1, 1, 2, 1]),
  8: Object.freeze([1, 1, 1, 2, 1]),
  9: Object.freeze([1, 1, 1, 2, 1]),
  10: Object.freeze([1, 1, 1, 2, 1]),
});

export const ROLE_COUNTS = Object.freeze({
  5: Object.freeze({ good: 3, evil: 2, merlin: 1, assassin: 1, loyal: 2, minion: 1 }),
  6: Object.freeze({ good: 4, evil: 2, merlin: 1, assassin: 1, loyal: 3, minion: 1 }),
  7: Object.freeze({ good: 4, evil: 3, merlin: 1, assassin: 1, loyal: 3, minion: 2 }),
  8: Object.freeze({ good: 5, evil: 3, merlin: 1, assassin: 1, loyal: 4, minion: 2 }),
  9: Object.freeze({ good: 6, evil: 3, merlin: 1, assassin: 1, loyal: 5, minion: 2 }),
  10: Object.freeze({ good: 6, evil: 4, merlin: 1, assassin: 1, loyal: 5, minion: 3 }),
});

export const ROLES = Object.freeze({
  LOYAL: 'LOYAL',
  MERLIN: 'MERLIN',
  PERCIVAL: 'PERCIVAL',
  MINION: 'MINION',
  ASSASSIN: 'ASSASSIN',
  MORGANA: 'MORGANA',
  MORDRED: 'MORDRED',
  OBERON: 'OBERON',
});

export const EXTRA_ROLES = Object.freeze([
  { key: 'percival', role: ROLES.PERCIVAL, label: 'Percival', side: 'GOOD', desc: 'Sees Merlin' },
  { key: 'morgana', role: ROLES.MORGANA, label: 'Morgana', side: 'EVIL', desc: 'Fools Percival' },
  { key: 'mordred', role: ROLES.MORDRED, label: 'Mordred', side: 'EVIL', desc: 'Hidden from Merlin' },
  { key: 'oberon', role: ROLES.OBERON, label: 'Oberon', side: 'EVIL', desc: 'Isolated Evil' },
]);

export function getMaxExtraEvil(playerCount) {
  if (playerCount <= 6) return 1;
  if (playerCount <= 8) return 2;
  return 3;
}
export function getEffectiveExtraRoles(playerCount, opts) {
  const max = getMaxExtraEvil(playerCount);
  const enabled = ['morgana','mordred','oberon'].filter(k=> !!opts[k]);
  if (enabled.length <= max) return { ...opts };
  const trimmed = { ...opts, morgana:false, mordred:false, oberon:false };
  for (let i=0;i<Math.min(enabled.length, max);i++) trimmed[enabled[i]] = true;
  return trimmed;
}

export const ALLEGIANCE = Object.freeze({
  GOOD: 'GOOD',
  EVIL: 'EVIL',
});

export function allegianceOf(role) {
  if (role === ROLES.LOYAL || role === ROLES.MERLIN || role === ROLES.PERCIVAL) return ALLEGIANCE.GOOD;
  return ALLEGIANCE.EVIL;
}

export const MAX_PROPOSAL_TRACKER = 5;
export const WIN_THRESHOLD = 3;
export const TIMER_SECONDS = 90;
export const REVEAL_ANIM_MS = 1200;
export const STORAGE_VERSION = 3;

export function getQuestSize(playerCount, questIndex) {
  const sizes = QUEST_SIZES[playerCount];
  if (!sizes) throw new Error(`Unsupported player count: ${playerCount}`);
  if (questIndex < 0 || questIndex >= 5) throw new Error(`Invalid quest index: ${questIndex}`);
  return sizes[questIndex];
}

export function getFailsRequired(playerCount, questIndex) {
  const fails = FAILS_REQUIRED[playerCount];
  if (!fails) throw new Error(`Unsupported player count: ${playerCount}`);
  return fails[questIndex];
}

export function getRoleList(playerCount, opts = {}) {
  const c = ROLE_COUNTS[playerCount];
  if (!c) throw new Error(`Unsupported player count: ${playerCount}`);
  const effective = getEffectiveExtraRoles(playerCount, opts);
  let loyal = c.loyal;
  let minion = c.minion;
  const roles = [];
  roles.push(ROLES.MERLIN);
  roles.push(ROLES.ASSASSIN);
  if (effective.percival && loyal > 0) {
    roles.push(ROLES.PERCIVAL);
    loyal--;
  }
  if (effective.morgana && minion > 0) {
    roles.push(ROLES.MORGANA);
    minion--;
  }
  if (effective.mordred && minion > 0) {
    roles.push(ROLES.MORDRED);
    minion--;
  }
  if (effective.oberon && minion > 0) {
    roles.push(ROLES.OBERON);
    minion--;
  }
  for (let i=0;i<loyal;i++) roles.push(ROLES.LOYAL);
  for (let i=0;i<minion;i++) roles.push(ROLES.MINION);
  while (roles.length < playerCount) roles.push(ROLES.LOYAL);
  while (roles.length > playerCount) {
    const idx = roles.findIndex(r => r===ROLES.LOYAL || r===ROLES.MINION);
    if (idx!==-1) roles.splice(idx,1);
    else break;
  }
  return roles;
}
