/**
 * games/street-trivia/server/scheduler.js - Timer + reveal scheduler
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
        const timerMs = (gs.timerSeconds || 20) * 1000;
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
        const room = roomManager.get(roomId);
        if (!room || !room.gameState) break;
        const idxAtEntry = room.gameState.currentIndex;
        // auto-advance after REVEAL_MS (but also allow early ACKs)
        const revealMs = 4500;
        setTimeout(() => {
          const curRoom = roomManager.get(roomId);
          if (!curRoom || !curRoom.gameState) return;
          const cur = curRoom.gameState;
          if (cur.phase !== "REVEAL") return;
          if (cur.currentIndex !== idxAtEntry) return;
          // if all acked, reducer already advanced; this will be no-op
          try {
            const res = dispatchInternal(roomId, { type: "NEXT_QUESTION" });
            if (res) {
              broadcast(roomId);
              handleTriviaEffects({ roomManager, roomId, effects: res.effects, broadcast, dispatchInternal });
            }
          } catch (e) { /* may be not in REVEAL if ack advanced */ }
        }, revealMs);
        break;
      }
      case "ENTER_GAME_OVER":
      case "ENTER_LOBBY":
      default:
        break;
    }
  }
}
