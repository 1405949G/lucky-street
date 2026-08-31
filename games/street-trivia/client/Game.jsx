/**
 * games/street-trivia/client/Game.jsx - Street Trivia board
 * Per-game look isolated here (no global ui/theme import). Colours: quiz amber/purple.
 */
import React, { useContext, useEffect, useState, useRef } from "react";
import { SocketContext } from "../../../client/src/context/SocketContext.jsx";

const LETTERS = ["A","B","C","D"];
const OPTION_COLORS = [
  "bg-white/5 border-white/20", // A
  "bg-white/5 border-white/20", // B
  "bg-white/5 border-white/20", // C
  "bg-white/5 border-white/20", // D
];

export default function TriviaGame({ roomId, isHost, isSpectator }) {
  const { socket } = useContext(SocketContext);
  const [pub, setPub] = useState(null);
  const [priv, setPriv] = useState(null);
  const [toast, setToast] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [localStart, setLocalStart] = useState(null);
  const [logOpen, setLogOpen] = useState(true);
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

  // tick for timer bar + reset localStart on new question
  useEffect(()=>{
    if(!pub || pub.phase!=="QUESTION") return;
    const id = setInterval(()=> setNow(Date.now()), 200);
    return ()=> clearInterval(id);
  },[pub?.phase, pub?.question?.id]);

  useEffect(()=>{
    if(pub?.phase==="QUESTION" && pub?.question?.id){
      setLocalStart(Date.now());
      setNow(Date.now());
    }
    if(pub?.phase==="REVEAL" || pub?.phase==="GAME_OVER"){
      setLocalStart(null);
    }
  },[pub?.phase, pub?.question?.id]);

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

  // timer progress — use client localStart to avoid clock skew (server Date.now vs client)
  let timeLeft = null;
  let timePct = 0;
  if(pub.phase==="QUESTION" && pub.timerSeconds){
    const start = localStart || pub.questionStartAt || now;
    const elapsed = (now - start)/1000;
    timeLeft = Math.max(0, pub.timerSeconds - elapsed);
    timePct = Math.max(0, Math.min(1, timeLeft / pub.timerSeconds));
    // clamp display: if localStart was just set, ensure not > timerSeconds
    if(timeLeft > pub.timerSeconds) timeLeft = pub.timerSeconds;
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
          <span className="text-[11px] font-bold text-white/30">Street Trivia • {total} Q • {pub.timerSeconds===0 ? "No limit" : `${pub.timerSeconds}s`} • {pub.questionType}</span>
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {sorted.length===0 ? <span className="text-xs text-white/30">No scores yet</span> : sorted.map((p,rank)=>{
            const isMe = p.id===myId;
            const isTop = rank===0 && !isOver;
            return (
              <div key={p.id} className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold ${isTop?"bg-amber-400 border-amber-300 text-[#0e2533]": isMe?"bg-white/15 border-white/20 text-white":"bg-white/5 border-white/10 text-white/70"}`}>
                <span className="w-5 h-5 rounded-full bg-[#0a1e2e] text-white flex items-center justify-center text-[10px] font-black">{rank+1}</span>
                <span className="truncate max-w-[80px]">{p.name} {isMe?"(you)":""}</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-black border ${isTop?"bg-white text-[#0e2533] border-[#0e2533]/20": isMe?"bg-amber-400 text-[#0e2533] border-amber-300":"bg-white text-[#0e2533] border-white/20"}`}>{p.score} pts</span>
              </div>
            );
          })}
        </div>
        {!isOver ? (
          <div className="mt-2 text-[11px] text-white/40 flex justify-between">
            <span>{pub.answersCount}/{pub.totalPlayers} answered</span>
            {phase==="QUESTION" && timeLeft!==null && <span className={timeLeft<5?"text-rose-300 font-bold":""}>{Math.ceil(timeLeft)}s left</span>}
          </div>
        ) : (
          <div className="mt-2 text-[11px] font-bold text-amber-200">Finished • {total}Q • Top {sorted[0]?.score ?? 0} pts</div>
        )}
      </div>

      {/* Question card */}
      {!isOver ? (
        <div className="relative rounded-[24px] bg-[#0f2231] border border-white/10 shadow-xl overflow-visible pt-3">
          {/* progress bar */}
          <div className="h-1.5 bg-white/10 w-full rounded-t-[24px] overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-300 to-orange-400 transition-all duration-200" style={{ width: `${((idx)/Math.max(total,1))*100}%` }} />
          </div>
          {/* Timer at top middle of question border */}
          {phase==="QUESTION" && timeLeft!==null && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-4 py-1 rounded-full bg-[#0a1e2e] border-2 border-amber-300 shadow-lg">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className={`text-xs font-black tracking-wide ${timeLeft<5?"text-rose-300":"text-white"}`}>⏱ {Math.ceil(timeLeft)}s</span>
            </div>
          )}
          {isReveal && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 px-4 py-1 rounded-full bg-emerald-500 border-2 border-emerald-300 shadow-lg text-xs font-black text-white">Answer • {LETTERS[correctIndex]}</div>
          )}
          {q ? (
            <div className="p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-1 rounded-full bg-amber-400 text-[#0e2533] text-xs font-black">Q {idx+1}/{total}</span>
                <span className="text-xs text-white/40 capitalize">{pub.questionType}</span>
              </div>

              {q.imageUrl && (
                <div className="mt-4 rounded-2xl overflow-hidden border border-white/10 bg-black/20">
                  <img src={q.imageUrl} alt="question" className="w-full max-h-[220px] object-cover" loading="lazy" />
                </div>
              )}

              <h2 className="mt-4 text-[18px] sm:text-[20px] font-extrabold text-white leading-tight">{q.q}</h2>

              {/* Timer bar — hidden when No limit */}
              {phase==="QUESTION" && pub.timerSeconds!==0 && (
                <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className={`h-full transition-all duration-200 ${timeLeft!==null && timeLeft<5 ? "bg-rose-500":"bg-emerald-400"}`} style={{ width: `${timePct*100}%` }} />
                </div>
              )}

              {/* Options — supports Multiple (4) and True/False (2) */}
              <div className={`mt-5 grid gap-3 ${q.options.length===2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2"}`}>
                {q.options.map((opt, i)=>{
                  const letter = LETTERS[i] || String.fromCharCode(65+i);
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
                      <span className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-black text-white border shadow ${OPTION_COLORS[i]}`}>{q.options.length===2 ? opt.slice(0,1).toUpperCase() : letter}</span>
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
                  ? <div className="mt-4 text-center py-3 rounded-full bg-white/10 border border-white/15 text-white/60 font-bold text-sm">Locked in {q.options.length===2 ? q.options[myAnswer] : LETTERS[myAnswer]} — waiting {pub.answersCount}/{pub.totalPlayers}</div>
                  : <p className="mt-4 text-center text-xs text-white/40">Pick {q.options.length===2 ? "True/False" : "A-D"} — early reveal when everyone answers</p>
              )}
              {isSpectator && phase==="QUESTION" && <div className="mt-4 text-center py-3 rounded-full bg-white/5 text-white/40 font-bold text-sm">Spectating — answers hidden until reveal</div>}

              {/* Reveal breakdown: who picked what — enlarged for 12p, adapts to 2 or 4 */}
              {isReveal && (
                <div className="mt-6 rounded-2xl bg-white/[0.04] border border-white/10 p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-white">Answer • <span className="text-emerald-300">{q.options[correctIndex]} is correct</span></h3>
                    <span className="text-xs text-white/40">{pub.revealAckCount}/{pub.totalPlayers} ready</span>
                  </div>
                  <div className={`mt-4 grid gap-3 text-center ${q.options.length===2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
                    {q.options.map((opt,i)=>(
                      <div key={i} className={`rounded-xl p-3 border min-h-[96px] flex flex-col ${i===correctIndex?"bg-emerald-500/15 border-emerald-400/40":"bg-white/5 border-white/10"}`}>
                        <div className={`text-xs font-black truncate ${i===correctIndex?"text-emerald-300":"text-white/60"}`}>{q.options.length===2 ? opt : `${LETTERS[i]} • ${opt.slice(0,18)}`} • {breakdown[i]||0}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5 justify-center content-start flex-1">
                          {(Object.entries(picks).filter(([,ch])=> ch===i).map(([pid])=>{
                            const pl = pub.players.find(p=>p.id===pid);
                            const isMe = pid===myId;
                            return <span key={pid} className={`px-2 py-1 rounded-full text-[11px] font-bold leading-none ${isMe?"bg-amber-400 text-[#0e2533]": i===correctIndex?"bg-emerald-400/30 text-emerald-200 border border-emerald-400/30":"bg-white/10 text-white/70"}`}>{pl?.name || pid.slice(0,4)} {isMe?"★":""}</span>;
                          }))}
                          {breakdown[i]===0 && <span className="text-[11px] text-white/20 italic">—</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 text-xs text-white/30 text-center">{breakdown[correctIndex]||0} correct • {pub.totalPlayers - (breakdown[correctIndex]||0)} wrong</div>
                  {isSpectator
                    ? <div className="mt-4 py-3 rounded-full bg-white/5 text-white/40 font-bold text-center text-sm">Spectating… {pub.revealAckCount}/{pub.totalPlayers}</div>
                    : pub.revealAcks?.[myId]
                      ? <div className="mt-4 py-3 rounded-full bg-white/10 border border-white/15 text-white/60 font-bold text-center text-sm">Waiting… {pub.revealAckCount}/{pub.totalPlayers}</div>
                      : <button onClick={handleAck} className="mt-4 w-full py-3 rounded-full bg-[#f3ecd8] hover:bg-white text-[#0e2533] font-extrabold text-[15px]">Continue ({pub.revealAckCount}/{pub.totalPlayers})</button>
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
          <p className="text-xs text-white/40">{pub.timerSeconds===0 ? "No limit" : `${pub.timerSeconds}s`} • {pub.questionType} • {total} Q</p>

          <div className="mt-5 flex justify-center gap-2 items-end">
            {(() => {
              const top3 = sorted.slice(0,3);
              // podium order 2nd, 1st, 3rd for visual
              const order = [1,0,2].filter(i=> i < top3.length);
              return order.map(i=>{
                const p = top3[i];
                const isMe = p.id===myId;
                const heights = ["h-[102px]","h-[138px]","h-[88px]"];
                const idxOrdered = order.indexOf(i);
                const isFirst = i===0;
                return (
                  <div key={p.id} className={`flex-1 max-w-[120px] rounded-2xl border-2 flex flex-col items-center justify-end p-3 shadow-lg ${isFirst?"bg-[#0a1e2e] border-amber-400 text-white ring-2 ring-amber-400/40":"bg-white/5 border-white/15 text-white"} ${heights[idxOrdered]}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-xs border-2 ${isMe?"border-amber-300 bg-[#f3ecd8] text-[#0a1e2e]": isFirst?"bg-amber-400 text-[#0a1e2e] border-amber-300":"bg-[#1e2a3a] text-white border-white/20"}`}>{p.name.slice(0,2).toUpperCase()}</div>
                    <div className={`mt-2 text-xs font-black truncate max-w-full ${isFirst?"text-amber-300":"text-white"}`}>{p.name} {isMe?"★":""}</div>
                    <div className={`text-xl font-black ${isFirst?"text-amber-300":"text-emerald-300"}`}>{p.score} <span className="text-[11px] font-bold opacity-60">pts</span></div>
                    <div className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${isFirst?"bg-amber-400 text-[#0a1e2e]":"bg-white/10 text-white/60"}`}>{i===0?"1st":i===1?"2nd":"3rd"} {isFirst?"👑":""}</div>
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
                }} className="flex-1 py-3 rounded-full bg-amber-400 hover:bg-amber-300 text-[#0e2533] font-extrabold">Back to Lobby</button>
              : <div className="flex-1 py-3 rounded-full bg-white/5 text-white/40 font-bold text-center">Waiting for host…</div>
            }
          </div>
        </div>
      )}

      {/* Game log — uniform, organised for 12p, only button toggles */}
      {pub.log?.length>0 && (
        <div className="rounded-2xl bg-[#0f2231]/70 border border-white/10 shadow-xl">
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-xs font-black tracking-wide text-white/70">Game log • {pub.log.length}</span>
            <button
              onClick={()=> setLogOpen(v=>!v)}
              aria-label={logOpen ? "Collapse log" : "Expand log"}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors"
            >
              <span className={`text-[12px] transition-transform duration-300 ${logOpen ? "rotate-180" : "rotate-0"}`}>⌄</span>
            </button>
          </div>
          {logOpen && (
            <div className="px-3 pb-3 space-y-1.5 max-h-[420px] overflow-auto overscroll-contain pr-1">
              {[...pub.log].reverse().map(e=>{
                return (
                  <div key={e.id} className="flex gap-2.5 text-xs rounded-xl px-3 py-2.5 border bg-white/[0.03] border-white/10">
                    <span className="font-bold shrink-0 min-w-[74px] text-[11px] tracking-wide text-white/40">{e.type}</span>
                    <span className="text-white/70 flex-1 leading-snug break-words whitespace-pre-wrap">{e.text}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {toast && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-amber-400 text-[#0e2533] text-sm font-bold px-4 py-2.5 rounded-full shadow-xl border border-white/20 z-50">{toast}</div>}
    </div>
  );
}
