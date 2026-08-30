/**
 * server/src/questScheduler.js — Shared AI + effect scheduler for Quest of Shadows
 * Used by both Node (server/src/index.js) and DO (durable/LuckyStreetDO.js)
 * All scheduling uses setTimeout (Node) — for DO, alarm fallback also works via idle sweep but we keep setTimeout for immediacy.
 * Caller must provide: roomManager, roomId, broadcast function, and dispatchInternal.
 */

import * as questAI from "../../games/quest-of-shadows/server/ai.js";
import { getAIView, getPublicState } from "../../games/quest-of-shadows/server/state.js";

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

export function handleQuestEffects({ roomManager, roomId, effects, broadcast, dispatchInternal }) {
  if (!effects || !effects.length) return;
  for (const eff of effects) {
    switch (eff.type) {
      case 'ENTER_TEAM_PROPOSAL': {
        // Check if leader is bot -> auto propose
        scheduleBotPropose({ roomManager, roomId, broadcast, dispatchInternal });
        break;
      }
      case 'ENTER_TEAM_VOTE': {
        scheduleBotTeamVotes({ roomManager, roomId, broadcast, dispatchInternal, generation: eff.generation });
        break;
      }
      case 'SCHEDULE_TEAM_VOTE_RESOLVE': {
        setTimeout(() => {
          const res = dispatchInternal(roomId, { type: 'RESOLVE_TEAM_VOTE' });
          if (res) {
            broadcast(roomId);
            handleQuestEffects({ roomManager, roomId, effects: res.effects, broadcast, dispatchInternal });
          }
        }, eff.ms || 1400);
        break;
      }
      case 'ENTER_QUEST_VOTE': {
        scheduleBotQuestVotes({ roomManager, roomId, broadcast, dispatchInternal });
        break;
      }
      case 'SCHEDULE_QUEST_RESOLVE': {
        setTimeout(() => {
          const res = dispatchInternal(roomId, { type: 'RESOLVE_QUEST' });
          if (res) {
            broadcast(roomId);
            handleQuestEffects({ roomManager, roomId, effects: res.effects, broadcast, dispatchInternal });
          }
        }, eff.ms || 1600);
        break;
      }
      case 'ENTER_ASSASSINATION': {
        scheduleBotAssassinate({ roomManager, roomId, broadcast, dispatchInternal });
        break;
      }
      case 'ENTER_ROLE_REVEAL': {
        // Bots auto-reveal after short delay
        scheduleBotReveals({ roomManager, roomId, broadcast, dispatchInternal });
        break;
      }
      case 'ENTER_GAME_OVER': {
        // Game over — no further AI, but scoring is in state (winner, winReason, quests)
        break;
      }
      default:
        break;
    }
  }
}

function scheduleBotPropose({ roomManager, roomId, broadcast, dispatchInternal }) {
  const room = roomManager.get(roomId);
  if (!room || !room.gameState) return;
  const gs = room.gameState;
  const leader = gs.players[gs.leaderIndex];
  if (!leader || !leader.isBot) return;
  const gen = gs.voteGeneration;
  const botDelay = 700 + Math.random() * 600;
  setTimeout(() => {
    const curRoom = roomManager.get(roomId);
    if (!curRoom || !curRoom.gameState) return;
    const cur = curRoom.gameState;
    if (cur.phase !== 'TEAM_PROPOSAL') return;
    if (cur.voteGeneration !== gen) return;
    if (cur.players[cur.leaderIndex]?.id !== leader.id) return;
    try {
      const view = getAIView(cur, leader.id);
      const team = questAI.aiProposeTeam(view);
      const res = dispatchInternal(roomId, { type: 'PROPOSE_TEAM', payload: { teamIds: team, proposerId: leader.id } });
      if (res) {
        broadcast(roomId);
        handleQuestEffects({ roomManager, roomId, effects: res.effects, broadcast, dispatchInternal });
      }
    } catch (e) { console.warn('[bot propose] ', e.message); }
  }, botDelay);
}

