/**
 * games/street-trivia/client/Game.jsx - Street Trivia board
 * Per-game look isolated here (no global ui/theme import). Colours: quiz amber/purple.
 */
import React, { useContext, useEffect, useState, useRef } from "react";
import { SocketContext } from "../../../client/src/context/SocketContext.jsx";

const LETTERS = ["A","B","C","D"];
const OPTION_COLORS = [
  "bg-[#ef4444] border-red-400", // A red
  "bg-[#3b82f6] border-blue-400", // B blue
  "bg-[#eab308] border-yellow-400", // C yellow
  "bg-[#22c55e] border-green-400", // D green
];

export default function TriviaGame({ roomId, isHost, isSpectator }) {
  const { socket } = useContext(SocketContext);
  const [pub, setPub] = useState(null);
  const [priv, setPriv] = useState(null);
  const [toast, setToast] = useState(null);
  const [now, setNow] = useState(Date.now());
  const myId = socket?.id;

  function showToast(m){ setToast(m); setTimeout(()=>setToast(null),2200); }

  useEffect(()=>{
    if(!socket) return;
    function onUpdate(data){
      if(!data) { setPub(null); setPriv(null); return; }
      const incoming = data.roomCode || data.roomId || data.id;
      if(incoming && String(incoming).toUpperCase() !== String(roomId).toUpperCase()) return;
      setPub(data);
    }
    function onPrivate(data){
      if(!data) { setPriv(null); return; }
      const incoming = data.roomCode || data.roomId;
      if(incoming && String(incoming).toUpperCase() !== String(roomId).toUpperCase()) return;
      setPriv(data);
    }
    socket.on("game:update", onUpdate);
    socket.on("game:private", onPrivate);
    socket.emit("game:requestState", { roomId }, (res)=>{
      if(res?.ok){
        if(res.public){
          const pr = res.public.roomCode || res.public.roomId;
          if(!pr || String(pr).toUpperCase()===String(roomId).toUpperCase()) setPub(res.public);
        }
        if(res.private) setPriv(res.private);
      }
    });
    function onLobby(full){
      if(full.id !== roomId) return;
      if(full.gameState) setPub(full.gameState);
      else if(full.hasGame===false){ setPub(null); setPriv(null); }
    }
    socket.on("lobby:update", onLobby);
    return ()=>{
      socket.off("game:update", onUpdate);
      socket.off("game:private", onPrivate);
      socket.off("lobby:update", onLobby);
    };
  },[socket,roomId]);

  // tick for timer bar
  useEffect(()=>{
    if(!pub || pub.phase!=="QUESTION") return;
    const id = setInterval(()=> setNow(Date.now()), 200);
    return ()=> clearInterval(id);
  },[pub?.phase, pub?.questionStartAt]);

  if(!pub){
    return (
      <div className="rounded-2xl bg-[#0f2231]/60 border border-white/10 p-6 text-center">
        <p className="text-sm text-white/60">No trivia in progress.</p>
        <p className="text-xs text-white/30 mt-1">Host can start when ready.</p>
      </div>
    );
  }

  const phase = pub.phase;
  const q = pub.question;
  const idx = pub.currentIndex;
  const total = pub.total;
  const sorted = pub.sorted || [];
  const myAnswer = priv?.myAnswer;
  const hasAnswered = myAnswer !== null && myAnswer !== undefined;
  const isReveal = phase==="REVEAL";
  const isOver = phase==="GAME_OVER";
  const picks = pub.picks || {};
  const breakdown = pub.breakdown || {0:0,1:0,2:0,3:0};
  const correctIndex = pub.correctIndex;

  // timer progress
  let timeLeft = null;
  let timePct = 0;
  if(pub.phase==="QUESTION" && pub.questionStartAt){
    const elapsed = (now - pub.questionStartAt)/1000;
    timeLeft = Math.max(0, pub.timerSeconds - elapsed);
    timePct = Math.max(0, Math.min(1, timeLeft / pub.timerSeconds));
  }

  function emitAnswer(choice){
    if(isSpectator) return showToast("Spectators watch only");
    if(phase!=="QUESTION") return;
    if(hasAnswered) return showToast("Already locked in");
    socket.emit("game:action", { roomId, type:"SUBMIT_ANSWER", payload:{ choice } }, (res)=>{
      if(!res?.ok) showToast(res?.error || "Failed");
    });
  }
  function handleAck(){
    socket.emit("game:action", { roomId, type:"ACK_REVEAL", payload:{} }, (res)=>{
      if(!res?.ok) showToast(res?.error||"");
    });
  }

  // helpers for reveal counts
  const maxCount = Math.max(...Object.values(breakdown),1);

  return (
    <div className="space-y-4">
      {/* Live scores mini strip — always visible while playing */}
      <div className="rounded-2xl bg-[#0f2231]/70 border border-white/10 p-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] tracking-widest font-bold text-white/40">LIVE SCORES</span>
          <span className="text-[11px] font-bold text-white/30">{idx+1}/{total} • {pub.category}/{pub.difficulty}</span>
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {sorted.length===0 ? <span className="text-xs text-white/30">No scores yet</span> : sorted.map((p,rank)=>{
            const isMe = p.id===myId;
            const isTop = rank===0 && !isOver;
            return (
              <div key={p.id} className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold ${isTop?"bg-amber-400 border-amber-300 text-[#0e2533]": isMe?"bg-white/15 border-white/20 text-white":"bg-white/5 border-white/10 text-white/70"}`}>
                <span className="w-5 h-5 rounded-full bg-[#0a1e2e] text-white flex items-center justify-center text-[10px] font-black">{rank+1}</span>
                <span className="truncate max-w-[80px]">{p.name} {isMe?"(you)":""}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-black ${isTop?"bg-[#0e2533] text-amber-300":"bg-white/10 text-white"}`}>{p.score}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 text-[11px] text-white/40 flex justify-between">
          <span>{pub.answersCount}/{pub.totalPlayers} answered</span>
          {phase==="QUESTION" && timeLeft!==null && <span className={timeLeft<5?"text-rose-300 font-bold":""}>{Math.ceil(timeLeft)}s left</span>}
        </div>
      </div>

      {/* Question card */}
      {!isOver ? (
        <div className="rounded-[24px] bg-[#0f2231] border border-white/10 shadow-xl overflow-hidden">
          {/* progress bar */}
          <div className="h-1.5 bg-white/10 w-full">
            <div className="h-full bg-gradient-to-r from-amber-300 to-orange-400 transition-all duration-200" style={{ width: `${((idx)/Math.max(total,1))*100}%` }} />
          </div>
          {q ? (
            <div className="p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-1 rounded-full bg-amber-400 text-[#0e2533] text-xs font-black">Q {idx+1}/{total}</span>
                <span className="text-xs text-white/40 capitalize">{q.category} • {q.difficulty} • {pub.timerSeconds}s</span>
              </div>

              {q.imageUrl && (
                <div className="mt-4 rounded-2xl overflow-hidden border border-white/10 bg-black/20">
                  <img src={q.imageUrl} alt="question" className="w-full max-h-[220px] object-cover" loading="lazy" />
                </div>
              )}

              <h2 className="mt-4 text-[18px] sm:text-[20px] font-extrabold text-white leading-tight">{q.q}</h2>

              {/* Timer bar */}
              {phase==="QUESTION" && (
                <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className={`h-full transition-all duration-200 ${timeLeft!==null && timeLeft<5 ? "bg-rose-500":"bg-emerald-400"}`} style={{ width: `${timePct*100}%` }} />
                </div>
              )}

              {/* Options A-D */}
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {q.options.map((opt, i)=>{
                  const letter = LETTERS[i];
                  const isMy = myAnswer===i;
                  const isCorrect = isReveal && correctIndex===i;
                  const isWrongPick = isReveal && isMy && correctIndex!==i;
                  const count = breakdown[i]||0;
                  const pct = isReveal ? Math.round((count / Math.max(sorted.length,1))*100) : 0;
                  const barW = isReveal ? Math.round((count / maxCount)*100) : 0;
                  return (
                    <button
                      key={i}
                      onClick={()=>emitAnswer(i)}
                      disabled={phase!=="QUESTION" || hasAnswered || isSpectator}
                      className={`group relative text-left rounded-2xl border-2 p-3 sm:p-4 flex items-center gap-3 transition-all
                        ${isReveal && isCorrect ? "border-emerald-400 bg-emerald-500/20 ring-2 ring-emerald-300" : ""}
                        ${isReveal && isWrongPick ? "border-rose-400 bg-rose-500/15" : ""}
                        ${!isReveal && isMy ? "border-amber-300 bg-amber-400/20" : ""}
                        ${!isReveal && !isMy ? "border-white/15 bg-white/[0.04] hover:bg-white/10 hover:border-white/20" : ""}
                        ${phase!=="QUESTION" || hasAnswered ? "" : ""}
                        ${isSpectator ? "opacity-70" : ""}
                      `}
                    >
                      <span className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-black text-white border shadow ${OPTION_COLORS[i]}`}>{letter}</span>
                      <span className="flex-1 text-sm font-bold text-white pr-2">{opt}</span>
                      {isReveal && (
                        <span className={`px-2 py-1 rounded-full text-xs font-black ${isCorrect?"bg-emerald-400 text-black":"bg-white/10 text-white/60"}`}>{count} • {pct}%</span>
                      )}
                      {!isReveal && isMy && <span className="px-2 py-1 rounded-full bg-amber-400 text-[#0e2533] text-xs font-black">You</span>}
                      {isReveal && <div className="absolute bottom-0 left-3 right-3 h-1 bg-white/10 rounded-full overflow-hidden">
                        <div className={`h-full ${isCorrect?"bg-emerald-400":"bg-white/40"}`} style={{ width: `${barW}%` }} />
                      </div>}
                    </button>
                  );
                })}
              </div>

              {phase==="QUESTION" && !isSpectator && (
                hasAnswered
                  ? <div className="mt-4 text-center py-3 rounded-full bg-white/10 border border-white/15 text-white/60 font-bold text-sm">Locked in {LETTERS[myAnswer]} — waiting {pub.answersCount}/{pub.totalPlayers}</div>
                  : <p className="mt-4 text-center text-xs text-white/40">Pick A-D — early reveal when everyone answers</p>
              )}
              {isSpectator && phase==="QUESTION" && <div className="mt-4 text-center py-3 rounded-full bg-white/5 text-white/40 font-bold text-sm">Spectating — answers hidden until reveal</div>}

              {/* Reveal breakdown: who picked what */}
              {isReveal && (
                <div className="mt-5 rounded-2xl bg-white/[0.04] border border-white/10 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-white">Answer • <span className="text-emerald-300">{LETTERS[correctIndex]} is correct</span></h3>
                    <span className="text-xs text-white/40">{pub.revealAckCount}/{pub.totalPlayers} ready</span>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                    {LETTERS.map((L,i)=>(
                      <div key={L} className={`rounded-xl p-2 border ${i===correctIndex?"bg-emerald-500/20 border-emerald-400/40":"bg-white/5 border-white/10"}`}>
                        <div className={`text-xs font-black ${i===correctIndex?"text-emerald-300":"text-white/60"}`}>{L} • {breakdown[i]||0}</div>
                        <div className="mt-1 flex flex-wrap gap-1 justify-center">
                          {(Object.entries(picks).filter(([,ch])=> ch===i).map(([pid])=>{
                            const pl = pub.players.find(p=>p.id===pid);
                            const isMe = pid===myId;
                            return <span key={pid} className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${isMe?"bg-amber-400 text-[#0e2533]": i===correctIndex?"bg-emerald-400/30 text-emerald-200 border border-emerald-400/30":"bg-white/10 text-white/60"}`}>{pl?.name || pid.slice(0,4)} {isMe?"★":""}</span>;
                          }))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-xs text-white/30 text-center">{Object.keys(picks).length} answered • {pub.totalPlayers - Object.keys(picks).length} missed</div>
                  {isSpectator
                    ? <div className="mt-3 py-2.5 rounded-full bg-white/5 text-white/40 font-bold text-center text-sm">Spectating… {pub.revealAckCount}/{pub.totalPlayers}</div>
                    : pub.revealAcks?.[myId]
                      ? <div className="mt-3 py-2.5 rounded-full bg-white/10 border border-white/15 text-white/60 font-bold text-center text-sm">Waiting… {pub.revealAckCount}/{pub.totalPlayers}</div>
                      : <button onClick={handleAck} className="mt-3 w-full py-2.5 rounded-full bg-[#f3ecd8] hover:bg-white text-[#0e2533] font-extrabold">Continue ({pub.revealAckCount}/{pub.totalPlayers})</button>
                  }
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 text-center text-white/50 text-sm">Loading question…</div>
          )}
        </div>
      ) : (
        /* GAME_OVER podium */
        <div className="rounded-[24px] bg-[#0f2231] border border-white/10 shadow-xl p-6 text-center">
          <p className="text-xs tracking-widest font-bold text-amber-300">STREET TRIVIA • FINISHED</p>
          <h2 className="mt-1 text-2xl font-black text-white">Results</h2>
          <p className="text-xs text-white/40">{pub.category}/{pub.difficulty} • {total} Q</p>

          <div className="mt-5 flex justify-center gap-2 items-end">
            {(() => {
              const top3 = sorted.slice(0,3);
              // podium order 2nd, 1st, 3rd for visual
              const order = [1,0,2].filter(i=> i < top3.length);
              return order.map(i=>{
                const p = top3[i];
                const isMe = p.id===myId;
                const heights = ["h-[96px]","h-[128px]","h-[84px]"];
                const idxOrdered = order.indexOf(i);
                return (
                  <div key={p.id} className={`flex-1 max-w-[120px] rounded-2xl border-2 flex flex-col items-center justify-end p-3 ${i===0?"bg-amber-400 border-amber-300 text-[#0e2533]":"bg-white/5 border-white/15 text-white"} ${heights[idxOrdered]}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-xs border ${isMe?"border-amber-300 bg-[#f3ecd8] text-[#0a1e2e]":"bg-[#1e2a3a] text-white border-white/10"}`}>{p.name.slice(0,2).toUpperCase()}</div>
                    <div className={`mt-2 text-xs font-black truncate max-w-full ${i===0?"text-[#0e2533]":"text-white"}`}>{p.name} {isMe?"★":""}</div>
                    <div className={`text-lg font-black ${i===0?"text-[#0e2533]":"text-emerald-300"}`}>{p.score}</div>
                    <div className="text-[10px] font-bold opacity-60">{i===0?"1st":i===1?"2nd":"3rd"}</div>
                  </div>
                );
              });
            })()}
          </div>

          <div className="mt-6 text-left max-w-[420px] mx-auto space-y-1.5">
            {sorted.map((p,rank)=>{
              const isMe = p.id===myId;
              const isWinner = pub.winners.includes(p.id);
              return (
                <div key={p.id} className={`flex items-center justify-between rounded-xl px-3 py-2 border ${isMe?"bg-white/10 border-amber-300/30":"bg-white/5 border-white/10"} ${isWinner?"ring-1 ring-amber-300/40":""}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black ${rank<3?"bg-amber-400 text-[#0e2533]":"bg-white/10 text-white/60"}`}>{rank+1}</span>
                    <span className="text-sm font-bold text-white">{p.name} {isMe&&<span className="px-1 py-0.5 rounded-full bg-amber-400 text-[#0e2533] text-[9px] font-black">YOU</span>} {isWinner&&<span className="text-amber-300">👑</span>}</span>
                  </div>
                  <span className="text-sm font-black text-white">{p.score} pts</span>
                </div>
              );
            })}
          </div>

          {pub.winners.length>1 && <p className="mt-3 text-xs text-amber-200">Tie — shared win 👑 {pub.winners.map(id=> pub.players.find(p=>p.id===id)?.name).join(", ")}</p>}

          <div className="mt-5 flex gap-2">
            {isHost
              ? <button onClick={()=>{
                  socket.emit("game:reset", { roomId }, (res)=>{
                    if(!res?.ok) showToast(res?.error||"Could not restart");
                    else showToast("Back to lobby!");
                  });
                }} className="flex-1 py-3 rounded-full bg-amber-400 hover:bg-amber-300 text-[#0e2533] font-extrabold">Play Again</button>
              : <div className="flex-1 py-3 rounded-full bg-white/5 text-white/40 font-bold text-center">Waiting for host…</div>
            }
          </div>

          {pub.log?.length>0 && (
            <details className="mt-4 rounded-xl bg-white/[0.03] border border-white/10 text-left" open>
              <summary className="px-4 py-2 text-xs font-bold text-white/50 cursor-pointer">Game log • {pub.log.length}</summary>
              <div className="px-4 pb-3 space-y-1 max-h-[200px] overflow-auto">
                {[...pub.log].reverse().map(e=>(
                  <div key={e.id} className="flex gap-2 text-xs border-l-2 border-white/10 pl-2 py-1">
                    <span className="font-bold text-white/40 shrink-0 min-w-[56px]">{e.type}</span>
                    <span className="text-white/60 flex-1">{e.text}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {toast && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-amber-400 text-[#0e2533] text-sm font-bold px-4 py-2.5 rounded-full shadow-xl border border-white/20 z-50">{toast}</div>}
    </div>
  );
}
