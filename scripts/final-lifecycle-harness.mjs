import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const main=fs.readFileSync('public/game/js/main.js','utf8');
const functionSource=name=>{const start=main.indexOf(`  function ${name}(`);assert(start>=0);return main.slice(start,main.indexOf('\n  function ',start+1));};
// Run the production blackout/call/choice timers on a deterministic wall clock.
export function completeFinalLifecycle(sim,startNow,turn,setNow){
 let now=startNow,serial=0,ending=null,callAt=0;
 const timers=new Map(),sounds=[],messages=[];
 const node=()=>({classList:{add(){},remove(){},contains(){return false;}},setAttribute(){},querySelector(){return node();},src:'test.webp'});
 const els=new Proxy({}, {get:(target,key)=>target[key] ||= node()});
 const ctx={sim,els,qa:true,console,performance:{now:()=>now},finalSilenceMs:10000,
  finalBlackoutPending:true,finalBlackoutStarted:false,showLocked:null,pendingPhoneCorruption:null,transitionLocked:false,phoneTransitionTimer:null,
  callState:null,callTimeout:null,callAnswerTimer:null,promptPending:false,
  document:{querySelectorAll:()=>[]},phone:{addMessage:m=>messages.push([now,m])},
  audio:new Proxy({}, {get:(_,key)=>(...args)=>sounds.push([key,now,...args])}),setViewElement(){},setPhoneAvailability(){},
  setTimeout:(fn,ms)=>{timers.set(++serial,{at:now+ms,fn});return serial;},clearTimeout:id=>timers.delete(id)};
 ctx.window=ctx;vm.createContext(ctx);
 for(const name of ['startFinalBlackout','showSelfCall','runTurnSequence','runNoTurnSequence'])vm.runInContext(functionSource(name),ctx);
 sim.callbacks.onSelfCall=()=>{callAt=now;ctx.showSelfCall();};
 sim.callbacks.onMessage=m=>messages.push([now,m]);
 sim.callbacks.onTurnPrompt=()=>ctx.setTimeout(()=>sim.chooseTurn(turn),5000);
 sim.callbacks.onTurnStart=(_,resolution)=>ctx.runTurnSequence(resolution);
 sim.callbacks.onTurnDeclined=(_,resolution)=>ctx.runNoTurnSequence(resolution);
 sim.callbacks.onEnding=kind=>ending=kind;
 ctx.startFinalBlackout();
 const events=JSON.stringify(sim.eventQueue),counts=[sim.missed,sim.danger,sim.trust];
 while(!sim.ended&&now-startNow<60000){now+=100;setNow(now);for(const[id,t]of[...timers])if(t.at<=now){timers.delete(id);t.fn();}sim.step(now);}
 const enter=sounds.find(x=>x[0]==='enterSilence')[1],exit=sounds.findLast(x=>x[0]==='exitSilence')[1];
 assert.equal(enter-startNow,3900);assert.equal(exit-enter,10000);assert.equal(callAt,exit);
 assert(!messages.some(([at])=>at>=enter&&at<exit));
 assert(!sounds.some(([kind,at])=>at>enter&&at<exit&&kind!=='enterSilence'));
 assert.equal(JSON.stringify(sim.eventQueue),events);assert.deepEqual([sim.missed,sim.danger,sim.trust],counts);
 assert(sim.ended&&ending,'final lifecycle deadlock');assert(sim.finalStage&&sim.turnPrompted);
 return {endedAt:now,ending,quietMs:9000,silenceMs:exit-enter};
}