function scheduleBotTeamVotes({ roomManager, roomId, broadcast, dispatchInternal, generation }) {
  const room = roomManager.get(roomId);
  if (!room || !room.gameState) return;
  const gs = room.gameState;
  const genAtEntry = generation ?? gs.voteGeneration;
  gs.players.forEach((p, idx) => {
    if (!p.isBot) return;
    if (gs.proposal.votes[p.id]) return;
    const d = 600 + idx * 350 + Math.random() * 400;
    setTimeout(() => {
      const curRoom = roomManager.get(roomId);
      if (!curRoom || !curRoom.gameState) return;
      const cur = curRoom.gameState;
      if (cur.phase !== 'TEAM_VOTE') return;
      if (cur.voteGeneration !== genAtEntry) return;
      if (cur.proposal.votes[p.id]) return;
      if (cur.phaseLock) return;
      try {
        const view = getAIView(cur, p.id);
        const vote = questAI.aiTeamVote(view, cur.proposal.teamIds);
        const res = roomManager.handleQuestAction({ roomId, socketId: p.id, actionType: 'SUBMIT_TEAM_VOTE', payload: { vote } });
        if (res) {
          broadcast(roomId);
          handleQuestEffects({ roomManager, roomId, effects: res.effects, broadcast, dispatchInternal });
        }
      } catch (e) { console.warn('[bot team vote] ', e.message); }
    }, d);
  });
}

function scheduleBotQuestVotes({ roomManager, roomId, broadcast, dispatchInternal }) {
  const room = roomManager.get(roomId);
  if (!room || !room.gameState) return;
  const gs = room.gameState;
  gs.proposal.teamIds.forEach((pid, idx) => {
    const p = gs.players.find(x => x.id === pid);
    if (!p?.isBot) return;
    if (gs.questVotes[pid]) return;
    const d = 800 + idx * 500 + Math.random() * 600;
    setTimeout(() => {
      const curRoom = roomManager.get(roomId);
      if (!curRoom || !curRoom.gameState) return;
      const cur = curRoom.gameState;
      if (cur.phase !== 'QUEST_VOTE') return;
      if (cur.questVotes[pid]) return;
      if (cur.phaseLock) return;
      try {
        const view = getAIView(cur, p.id);
        const vote = questAI.aiQuestVote(view);
        const res = roomManager.handleQuestAction({ roomId, socketId: pid, actionType: 'SUBMIT_QUEST_VOTE', payload: { vote } });
        if (res) {
          broadcast(roomId);
          handleQuestEffects({ roomManager, roomId, effects: res.effects, broadcast, dispatchInternal });
        }
      } catch (e) { console.warn('[bot quest vote] ', e.message); }
    }, d);
  });
}

function scheduleBotAssassinate({ roomManager, roomId, broadcast, dispatchInternal }) {
  const room = roomManager.get(roomId);
  if (!room || !room.gameState) return;
  const gs = room.gameState;
  const assassin = gs.players.find(p => p.role === 'ASSASSIN');
  if (!assassin?.isBot) return;
  const d = 1200 + Math.random() * 800;
  setTimeout(() => {
    const curRoom = roomManager.get(roomId);
    if (!curRoom || !curRoom.gameState) return;
    const cur = curRoom.gameState;
    if (cur.phase !== 'ASSASSINATION') return;
    try {
      const view = getAIView(cur, assassin.id);
      const pub = getPublicState(cur);
      const targetId = questAI.aiAssassinate(view, pub.players, pub);
      const res = roomManager.handleQuestAction({ roomId, socketId: assassin.id, actionType: 'ASSASSINATE', payload: { targetId } });
      if (res) {
        broadcast(roomId);
        handleQuestEffects({ roomManager, roomId, effects: res.effects, broadcast, dispatchInternal });
      }
    } catch (e) { console.warn('[bot assassinate] ', e.message); }
  }, d);
}

function scheduleBotReveals({ roomManager, roomId, broadcast, dispatchInternal }) {
  const room = roomManager.get(roomId);
  if (!room || !room.gameState) return;
  const gs = room.gameState;
  // Each bot auto-reveals after stagger
  gs.players.forEach((p, idx) => {
    if (!p.isBot) return;
    const d = 400 + idx * 200 + Math.random() * 300;
    setTimeout(() => {
      const curRoom = roomManager.get(roomId);
      if (!curRoom || !curRoom.gameState) return;
      const cur = curRoom.gameState;
      if (cur.phase !== 'ROLE_REVEAL') return;
      if (cur.revealed[cur.players.findIndex(x => x.id === p.id)]) return;
      try {
        const res = roomManager.handleQuestAction({ roomId, socketId: p.id, actionType: 'REVEAL_ROLE', payload: { playerId: p.id } });
        if (res) {
          broadcast(roomId);
          handleQuestEffects({ roomManager, roomId, effects: res.effects, broadcast, dispatchInternal });
        }
      } catch (e) { console.warn('[bot reveal] ', e.message); }
    }, d);
  });
}
