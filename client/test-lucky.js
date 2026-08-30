import { io } from "socket.io-client";

const URL = "http://localhost:3001";

function connect() {
  return io(URL, { reconnection: false, timeout: 5000 });
}

function once(socket, ev) {
  return new Promise(res => {
    const h = (data) => { socket.off(ev, h); res(data); };
    socket.on(ev, h);
  });
}

function emitAck(socket, ev, data) {
  return new Promise(res => socket.emit(ev, data, (r) => res(r)));
}

async function test() {
  console.log("=== Test Lucky Street ===");

  const a = connect();
  await new Promise(r => a.on("connect", r));
  console.log("A connected", a.id);

  // A register Alice
  let res = await emitAck(a, "profile:register", { username: "Alice", avatar: "#f59e0b" });
  console.log("A register Alice:", res);
  if (!res.ok) throw new Error("A failed");

  // B tries duplicate Alice
  const b = connect();
  await new Promise(r => b.on("connect", r));
  console.log("B connected", b.id);
  let resB = await emitAck(b, "profile:register", { username: "Alice", avatar: "#ef4444" });
  console.log("B duplicate Alice (should fail):", resB);
  if (resB.ok) throw new Error("Duplicate should fail");

  // B register Bob
  resB = await emitAck(b, "profile:register", { username: "Bob", avatar: "#22c55e" });
  console.log("B register Bob:", resB);

  // A create room
  let create = await emitAck(a, "room:create", { gameId: "quest-of-shadows", maxPlayers: 6, password: null });
  console.log("A create room:", create?.ok ? create.room.id + " " + create.room.game + " max " + create.room.maxPlayers : create);
  const roomId = create.room.id;
  console.log("Room slotsText", create.room.slotsText);
  console.log("Room isPrivate", create.room.isPrivate);

  // Check rooms:update contains it
  // B join by ID
  let join = await emitAck(b, "room:join", { roomId });
  console.log("B join:", join.ok ? "ok players " + join.room.players.map(p=>p.name).join(",") : join.error);

  // Check host can add bot
  let addBot = await emitAck(a, "lobby:addBot", { roomId, botName: "BotX", avatarColor: "#8b5cf6" });
  console.log("Add bot:", addBot.ok ? addBot.room.bots.map(x=>x.name) : addBot.error);
  console.log("Updated slotsText", addBot.ok ? addBot.room.slotsText : "");

  // Host change game — should autofill max
  let changeGame = await emitAck(a, "lobby:updateGame", { roomId, gameId: "lucky-roulette" });
  console.log("Change game to lucky-roulette:", changeGame.ok ? `game ${changeGame.room.game} max ${changeGame.room.maxPlayers}` : changeGame.error);

  // Host overwrite max
  let maxChange = await emitAck(a, "lobby:updateMaxPlayers", { roomId, maxPlayers: 7 });
  console.log("Host overwrite max to 7:", maxChange.ok ? maxChange.room.maxPlayers : maxChange.error);

  // Host update options
  let opt = await emitAck(a, "lobby:updateOptions", { roomId, options: { rounds: 8, startingChips: 2000 } });
  console.log("Host update options:", opt.ok ? opt.room.gameOptions : opt.error);

  // Player B tries host-only: add bot (should fail)
  let bobAddBot = await emitAck(b, "lobby:addBot", { roomId, botName: "HackerBot" });
  console.log("Bob add bot (should fail):", bobAddBot.ok ? "unexpected ok" : bobAddBot.error);

  // Bob rename self — should succeed
  let renameSelf = await emitAck(b, "lobby:renameSelf", { roomId, newName: "Bobby" });
  console.log("Bob rename self to Bobby:", renameSelf.ok ? renameSelf.room.players.map(p=>p.name) : renameSelf.error);

  // Bob tries rename to Alice duplicate global (should fail)
  let dupRename = await emitAck(b, "lobby:renameSelf", { roomId, newName: "Alice" });
  console.log("Bob rename to Alice duplicate (should fail):", dupRename.ok ? "unexpected" : dupRename.error);

  // Host rename bot
  let botId = addBot.room.bots[0]?.id;
  if (botId) {
    let renameBot = await emitAck(a, "lobby:renameBot", { roomId, botId, newName: "SuperBot" });
    console.log("Host rename bot:", renameBot.ok ? renameBot.room.bots.map(x=>x.name) : renameBot.error);
  }

  // Host kick Bobby
  let bobbyId = b.id;
  let kick = await emitAck(a, "lobby:kickPlayer", { roomId, targetId: bobbyId });
  console.log("Host kick Bobby:", kick.ok ? "ok remaining " + kick.room.players.map(p=>p.name) : kick.error);

  // Private room test: Alice create private
  let priv = await emitAck(a, "room:create", { gameId: "street-rally", maxPlayers: 4, password: "secret123" });
  console.log("Private room:", priv.ok ? priv.room.id + " private " + priv.room.isPrivate : priv.error);
  // B tries join without password
  let c = connect();
  await new Promise(r => c.on("connect", r));
  await emitAck(c, "profile:register", { username: "Charlie", avatar: "#06b6d4" });
  let badJoin = await emitAck(c, "room:join", { roomId: priv.room.id });
  console.log("Charlie join private without pwd (should fail):", badJoin.ok ? "unexpected" : badJoin.error);
  let goodJoin = await emitAck(c, "room:join", { roomId: priv.room.id, password: "secret123" });
  console.log("Charlie join with pwd:", goodJoin.ok ? "ok" : goodJoin.error);
  let wrongJoin = await emitAck(b, "room:join", { roomId: priv.room.id, password: "wrong" });
  console.log("Bob join private wrong pwd (should fail):", wrongJoin.ok ? "unexpected" : wrongJoin.error);

  // Test GC: disconnect Alice, check name reserved
  console.log("Test GC: disconnect Alice, try reclaim quickly");
  a.disconnect();
  await new Promise(r => setTimeout(r, 500));
  const d = connect();
  await new Promise(r => d.on("connect", r));
  let reclaimFail = await emitAck(d, "profile:register", { username: "Alice" });
  console.log("New socket try Alice during GC grace (should fail):", reclaimFail.ok ? "unexpected ok" : reclaimFail.error);

  // cleanup
  b.disconnect();
  c.disconnect();
  d.disconnect();
  console.log("=== DONE ===");
  process.exit(0);
}

test().catch(e => {
  console.error(e);
  process.exit(1);
});
