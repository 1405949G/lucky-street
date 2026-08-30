import { io } from "socket.io-client";
const URL="http://localhost:3001";
function connect(){ return io(URL,{reconnection:false});}
function ack(socket,ev,data){return new Promise(r=>socket.emit(ev,data,ans=>r(ans)));}
async function run(){
  const a=connect(); await new Promise(r=>a.on("connect",r));
  console.log("A",a.id);
  let r=await ack(a,"profile:register",{username:"TempUser",avatar:"#f00"});
  console.log("register TempUser",r.ok);
  console.log("disconnect A");
  a.disconnect();
  // after 1s, try steal - should succeed as reclaim (grace)
  await new Promise(r=>setTimeout(r,1000));
  const b=connect(); await new Promise(r=>b.on("connect",r));
  let r2=await ack(b,"profile:register",{username:"TempUser"});
  console.log("B tries during grace (1s) - expect reclaim success? ",r2);
  b.disconnect();
  // wait for GC expire (4s from A's disconnect, but B's reclaim reset timer? Let's do fresh Alice2)
  console.log("Test expiration: create Alice2, disconnect, wait 5s > GC 4s, then reclaim should be fresh");
  const c=connect(); await new Promise(r=>c.on("connect",r));
  let r3=await ack(c,"profile:register",{username:"ExpireTest",avatar:"#0f0"});
  console.log("C register ExpireTest",r3.ok);
  c.disconnect();
  await new Promise(r=>setTimeout(r,5500));
  const d=connect(); await new Promise(r=>d.on("connect",r));
  let r4=await ack(d,"profile:register",{username:"ExpireTest"});
  console.log("D after 5.5s (past GC 4s) tries ExpireTest - should succeed as freed: ",r4);
  d.disconnect();
  process.exit(0);
}
run().catch(e=>{console.error(e);process.exit(1);});
