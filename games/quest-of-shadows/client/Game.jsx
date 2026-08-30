import React, { useContext, useEffect, useState } from "react";
import { SocketContext } from "../../../client/src/context/SocketContext.jsx";

export default function QuestGame({ roomId, isHost, isSpectator }) {
  const { socket } = useContext(SocketContext);
  const [pub, setPub] = useState(null);
  const [priv, setPriv] = useState(null);
  const [selected, setSelected] = useState([]);
  const [assassinPick, setAssassinPick] = useState(null);
  const [toast, setToast] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const myId = socket?.id;

  function showToast(m) { setToast(m); setTimeout(()=>setToast(null), 2500); }

  useEffect(() => {
    if (!socket) return;
    function onUpdate(data) {
      if (!data) { setPub(null); setPriv(null); return; }
      // Filter cross-room leak (defense-in-depth, server now room-scoped)
      const incomingRoom = data.roomCode || data.roomId || data.id;
      if (incomingRoom && String(incomingRoom).toUpperCase() !== String(roomId).toUpperCase()) return;
      setPub(data);
    }
    function onPrivate(data) {
      if (!data) { setPriv(null); return; }
      const incomingRoom = data.roomCode || data.roomId;
      if (incomingRoom && String(incomingRoom).toUpperCase() !== String(roomId).toUpperCase()) return;
      setPriv(data);
    }
    socket.on("game:update", onUpdate);
    socket.on("game:private", onPrivate);
    socket.emit("game:requestState", { roomId }, (res) => {
      if (res?.ok) {
        if (res.public) {
          const pubRoom = res.public.roomCode || res.public.roomId;
          if (!pubRoom || String(pubRoom).toUpperCase() === String(roomId).toUpperCase()) setPub(res.public);
        }
        if (res.private) setPriv(res.private);
      }
    });
    function onLobby(full) {
      if (full.id !== roomId) return;
      if (full.gameState) setPub(full.gameState);
      else if (full.hasGame === false) { setPub(null); setPriv(null); }
    }
    socket.on("lobby:update", onLobby);
    return () => {
      socket.off("game:update", onUpdate);
      socket.off("game:private", onPrivate);
      socket.off("lobby:update", onLobby);
    };
  }, [socket, roomId]);

  useEffect(() => {
    setSelected([]);
    setAssassinPick(null);
  }, [pub?.phase, pub?.currentQuest]);

  if (!pub) {
    return (
      <div className="rounded-2xl bg-[#0f2231]/60 border border-white/10 p-6 text-center">
        <p className="text-sm text-white/60">No quest in progress.</p>
        <p className="text-xs text-white/30 mt-1">Host can start when ready.</p>
      </div>
    );
  }

  const phase = pub.phase;
  const questIdx = pub.currentQuest;
  const quest = pub.quests?.[questIdx];
  const questNum = Math.min(questIdx + 1, 5);
  const isOnTeam = pub.proposal?.teamIds?.includes(myId);
  const hasVotedQuest = !!priv?.myQuestVote;

  function emitAction(type, payload, cb) {
    if (!socket) return;
    setActionLoading(true);
    socket.emit("game:action", { roomId, type, payload }, (res) => {
      setActionLoading(false);
      if (!res?.ok) showToast(res?.error || "Action failed");
      else if (cb) cb(res);
    });
  }

  function handleReveal() {
    emitAction("REVEAL_ROLE", { playerId: myId });
  }

  function toggleSelect(pid) {
    if (!quest) return;
    const need = quest.size;
    if (selected.includes(pid)) setSelected(selected.filter(id=>id!==pid));
    else {
      if (selected.length >= need) showToast(`Choose exactly ${need}`);
      else setSelected([...selected, pid]);
    }
  }

  function handlePropose() {
    if (!quest) return;
    if (selected.length !== quest.size) return showToast(`Select ${quest.size} players`);
    emitAction("PROPOSE_TEAM", { teamIds: selected });
  }

  function handleTeamVote(vote) {
    emitAction("SUBMIT_TEAM_VOTE", { vote });
  }

  function handleQuestVote(vote) {
    emitAction("SUBMIT_QUEST_VOTE", { vote });
  }

  function handleAssassinate() {
    if (!assassinPick) return showToast("Pick a target");
    emitAction("ASSASSINATE", { targetId: assassinPick });
  }

  return (
    <div className="space-y-4">
      {/* Private Role Card */}
      {priv?.self && (
        <div className={`rounded-2xl border p-4 text-center ${priv.self.allegiance==='GOOD' ? 'bg-emerald-500/10 border-emerald-400/30' : 'bg-rose-500/10 border-rose-400/30'}`}>
          <p className="text-xs tracking-widest font-bold text-white/60">YOUR ALLEGIANCE</p>
          <h3 className={`font-black text-lg ${priv.self.allegiance==='GOOD' ? 'text-emerald-300' : 'text-rose-300'}`}>{priv.self.role} • {priv.self.allegiance}</h3>
          {priv.vision?.sees?.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs text-white/60">
                {priv.self.role==='PERCIVAL' ? 'You see Merlin (maybe Morgana):' : priv.self.role==='MERLIN' ? 'You see Evil (except Mordred):' : 'You see fellow Evil (except Oberon):'}
              </p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {priv.vision.sees.map(id=>{
                  const pl = pub.players.find(p=>p.id===id);
                  const name = pl?.name || id.slice(0,4);
                  return <span key={id} className="px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs font-bold text-white">{name}{priv.self.role==='PERCIVAL' ? ' ?' : ''}</span>;
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-white/50 mt-2">
              {priv.self.role==='LOYAL' ? 'Loyal — you see nobody.' : priv.self.role==='OBERON' ? 'Oberon — isolated, you see nobody.' : priv.self.role==='MERLIN' && priv.vision.sees.length===0 ? 'Mordred hides from you.' : 'You see nobody.'}
            </p>
          )}
        </div>
      )}
      {isSpectator && !priv?.self && (
        <div className="rounded-xl bg-amber-400/10 border border-amber-400/20 p-3 text-center text-xs text-amber-200">Spectating — you see the board only. Private roles hidden.</div>
      )}

      {/* Phase Body */}
      <div className="rounded-2xl bg-[#0f2231]/60 border border-white/10 p-4">
      {phase==='ROLE_REVEAL' && (
        <div className="text-center">
          <h3 className="font-extrabold text-white">Know your part</h3>
          <p className="text-xs text-white/50">Each player reveals privately — bots auto-reveal.</p>
          <div className="mt-4 grid grid-cols-3 sm:grid-cols-5 gap-2">
            {pub.players.map(p=>{
              const idx = pub.players.findIndex(x=>x.id===p.id);
              const revealed = pub.revealed[idx];
              const isMe = p.id===myId;
              const isBot = !!p.isBot;
              const avatarIsImage = p.avatar && typeof p.avatar === "string" && p.avatar.startsWith("data:");
              const avatarBg = !isBot && !avatarIsImage && p.avatar ? p.avatar : null;
              return (
                <div key={p.id} className={`rounded-xl p-2 border text-center ${revealed ? 'bg-emerald-500/15 border-emerald-400/30' : 'bg-white/5 border-white/10'} ${isMe?'ring-2 ring-amber-300/50':''}`}>
                  {isBot ? (
                    <div className="w-10 h-10 mx-auto rounded-full bg-[#1e2a3a] border border-white/10 flex items-center justify-center text-[16px]">🤖</div>
                  ) : avatarIsImage ? (
                    <div className={`w-10 h-10 mx-auto rounded-full overflow-hidden border ${isMe?'border-amber-300':'border-white/10'}`}><img src={p.avatar} alt={p.name} className="w-full h-full object-cover" /></div>
                  ) : (
                    <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center font-black text-xs border ${isMe?'bg-[#f3ecd8] text-[#0a1e2e] border-amber-300':'bg-[#1e2a3a] text-white border-white/10'}`} style={avatarBg ? { background: avatarBg } : undefined}>{p.name.slice(0,2).toUpperCase()}</div>
                  )}
                  <div className="text-xs font-bold text-white mt-1 truncate">{p.name}{isMe?' (YOU)':''}</div>
                  <div className={`text-[10px] font-bold ${revealed?'text-emerald-300':'text-white/40'}`}>{revealed?'READY':'REVEALING'}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-4">
            {(() => {
              const myIdx = pub.players.findIndex(p=>p.id===myId);
              const myRevealed = myIdx!==-1 ? pub.revealed[myIdx] : false;
              if (isSpectator) return <div className="py-3 rounded-full bg-white/5 text-white/40 text-sm font-bold">Spectating reveal… {pub.revealed.filter(Boolean).length}/{pub.players.length}</div>;
              if (myRevealed) return <div className="py-3 rounded-full bg-white/10 border border-white/15 text-white/60 text-sm font-bold">Waiting for others… {pub.revealed.filter(Boolean).length}/{pub.players.length}</div>;
              return <button onClick={handleReveal} disabled={actionLoading} className="w-full py-3 rounded-full bg-[#f3ecd8] hover:bg-white text-[#0e2533] font-extrabold">I know my part</button>;
            })()}
          </div>
        </div>
      )}

      {phase==='TEAM_PROPOSAL' && (
        <div>
          {(() => {
            const leader = pub.players.find(p=>p.id===pub.leaderId);
            const need = quest?.size || 2;
            const isLeader = pub.leaderId === myId;
            if (isLeader) {
              return (
                <div className="text-center">
                  <p className="text-xs tracking-widest font-bold text-[#7ec8e6]">YOU ARE LEADER • QUEST {questNum}</p>
                  <h3 className="font-black text-white text-lg">Choose {need}</h3>
                  <p className="text-xs text-white/50">They watch who you leave out.</p>
                  <div className="mt-4 grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {pub.players.map(p=>{
                      const sel = selected.includes(p.id);
                      const isBot = !!p.isBot;
                      const isMe = p.id===myId;
                      const avatarIsImage = p.avatar && typeof p.avatar === "string" && p.avatar.startsWith("data:");
                      const avatarBg = !isBot && !avatarIsImage && p.avatar ? p.avatar : null;
                      return (
                        <button key={p.id} onClick={()=>toggleSelect(p.id)} className={`p-2 rounded-2xl border-2 ${sel?'border-[#7ec8e6] bg-[#7ec8e6]/15':'border-white/10 bg-white/5'}`}>
                          {isBot ? (
                            <div className="w-10 h-10 mx-auto rounded-full bg-[#1e2a3a] border border-white/10 flex items-center justify-center text-[18px]">🤖</div>
                          ) : avatarIsImage ? (
                            <div className={`w-10 h-10 mx-auto rounded-full overflow-hidden border ${isMe?'border-amber-300':'border-white/10'}`}><img src={p.avatar} alt={p.name} className="w-full h-full object-cover" /></div>
                          ) : (
                            <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center font-black text-xs border ${isMe?'bg-[#f3ecd8] text-[#0a1e2e] border-amber-300':'text-white border-white/10'}`} style={avatarBg ? { background: avatarBg } : { background: '#1e2a3a' }}>{p.name.slice(0,2).toUpperCase()}</div>
                          )}
                          <div className="text-xs font-bold text-white mt-1 truncate">{p.name}{isMe?' (YOU)':''}</div>
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={handlePropose} disabled={selected.length!==need || actionLoading} className={`mt-4 w-full py-3 rounded-full font-extrabold ${selected.length===need?'bg-[#f3ecd8] hover:bg-white text-[#0e2533]':'bg-white/10 text-white/30'}`}>Put to table ({selected.length}/{need})</button>
                </div>
              );
            } else {
              return (
                <div className="text-center">
                  <p className="text-xs tracking-widest font-bold text-[#7ec8e6]">QUEST {questNum} — CHOOSING {need}</p>
                  <h3 className="font-black text-white text-lg">{leader?.name || 'Leader'} is choosing</h3>
                  <p className="text-xs text-white/50">They are watching who you leave out.</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {pub.players.map(p=>{
                      const isBot = !!p.isBot;
                      const avatarIsImage = p.avatar && typeof p.avatar === "string" && p.avatar.startsWith("data:");
                      const avatarBg = !isBot && !avatarIsImage && p.avatar ? p.avatar : null;
                      return (
                      <div key={p.id} className="flex flex-col items-center">
                        {isBot ? (
                          <div className={`w-10 h-10 rounded-full bg-[#1e2a3a] border flex items-center justify-center text-[16px] ${p.id===pub.leaderId?'border-amber-400 ring-2 ring-amber-400':'border-white/10'}`}>🤖</div>
                        ) : avatarIsImage ? (
                          <div className={`w-10 h-10 rounded-full overflow-hidden border ${p.id===pub.leaderId?'border-amber-400 ring-2 ring-amber-400': p.id===myId?'border-amber-300':'border-white/10'}`}><img src={p.avatar} alt={p.name} className="w-full h-full object-cover" /></div>
                        ) : (
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-xs border ${p.id===pub.leaderId?'bg-amber-300 text-black ring-2 ring-amber-400': p.id===myId?'bg-[#f3ecd8] text-[#0a1e2e] border-amber-300':'text-white border-white/10'}`} style={avatarBg ? { background: avatarBg } : { background: '#1e2a3a' }}>{p.name.slice(0,2).toUpperCase()}</div>
                        )}
                        <span className="text-[10px] font-bold text-white/60">{p.name}{p.id===myId?' YOU':''}</span>
                      </div>
                    );})}
                  </div>
                </div>
              );
            }
          })()}
        </div>
      )}

      {phase==='TEAM_VOTE' && (
        <div className="text-center">
          <p className="text-xs tracking-widest font-bold text-[#7ec8e6]">PROPOSED • QUEST {questNum}</p>
          <h3 className="font-black text-white text-lg">Do they go?</h3>
          <div className="flex justify-center gap-2 mt-3 flex-wrap">
            {pub.proposal.teamIds.map(id=>{
              const pl = pub.players.find(p=>p.id===id);
              const isBot = !!pl?.isBot;
              const avatarIsImage = pl?.avatar && typeof pl.avatar === "string" && pl.avatar.startsWith("data:");
              const avatarBg = !isBot && !avatarIsImage && pl?.avatar ? pl.avatar : null;
              return <div key={id} className="flex flex-col items-center">
                {isBot ? (
                  <div className="w-12 h-12 rounded-full bg-[#1e2a3a] border border-white/15 flex items-center justify-center text-[20px]">🤖</div>
                ) : avatarIsImage ? (
                  <div className="w-12 h-12 rounded-full overflow-hidden border border-white/15"><img src={pl.avatar} alt={pl.name} className="w-full h-full object-cover" /></div>
                ) : (
                  <div className="w-12 h-12 rounded-full border border-white/15 flex items-center justify-center font-black text-white text-xs" style={avatarBg ? { background: avatarBg } : { background: '#1e2a3a' }}>{pl?.name?.slice(0,2)?.toUpperCase() || '??'}</div>
                )}
                <span className="text-xs font-bold text-white/70 mt-1">{pl?.name || id.slice(0,4)}{id===myId?' YOU':''}</span></div>;
            })}
          </div>
          {isSpectator ? <div className="mt-4 py-3 rounded-full bg-white/5 text-white/40 font-bold">Spectating vote… {pub.proposal.voteCount}/{pub.players.length}</div> :
           priv?.myTeamVote ? <div className="mt-4 py-3 rounded-full bg-white/10 border border-white/15 text-white/60 font-bold">You voted {priv.myTeamVote} — waiting {pub.proposal.voteCount}/{pub.players.length}</div> :
           <div className="mt-4 grid grid-cols-2 gap-3">
              <button onClick={()=>handleTeamVote('APPROVE')} disabled={actionLoading} className="py-3 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-black border border-emerald-400/40">Approve</button>
              <button onClick={()=>handleTeamVote('REJECT')} disabled={actionLoading} className="py-3 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-black border border-rose-400/40">Reject</button>
           </div>
          }
          <p className="text-xs text-white/30 mt-2">{pub.proposal.voteCount}/{pub.players.length} voted</p>
        </div>
      )}

      {phase==='TEAM_VOTE_REVEAL' && (
        <div className="text-center">
          <p className="text-xs tracking-widest font-bold text-[#7ec8e6]">VOTE REVEAL</p>
          {(() => {
            const votes = pub.proposal.votes || {};
            const approve = Object.values(votes).filter(v=>v==='APPROVE').length;
            const reject = Object.values(votes).length - approve;
            const passed = approve > reject;
            const ackCount = pub.teamVoteRevealAckCount || 0;
            const total = pub.players.length;
            const hasAcked = !!pub.teamVoteRevealAcks?.[myId];
            return (
              <>
                <h3 className={`font-black text-lg ${passed?'text-emerald-300':'text-rose-300'}`}>{passed?'Approved':'Rejected'} <span className="text-sm font-bold text-white/60">({approve}–{reject})</span></h3>
                <div className="mt-3 space-y-1 max-w-[320px] mx-auto text-left">
                  {pub.players.map(p=>{
                    const v = votes[p.id];
                    const acked = !!pub.teamVoteRevealAcks?.[p.id];
                    return <div key={p.id} className={`flex justify-between rounded-xl px-3 py-2 border text-sm ${v==='APPROVE'?'bg-emerald-500/15 border-emerald-400/30 text-emerald-300':'bg-rose-500/15 border-rose-400/30 text-rose-300'}`}><span className="font-bold text-white flex items-center gap-1">{p.name}{p.id===myId?' YOU':''} {acked && <span className="text-[10px] text-emerald-300">✓</span>}</span><span className="font-black">{v||'—'}</span></div>;
                  })}
                </div>
                {isSpectator ? (
                  <div className="mt-4 py-3 rounded-full bg-white/5 text-white/40 font-bold">Spectating… {ackCount}/{total} ready</div>
                ) : hasAcked ? (
                  <div className="mt-4 py-3 rounded-full bg-white/10 border border-white/15 text-white/60 font-bold">Waiting for others… {ackCount}/{total}</div>
                ) : (
                  <button onClick={()=>emitAction('ACK_TEAM_VOTE_REVEAL', {})} disabled={actionLoading} className="mt-4 w-full py-3 rounded-full bg-[#f3ecd8] hover:bg-white text-[#0e2533] font-extrabold">Continue ({ackCount}/{total})</button>
                )}
              </>
            );
          })()}
        </div>
      )}

      {phase==='QUEST_VOTE' && (
        <div className="text-center">
          <p className="text-xs tracking-widest font-bold text-[#7ec8e6]">QUEST {questNum} • TEAM VOTE SECRET</p>
          <div className="flex justify-center gap-2 mt-3 flex-wrap">
            {pub.proposal.teamIds.map(id=>{
              const pl = pub.players.find(p=>p.id===id);
              const isBot = !!pl?.isBot;
              const avatarIsImage = pl?.avatar && typeof pl.avatar === "string" && pl.avatar.startsWith("data:");
              const avatarBg = !isBot && !avatarIsImage && pl?.avatar ? pl.avatar : null;
              return isBot ? (
                <div key={id} className="w-10 h-10 rounded-full bg-[#1e2a3a] border border-white/10 flex items-center justify-center text-[16px]">🤖</div>
              ) : avatarIsImage ? (
                <div key={id} className={`w-10 h-10 rounded-full overflow-hidden border ${id===myId?'border-amber-300':'border-white/10'}`}><img src={pl.avatar} alt={pl.name} className="w-full h-full object-cover" /></div>
              ) : (
                <div key={id} className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-xs border ${id===myId?'bg-[#f3ecd8] text-[#0a1e2e] border-amber-300':'text-white border-white/10'}`} style={avatarBg ? { background: avatarBg } : { background: '#1e2a3a' }}>{pl?.name?.slice(0,2)?.toUpperCase()||'??'}</div>
              );
            })}
          </div>
          {isSpectator ? <div className="mt-4 py-3 rounded-full bg-white/5 text-white/40 font-bold">Quest in progress…</div> :
           !pub.proposal.teamIds.includes(myId) ? <div className="mt-4 py-3 rounded-full bg-white/5 text-white/40 font-bold">You are not on this quest — watching</div> :
           hasVotedQuest ? <div className="mt-4 py-3 rounded-full bg-white/10 border border-white/15 text-white/60 font-bold">Card played — waiting</div> :
           <div className="mt-4">
              <h3 className="font-black text-white">Play your card</h3>
              <p className="text-xs text-white/50 max-w-[320px] mx-auto">Good must Succeed. Evil may Fail. One Fail can doom the quest.</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button onClick={()=>handleQuestVote('SUCCESS')} disabled={actionLoading} className="py-3 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-black border border-emerald-400/40">Succeed</button>
                <button onClick={()=>handleQuestVote('FAIL')} disabled={actionLoading || priv?.self?.allegiance==='GOOD'} className={`py-3 rounded-full font-black border ${priv?.self?.allegiance==='GOOD' ? 'bg-white/5 border-white/10 text-white/20 border-dashed' : 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400/40'}`}>Fail</button>
              </div>
              {priv?.self?.allegiance==='GOOD' && <p className="text-xs text-white/30 mt-2">You are Good — you can only Succeed</p>}
            </div>
          }
        </div>
      )}

      {phase==='QUEST_REVEAL' && (
        <div className="text-center">
          <p className="text-xs tracking-widest font-bold text-[#7ec8e6]">QUEST {questNum} REVEAL</p>
          {(() => {
            const q = pub.quests[questIdx] || pub.quests[questIdx-1];
            const isSuccess = q?.status==='SUCCESS';
            const votes = q?.votesShuffled || [];
            const ackCount = pub.questRevealAckCount || 0;
            const total = pub.players.length;
            const hasAcked = !!pub.questRevealAcks?.[myId];
            return (
              <>
                <div className="flex justify-center gap-2 mt-3 flex-wrap">
                  {votes.map((v,i)=><span key={i} className={`px-4 py-1.5 rounded-full text-xs font-black ${v==='FAIL'?'bg-rose-500 text-white':'bg-emerald-400 text-black'}`}>{v}</span>)}
                </div>
                <h3 className={`font-black text-lg mt-3 ${isSuccess?'text-emerald-300':'text-rose-300'}`}>{isSuccess?'The quest holds':'The quest fails'}</h3>
                <p className="text-xs text-white/50">{q?.teamIds?.length||0} on quest • {q?.failCount ?? '?'} fail • {isSuccess?'Good holds':'Evil strikes'}</p>
                {isSpectator ? (
                  <div className="mt-4 py-3 rounded-full bg-white/5 text-white/40 font-bold">Spectating… {ackCount}/{total}</div>
                ) : hasAcked ? (
                  <div className="mt-4 py-3 rounded-full bg-white/10 border border-white/15 text-white/60 font-bold">Waiting… {ackCount}/{total}</div>
                ) : (
                  <button onClick={()=>emitAction('ACK_QUEST_REVEAL', {})} disabled={actionLoading} className="mt-4 w-full py-3 rounded-full bg-[#f3ecd8] hover:bg-white text-[#0e2533] font-extrabold">Continue ({ackCount}/{total})</button>
                )}
              </>
            );
          })()}
        </div>
      )}

      {phase==='ASSASSINATION' && (
        <div className="text-center">
          <p className="text-xs tracking-widest font-bold text-rose-300">THREE QUESTS DONE — GOOD LEADS</p>
          <h3 className="font-black text-white text-lg">Name Merlin</h3>
          <p className="text-xs text-white/50 max-w-[320px] mx-auto">Assassin, pick the one you think is Merlin. Good wins unless you find them.</p>
          {priv?.self?.role==='ASSASSIN' ? (
            <div className="mt-4">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {pub.players.filter(p=>{
                  if (!priv) return true;
                  const isEvil = priv.vision?.sees?.includes(p.id) || p.id===myId;
                  return !isEvil;
                }).map(p=>{
                  const sel = assassinPick===p.id;
                  const isBot = !!p.isBot;
                  const avatarIsImage = p.avatar && typeof p.avatar === "string" && p.avatar.startsWith("data:");
                  const avatarBg = !isBot && !avatarIsImage && p.avatar ? p.avatar : null;
                  return (
                    <button key={p.id} onClick={()=>setAssassinPick(p.id)} className={`p-2 rounded-2xl border-2 ${sel?'border-amber-400 bg-amber-400/15':'border-white/10 bg-white/5'}`}>
                      {isBot ? (
                        <div className="w-10 h-10 mx-auto rounded-full bg-[#1e2a3a] border border-white/10 flex items-center justify-center text-[16px]">🤖</div>
                      ) : avatarIsImage ? (
                        <div className="w-10 h-10 mx-auto rounded-full overflow-hidden border border-white/10"><img src={p.avatar} alt={p.name} className="w-full h-full object-cover" /></div>
                      ) : (
                        <div className="w-10 h-10 mx-auto rounded-full border border-white/10 flex items-center justify-center font-black text-white text-xs" style={avatarBg ? { background: avatarBg } : { background: '#1e2a3a' }}>{p.name.slice(0,2).toUpperCase()}</div>
                      )}
                      <div className="text-xs font-bold text-white mt-1 truncate">{p.name}</div>
                    </button>
                  );
                })}
              </div>
              <button onClick={handleAssassinate} disabled={!assassinPick || actionLoading} className={`mt-4 w-full py-3 rounded-full font-extrabold ${assassinPick?'bg-rose-500 hover:bg-rose-600 text-white':'bg-white/10 text-white/30'}`}>Assassinate {assassinPick ? pub.players.find(p=>p.id===assassinPick)?.name : ''}</button>
            </div>
          ) : (
            <div className="mt-4 py-3 rounded-full bg-white/5 text-white/40 font-bold">Waiting for Assassin…</div>
          )}
        </div>
      )}

      {phase==='GAME_OVER' && (
        <div className="text-center">
          <p className={`text-xs tracking-widest font-bold ${pub.winner==='GOOD'?'text-emerald-300':'text-rose-300'}`}>{pub.winner} WINS • {pub.winReason}</p>
          <h3 className={`font-black text-xl ${pub.winner==='GOOD'?'text-emerald-300':'text-rose-400'}`}>{pub.winner==='GOOD'?'Good prevails':'Evil triumphs'}</h3>
          {pub.winReason==='ASSASSINATION' && (
            <p className="text-xs text-white/60 mt-1">
              {pub.assassination?.success ? `Assassin found Merlin (${pub.players.find(p=>p.id===pub.assassination.targetId)?.name})` : `Assassin missed ${pub.players.find(p=>p.id===pub.assassination.targetId)?.name} — Merlin hidden`}
            </p>
          )}
          {pub.winReason==='TRACKER' && <p className="text-xs text-white/60">5 team rejections — Evil wins by deadlock</p>}
          {pub.winReason==='QUESTS' && <p className="text-xs text-white/60">{pub.winner==='GOOD' ? 'Three quests held' : 'Three quests fell'}</p>}
          <div className="mt-4 space-y-1.5 text-left max-w-[360px] mx-auto">
            {pub.players.map(p=>{
              const isMe = p.id===myId;
              const isBot = !!p.isBot;
              const role = p.role || (isMe ? priv?.self?.role : null);
              const alleg = p.allegiance || (isMe ? priv?.self?.allegiance : null);
              const avatarIsImage = p.avatar && typeof p.avatar === "string" && p.avatar.startsWith("data:");
              const avatarBg = !isBot && !avatarIsImage && p.avatar ? p.avatar : null;
              return (
                <div key={p.id} className={`flex items-center justify-between rounded-xl px-3 py-2 border ${isMe?'bg-white/10 border-amber-300/30':'bg-white/5 border-white/10'}`}>
                  <div className="flex items-center gap-2">
                    {isBot ? (
                      <div className="w-8 h-8 rounded-full bg-[#1e2a3a] border border-white/10 flex items-center justify-center text-[14px]">🤖</div>
                    ) : avatarIsImage ? (
                      <div className={`w-8 h-8 rounded-full overflow-hidden border ${isMe?'border-amber-300':'border-white/10'}`}><img src={p.avatar} alt={p.name} className="w-full h-full object-cover" /></div>
                    ) : (
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs border ${isMe?'bg-[#f3ecd8] text-[#0a1e2e] border-amber-300':'text-white border-white/10'}`} style={avatarBg ? { background: avatarBg } : { background: '#1e2a3a' }}>{p.name.slice(0,2).toUpperCase()}</div>
                    )}
                    <div className="flex flex-col text-left">
                      <span className="text-sm font-bold text-white leading-none">{p.name}{isMe?' YOU':''} {p.isLeader ? '👑' : ''} {p.isBot?'🤖':''}</span>
                      {role && <span className={`text-[10px] font-bold ${alleg==='GOOD'?'text-emerald-300':'text-rose-300'}`}>{role}</span>}
                    </div>
                  </div>
                  <span className="text-xs font-bold text-white/50">{role ? (alleg==='GOOD'?'GOOD':'EVIL') : (p.isBot?'BOT':'')}</span>
                </div>
              );
            })}
          </div>
          {priv?.self && (
            <div className="mt-4 rounded-xl bg-white/5 border border-white/10 p-3 text-left">
              <p className="text-xs font-bold text-white/60">Your role: <span className={priv.self.allegiance==='GOOD'?'text-emerald-300':'text-rose-300'}>{priv.self.role} ({priv.self.allegiance})</span></p>
              {priv.vision?.sees?.length>0 && <p className="text-xs text-white/50 mt-1">You saw: {priv.vision.sees.map(id=>pub.players.find(p=>p.id===id)?.name).join(', ')}</p>}
            </div>
          )}
          <div className="mt-4 flex gap-2">
            {isHost ? <button onClick={()=>{
              if (!socket) return;
              socket.emit("game:reset", { roomId }, (res)=>{ if(!res?.ok) showToast(res?.error||'Reset failed'); else showToast('Game reset — back to lobby'); });
            }} className="flex-1 py-3 rounded-full bg-[#f3ecd8] hover:bg-white text-[#0e2533] font-extrabold">Play Again / Back to Lobby</button> : <div className="flex-1 py-3 rounded-full bg-white/5 text-white/40 font-bold text-center">Waiting for host to reset…</div>}
          </div>
        </div>
      )}
      </div>

      {/* Log */}
      {pub.log?.length>0 && (
        <details className="rounded-xl bg-white/[0.03] border border-white/10">
          <summary className="px-4 py-2 text-xs font-bold text-white/50 cursor-pointer">Log • {pub.log.length} events</summary>
          <div className="px-4 pb-3 space-y-1 max-h-[160px] overflow-auto">
            {pub.log.slice(-12).reverse().map(e=>(
              <div key={e.id} className="flex gap-2 text-xs border-l-2 border-white/10 pl-2 py-1">
                <span className="font-bold text-white/40 shrink-0 min-w-[72px] text-left">{e.type}</span>
                <span className="text-white/60 text-left flex-1">{e.text}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {toast && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[#1f2937] text-white text-sm font-bold px-4 py-2.5 rounded-full shadow-xl border border-white/10 z-50">{toast}</div>}
    </div>
  );
}
