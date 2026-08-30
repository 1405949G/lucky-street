import { ALLEGIANCE, ROLES } from './config.js';
import { sample, shuffle } from './utils.js';

export function aiProposeTeam(aiView) {
  const { public: pub, self, vision } = aiView;
  const quest = pub.quests[pub.currentQuest];
  if (!quest) throw new Error('No quest for AI propose');
  const need = quest.size;
  const allIds = pub.players.map(p => p.id);
  const isEvil = self.allegiance === ALLEGIANCE.EVIL;
  const goodMemory = new Map();
  for (const p of pub.players) goodMemory.set(p.id, 0);
  goodMemory.set(self.id, 2);
  for (const q of pub.quests) {
    if (q.status === 'SUCCESS' && q.teamIds?.length) {
      for (const id of q.teamIds) goodMemory.set(id, (goodMemory.get(id) || 0) + 1);
    } else if (q.status === 'FAIL' && q.teamIds?.length) {
      for (const id of q.teamIds) goodMemory.set(id, (goodMemory.get(id) || 0) - 1);
    }
  }
  if (!isEvil) {
    const evils = new Set(vision.sees);
    let pool = allIds.filter(id => !evils.has(id));
    if (pool.length < need) pool = allIds.slice();
    pool = shuffle(pool);
    pool.sort((a, b) => (goodMemory.get(b) || 0) - (goodMemory.get(a) || 0));
    const team = [];
    if (pool.includes(self.id)) team.push(self.id);
    for (const id of pool) {
      if (team.length >= need) break;
      if (!team.includes(id)) team.push(id);
    }
    while (team.length < need) {
      const pick = sample(allIds.filter(id => !team.includes(id)));
      if (!pick) break;
      team.push(pick);
    }
    return team.slice(0, need);
  } else {
    const otherEvil = vision.sees;
    const evilsSet = new Set([self.id, ...otherEvil]);
    const goods = allIds.filter(id => !evilsSet.has(id));
    const roll = Math.random();
    let team = [];
    if (roll < 0.6) {
      team.push(self.id);
      const goodPool = shuffle(goods.slice()).sort((a, b) => (goodMemory.get(b) || 0) - (goodMemory.get(a) || 0));
      for (const id of goodPool) {
        if (team.length >= need) break;
        team.push(id);
      }
      if (team.length < need && otherEvil.length > 0 && Math.random() < 0.3) {
        team[team.length - 1] = sample(otherEvil);
      }
    } else if (roll < 0.9 && otherEvil.length > 0 && need >= 3) {
      team.push(self.id);
      team.push(sample(otherEvil));
      const goodPool = shuffle(goods.slice());
      for (const id of goodPool) {
        if (team.length >= need) break;
        team.push(id);
      }
    } else {
      const goodPool = shuffle(goods.slice());
      team = goodPool.slice(0, need);
      if (team.length < need) team.push(self.id);
    }
    team = [...new Set(team)];
    while (team.length < need) {
      const pick = sample(allIds.filter(id => !team.includes(id)));
      if (!pick) break;
      team.push(pick);
    }
    return shuffle(team).slice(0, need);
  }
}

export function aiTeamVote(aiView, proposedTeam) {
  const { public: pub, self, vision } = aiView;
  const isEvil = self.allegiance === ALLEGIANCE.EVIL;
  const evils = new Set([self.id, ...vision.sees]);
  const knownEvils = self.role === ROLES.MERLIN ? new Set(vision.sees) : new Set();
  let evilCountInTeam = 0;
  for (const id of proposedTeam) {
    if (knownEvils.has(id)) evilCountInTeam++;
  }
  if (self.role !== ROLES.MERLIN && self.allegiance === ALLEGIANCE.GOOD) {
    const failPenalty = new Map();
    for (const q of pub.quests) {
      if (q.status === 'FAIL' && q.failCount > 0) {
        for (const id of q.teamIds) failPenalty.set(id, (failPenalty.get(id) || 0) + 1);
      }
    }
    for (const id of proposedTeam) {
      if ((failPenalty.get(id) || 0) > 0 && !proposedTeam.includes(self.id)) {
        evilCountInTeam += 0.4;
      }
    }
  }
  if (!isEvil) {
    if (self.role === ROLES.MERLIN) {
      return evilCountInTeam === 0 ? 'APPROVE' : 'REJECT';
    }
    if (pub.proposalTracker >= 4) return 'APPROVE';
    if (evilCountInTeam >= 1) return Math.random() < 0.2 ? 'APPROVE' : 'REJECT';
    if (proposedTeam.includes(self.id)) return Math.random() < 0.85 ? 'APPROVE' : 'REJECT';
    return Math.random() < 0.6 ? 'APPROVE' : 'REJECT';
  } else {
    const onTeam = proposedTeam.includes(self.id);
    const evilInTeam = proposedTeam.filter(id => evils.has(id)).length;
    if (onTeam) {
      return Math.random() < 0.8 ? 'APPROVE' : 'REJECT';
    } else {
      if (pub.proposalTracker >= 3) return Math.random() < 0.5 ? 'APPROVE' : 'REJECT';
      return evilInTeam > 0 ? 'APPROVE' : (Math.random() < 0.45 ? 'APPROVE' : 'REJECT');
    }
  }
}

export function aiQuestVote(aiView) {
  const { public: pub, self } = aiView;
  if (self.allegiance === ALLEGIANCE.GOOD) return 'SUCCESS';
  const quest = pub.quests[pub.currentQuest];
  const evilWins = pub.quests.filter(q => q.status === 'FAIL').length;
  if (evilWins === 2) return 'FAIL';
  const evilsOnTeam = pub.proposal.teamIds.filter(id => {
    const v = aiView.vision.sees;
    const evilSet = new Set([self.id, ...v]);
    return evilSet.has(id);
  }).length;
  if (quest && quest.failsRequired === 2 && evilsOnTeam === 1) {
    return Math.random() < 0.5 ? 'FAIL' : 'SUCCESS';
  }
  if (pub.currentQuest <= 1 && Math.random() < 0.3) return 'SUCCESS';
  return Math.random() < 0.75 ? 'FAIL' : 'SUCCESS';
}

export function aiAssassinate(aiView, allPlayersPublic, pub) {
  const evilSet = new Set([aiView.self.id, ...aiView.vision.sees]);
  const goodIds = pub.players.filter(p => !evilSet.has(p.id)).map(p => p.id);
  if (goodIds.length === 0) return pub.players[0].id;
  if (goodIds.length === 1) return goodIds[0];
  const scores = new Map(goodIds.map(id => [id, 0]));
  for (const id of goodIds) {
    let failsOn = 0;
    for (const q of pub.quests) {
      if (q.status === 'FAIL' && q.teamIds.includes(id)) failsOn++;
    }
    scores.set(id, scores.get(id) - failsOn * 2);
  }
  for (const id of goodIds) {
    scores.set(id, scores.get(id) + Math.random() * 1.5);
  }
  let best = goodIds[0];
  let bestScore = -Infinity;
  for (const id of goodIds) {
    const s = scores.get(id) + (Math.random() * 0.4);
    if (s > bestScore) {
      bestScore = s;
      best = id;
    }
  }
  return best;
}
