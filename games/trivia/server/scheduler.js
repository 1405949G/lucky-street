/**
 * games/trivia/server/scheduler.js - Timer + reveal scheduler
 * Works in both Node and DO (setTimeout). Effects declarative from reducer.
 */
export function handleTriviaEffects({ roomManager, roomId, effects, broadcast, dispatchInternal }) {
  if (!effects || !effects.length) return;
  for (const eff of effects) {
    switch (eff.type) {
      case "ENTER_QUESTION": {
        const room = roomManager.get(roomId);
        if (!room || !room.gameState) break;
        const gs = room.gameState;
        const timerSec = Number(gs.timerSeconds);
        if (!timerSec || timerSec===0) break; // 0 = No limit — no auto-reveal, wait for all answered
        const timerMs = timerSec * 1000;
        const idxAtEntry = gs.currentIndex;
        // schedule auto-reveal if not all answered
        setTimeout(() => {
          const curRoom = roomManager.get(roomId);
          if (!curRoom || !curRoom.gameState) return;
          const cur = curRoom.gameState;
          if (cur.phase !== "QUESTION") return;
          if (cur.currentIndex !== idxAtEntry) return;
          try {
            const res = dispatchInternal(roomId, { type: "TIMER_EXPIRED" });
            if (res) {
              broadcast(roomId);
              handleTriviaEffects({ roomManager, roomId, effects: res.effects, broadcast, dispatchInternal });
            }
          } catch (e) { console.warn("[trivia timer] ", e.message); }
        }, timerMs + 300); // small grace
        break;
      }
      case "ENTER_REVEAL": {
        // No auto-advance — wait for all players to press Continue (ACK_REVEAL)
        // This fixes "game is continuing without me pressing continue"
        // Timer stays at question phase only; reveal is manual.
        break;
      }
      case "ENTER_GAME_OVER":
      case "ENTER_LOBBY":
      default:
        break;
    }
  }
}
