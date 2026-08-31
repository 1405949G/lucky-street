/**
 * games/street-trivia/server/state.js - Pure reducer for solo FFA trivia
 * Scoring: 1 pt per correct, 0 for wrong/miss. Tie = shared win.
 */
import { PHASES, REVEAL_MS, STORAGE_VERSION } from "./config.js";
import { pickQuestions } from "./questions.js";

function shuffle(a){ const arr=a.slice(); for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]];} return arr;}

function uid(prefix){ return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`; }

export function createInitialState() {
  return Object.freeze({
    version: STORAGE_VERSION,
    phase: PHASES.LOBBY,
    players: Object.freeze([]), // {id,name,isBot,avatar}
    questions: Object.freeze([]), // filled on SETUP_GAME
    currentIndex: 0,
    scores: Object.freeze({}), // {playerId: number}
    answers: Object.freeze({}), // {playerId: choice 0..3} for current Q
    answerAt: Object.freeze({}), // {playerId: timestamp}
    reveal: Object.freeze(null), // {correctIndex, breakdown:{0:count,...}} when in REVEAL
    questionStartAt: null,
    timerSeconds: 20,
    category: "mixed",
    difficulty: "mixed",
    roomCode: null,
    winners: Object.freeze([]), // ids at GAME_OVER
    log: Object.freeze([]),
    revealAcks: Object.freeze({}),
  });
}

function appendLog(log, type, text){
  const entry = Object.freeze({ id: uid("log"), t: Date.now(), type, text });
  return Object.freeze([...log, entry]);
}
function fmtQuestion(q, idx, total){
  if(!q) return `Question Q${idx+1}`;
  const opts = q.options.map((o,i)=> `${String.fromCharCode(65+i)} ${o}`).join(" • ");
  return `Question Q${idx+1} [${q.category} • ${q.difficulty}] ${q.q} — ${opts}${q.imageUrl?" • [image]":""}`;
}
function fmtReveal(curQ, answers, scoresBefore, scoresAfter, players, idx){
  const correctLetter = String.fromCharCode(65+curQ.correctIndex);
  const correctOpt = curQ.options[curQ.correctIndex];
  const breakdown = {0:0,1:0,2:0,3:0};
  for(const v of Object.values(answers)) breakdown[v]=(breakdown[v]||0)+1;
  const picks = Object.entries(answers).map(([pid,ch])=>{
    const pl = players.find(p=>p.id===pid);
    const name = pl?.name || pid.slice(0,4);
    const letter = String.fromCharCode(65+ch);
    const ok = ch===curQ.correctIndex;
    return `${name}:${letter}${ok?"✓":"✗"}`;
  }).join(" • ") || "none answered";
  const gained = Object.entries(answers).filter(([,ch])=> ch===curQ.correctIndex).map(([pid])=> players.find(p=>p.id===pid)?.name).join(", ");
  const breakdownStr = `A:${breakdown[0]} B:${breakdown[1]} C:${breakdown[2]} D:${breakdown[3]}`;
  return `Reveal Q${idx+1}: Correct ${correctLetter} ${correctOpt} — ${picks} | ${breakdownStr} | ${Object.keys(answers).length}/${players.length} answered${gained?` • +1: ${gained}`:""}`;
}

export function getPublicState(state){
  const revealQ = state.phase === PHASES.REVEAL || state.phase === PHASES.GAME_OVER;
  const currentQ = state.questions[state.currentIndex] || null;
  const publicQ = currentQ ? {
    id: currentQ.id,
    category: currentQ.category,
    difficulty: currentQ.difficulty,
    q: currentQ.q,
    options: currentQ.options,
    imageUrl: currentQ.imageUrl || null,
    index: state.currentIndex,
    total: state.questions.length,
    // hide correct until reveal
    correctIndex: revealQ ? currentQ.correctIndex : null,
  } : null;

  // scores sorted desc for mini strip
  const sorted = Object.entries(state.scores)
    .map(([id, score]) => {
      const p = state.players.find(x=>x.id===id);
      return { id, name: p?.name || id.slice(0,4), score, isBot: !!p?.isBot, avatar: p?.avatar || null };
    })
    .sort((a,b)=> b.score - a.score || a.name.localeCompare(b.name));

  const breakdown = state.phase === PHASES.REVEAL && state.reveal ? state.reveal.breakdown : null;
  const counts = breakdown ? breakdown : null;
  // expose per-player picks only during REVEAL / GAME_OVER (after answer window closed)
  const picks = (state.phase === PHASES.REVEAL || state.phase === PHASES.GAME_OVER) ? Object.freeze({ ...state.answers }) : null;

  return Object.freeze({
    version: state.version,
    phase: state.phase,
    players: Object.freeze(state.players.map(p=> ({ id:p.id, name:p.name, isBot:!!p.isBot, avatar:p.avatar||null }))),
    currentIndex: state.currentIndex,
    total: state.questions.length,
    question: publicQ,
    timerSeconds: state.timerSeconds,
    questionStartAt: state.questionStartAt,
    scores: Object.freeze({ ...state.scores }),
    sorted: Object.freeze(sorted),
    answersCount: Object.keys(state.answers).length,
    totalPlayers: state.players.length,
    breakdown: counts ? Object.freeze({ ...counts }) : null,
    picks,
    correctIndex: revealQ && currentQ ? currentQ.correctIndex : null,
    revealAcks: state.revealAcks,
    revealAckCount: Object.keys(state.revealAcks||{}).length,
    winners: Object.freeze(state.winners.slice()),
    log: state.log,
    roomCode: state.roomCode,
    category: state.category,
    difficulty: state.difficulty,
  });
}

export function getPrivateState(state, playerId){
  const pub = getPublicState(state);
  const myAnswer = state.answers[playerId] ?? null;
  const me = state.players.find(p=>p.id===playerId) || null;
  return Object.freeze({
    ...pub,
    self: me ? Object.freeze({ id:me.id, name:me.name }) : null,
    myAnswer,
    hasAnswered: myAnswer !== null && myAnswer !== undefined,
  });
}

// AI view not needed (no bots) but keep for compat
export function getAIView(state, botId){
  return getPrivateState(state, botId);
}

export function reducer(state, action){
  if (!state) state = createInitialState();
  if (!action || !action.type) throw new Error("Action must have type");

  switch(action.type){
    case "SETUP_GAME": {
      const { players, opts, roomCode } = action.payload || {};
      if (!Array.isArray(players) || players.length < 1) throw new Error("Need 1+ player");
      if (players.length > 12) throw new Error("Max 12 players");
      const names = players.map(p=> String(p.name||"").trim());
      if (names.some(n=>!n)) throw new Error("All players need names");
      if (new Set(names.map(n=>n.toLowerCase())).size !== names.length) throw new Error("Duplicate names");
      const questionCount = Math.min(30, Math.max(5, Number(opts?.questionCount) || 10));
      const timerSeconds = Math.min(45, Math.max(10, Number(opts?.timerSeconds) || 20));
      const category = (opts?.category || "mixed").toLowerCase();
      const difficulty = (opts?.difficulty || "mixed").toLowerCase();
      const questions = pickQuestions({ category, difficulty, count: questionCount });
      const builtPlayers = players.map(p=> Object.freeze({ id: p.id, name: String(p.name).trim(), isBot: !!p.isBot, avatar: p.avatar||null }));
      const scores = {};
      for(const p of builtPlayers) scores[p.id]=0;
      let log = appendLog([], "SETUP", `Street Trivia • ${questionCount} Q • ${timerSeconds}s • ${category}/${difficulty}`);
      log = appendLog(log, "QUESTION", fmtQuestion(questions[0], 0, questionCount));
      const newState = {
        ...createInitialState(),
        phase: PHASES.QUESTION,
        players: Object.freeze(builtPlayers),
        questions: Object.freeze(questions),
        currentIndex: 0,
        scores: Object.freeze(scores),
        answers: Object.freeze({}),
        answerAt: Object.freeze({}),
        reveal: null,
        questionStartAt: Date.now(),
        timerSeconds,
        category,
        difficulty,
        roomCode: roomCode || null,
        log,
        revealAcks: Object.freeze({}),
      };
      return { state: Object.freeze(newState), effects: Object.freeze([{ type:"ENTER_QUESTION", index:0 }]) };
    }

    case "SUBMIT_ANSWER": {
      if (state.phase !== PHASES.QUESTION) throw new Error("Not accepting answers now");
      const { playerId, choice } = action.payload || {};
      if (playerId == null || choice == null) throw new Error("playerId + choice required");
      if (!state.players.some(p=>p.id===playerId)) throw new Error("Player not in game");
      if (state.answers[playerId] !== undefined) throw new Error("Already answered");
      if (!Number.isInteger(choice) || choice <0 || choice>3) throw new Error("Choice must be 0..3");
      const nextAnswers = Object.freeze({ ...state.answers, [playerId]: choice });
      const nextAt = Object.freeze({ ...state.answerAt, [playerId]: Date.now() });
      let newState = { ...state, answers: nextAnswers, answerAt: nextAt };
      const effects = [];
      // Early reveal if all answered (even if timer not expired)
      if (Object.keys(nextAnswers).length === state.players.length) {
        const curQ = state.questions[state.currentIndex];
        const breakdown = { 0:0,1:0,2:0,3:0 };
        for (const v of Object.values(nextAnswers)) breakdown[v] = (breakdown[v]||0)+1;
        // Score now (reveal will also score but we score at reveal time to keep single path)
        // We transition to REVEAL via helper: reuse REVEAL_QUESTION logic
        const reveal = Object.freeze({ correctIndex: curQ.correctIndex, breakdown: Object.freeze(breakdown) });
        // compute scores
        const nextScores = { ...state.scores };
        for (const [pid, ch] of Object.entries(nextAnswers)) {
          if (ch === curQ.correctIndex) nextScores[pid] = (nextScores[pid]||0)+1;
        }
        newState = {
          ...newState,
          scores: Object.freeze(nextScores),
          reveal,
          phase: PHASES.REVEAL,
          log: appendLog(newState.log, "REVEAL", fmtReveal(curQ, nextAnswers, state.scores, nextScores, state.players, state.currentIndex)),
          revealAcks: Object.freeze({}),
        };
        effects.push({ type:"ENTER_REVEAL", index: state.currentIndex });
      }
      return { state: Object.freeze(newState), effects: Object.freeze(effects) };
    }

    case "REVEAL_QUESTION":
    case "TIMER_EXPIRED":
    case "FORCE_REVEAL": {
      if (state.phase !== PHASES.QUESTION) throw new Error("Not in QUESTION");
      const curQ = state.questions[state.currentIndex];
      if (!curQ) throw new Error("No current question");
      const breakdown = { 0:0,1:0,2:0,3:0 };
      for (const v of Object.values(state.answers)) breakdown[v] = (breakdown[v]||0)+1;
      // Also count non-answers as no pick (they get 0)
      const nextScores = { ...state.scores };
      for (const [pid, ch] of Object.entries(state.answers)) {
        if (ch === curQ.correctIndex) nextScores[pid] = (nextScores[pid]||0)+1;
      }
      const newState = {
        ...state,
        scores: Object.freeze(nextScores),
        reveal: Object.freeze({ correctIndex: curQ.correctIndex, breakdown: Object.freeze(breakdown) }),
        phase: PHASES.REVEAL,
        log: appendLog(state.log, "REVEAL", fmtReveal(curQ, state.answers, state.scores, nextScores, state.players, state.currentIndex)),
        revealAcks: Object.freeze({}),
      };
      return { state: Object.freeze(newState), effects: Object.freeze([{ type:"ENTER_REVEAL", index: state.currentIndex }]) };
    }

    case "ACK_REVEAL": {
      if (state.phase !== PHASES.REVEAL) throw new Error("Not in REVEAL");
      const { playerId } = action.payload || {};
      if (!state.players.some(p=>p.id===playerId)) throw new Error("Unknown player");
      if (state.revealAcks[playerId]) return { state, effects: Object.freeze([]) };
      const nextAcks = Object.freeze({ ...state.revealAcks, [playerId]: true });
      const allAcked = Object.keys(nextAcks).length === state.players.length;
      let newState = { ...state, revealAcks: nextAcks };
      if (allAcked) {
        // Advance immediately
        return reducer(newState, { type:"NEXT_QUESTION" });
      }
      return { state: Object.freeze(newState), effects: Object.freeze([]) };
    }

    case "NEXT_QUESTION": {
      if (state.phase !== PHASES.REVEAL) throw new Error("Not in REVEAL");
      const isLast = state.currentIndex >= state.questions.length - 1;
      if (isLast) {
        // Game over — compute winners (shared tie)
        const maxScore = Math.max(...Object.values(state.scores), 0);
        const winners = Object.entries(state.scores).filter(([,s])=> s===maxScore).map(([id])=> id);
        const winNames = winners.map(id=> state.players.find(p=>p.id===id)?.name || id).join(", ");
        const newState = {
          ...state,
          phase: PHASES.GAME_OVER,
          winners: Object.freeze(winners),
          reveal: null,
          log: appendLog(state.log, "GAME_OVER", `Finished • ${maxScore} pts • Winner(s): ${winNames || "—"}`),
        };
        return { state: Object.freeze(newState), effects: Object.freeze([{ type:"ENTER_GAME_OVER" }]) };
      } else {
        const nextIdx = state.currentIndex + 1;
        const qNext = state.questions[nextIdx];
        const newState = {
          ...state,
          currentIndex: nextIdx,
          answers: Object.freeze({}),
          answerAt: Object.freeze({}),
          reveal: null,
          phase: PHASES.QUESTION,
          questionStartAt: Date.now(),
          revealAcks: Object.freeze({}),
          log: appendLog(state.log, "QUESTION", fmtQuestion(qNext, nextIdx, state.questions.length)),
        };
        return { state: Object.freeze(newState), effects: Object.freeze([{ type:"ENTER_QUESTION", index: nextIdx }]) };
      }
    }

    case "REMOVE_PLAYER": {
      const { playerId } = action.payload || {};
      if (!playerId) throw new Error("playerId required");
      const idx = state.players.findIndex(p=>p.id===playerId);
      if (idx===-1) return { state, effects: Object.freeze([]) };
      const nextPlayers = state.players.filter(p=>p.id!==playerId);
      const nextScores = { ...state.scores }; delete nextScores[playerId];
      const nextAnswers = { ...state.answers }; delete nextAnswers[playerId];
      const nextAt = { ...state.answerAt }; delete nextAt[playerId];
      const nextAcks = { ...state.revealAcks }; delete nextAcks[playerId];
      // If now 0 players, go to GAME_OVER? Keep but allow empty
      let newState = {
        ...state,
        players: Object.freeze(nextPlayers),
        scores: Object.freeze(nextScores),
        answers: Object.freeze(nextAnswers),
        answerAt: Object.freeze(nextAt),
        revealAcks: Object.freeze(nextAcks),
        log: appendLog(state.log, "LEAVE", `${playerId.slice(0,4)} left`),
      };
      // If in QUESTION and all remaining have answered, auto reveal
      if (newState.phase===PHASES.QUESTION && Object.keys(newState.answers).length === newState.players.length && newState.players.length>0) {
        return reducer(newState, { type:"FORCE_REVEAL" });
      }
      // If in REVEAL and all acked, advance
      if (newState.phase===PHASES.REVEAL && Object.keys(newState.revealAcks).length === newState.players.length && newState.players.length>0) {
        return reducer(newState, { type:"NEXT_QUESTION" });
      }
      // If no players left during game, end game
      if (newState.players.length===0 && newState.phase!==PHASES.GAME_OVER) {
        newState = { ...newState, phase: PHASES.GAME_OVER, winners: Object.freeze([]), log: appendLog(newState.log, "GAME_OVER", "All left — game ended") };
        return { state: Object.freeze(newState), effects: Object.freeze([{ type:"ENTER_GAME_OVER" }]) };
      }
      return { state: Object.freeze(newState), effects: Object.freeze([]) };
    }

    case "RESET": {
      const newState = createInitialState();
      return { state: Object.freeze(newState), effects: Object.freeze([{ type:"ENTER_LOBBY" }]) };
    }

    default:
      throw new Error(`Unknown action: ${action.type}`);
  }
}

export function isGameOver(state){ return state.phase===PHASES.GAME_OVER; }
