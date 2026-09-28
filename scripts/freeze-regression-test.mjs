import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
const baseline = process.argv.includes('--baseline');
const read = (name) => baseline ? execFileSync('git', ['show', `87e11d4:public/game/js/${name}.js`], {encoding:'utf8'}) : fs.readFileSync(`public/game/js/${name}.js`, 'utf8');
const main = read('main');
function sourceFunction(name) {
  const start = main.indexOf(`  function ${name}(`);
  assert(start >= 0, name);
  const end = main.indexOf('\n  function ', start + 1);
  return main.slice(start, end);
}
function harness() {
  let now = 1000, serial = 0;
  const timers = new Map(), sounds = [];
  const node = () => {const classes=new Set(['active']);return {dataset:{},classList:{add(...names){names.forEach(n=>classes.add(n));},remove(...names){names.forEach(n=>classes.delete(n));},contains(n){return classes.has(n);}},setAttribute(){},querySelector(){return node();},querySelectorAll(){return[];}};};
  const context = {console, performance:{now:()=>now}, qa:true,
    setTimeout:(fn,ms)=>{timers.set(++serial,{at:now+ms,fn});return serial;}, clearTimeout:(id)=>timers.delete(id),
    document:{querySelectorAll:()=>[]}, els:Object.fromEntries(['body','phoneView','phoneGhostWarning','phoneRedFlood','phoneCorruption','monitorView','signalError'].map(k=>[k,node()])),
    audio:new Proxy({}, {get:(_,key)=>(...args)=>sounds.push([key,now,...args])}),
    finalBlackoutPending:false,finalBlackoutStarted:false,showLocked:null,transitionLocked:false,
    phoneTransitionTimer:null,phoneCorruptionTimer:null,phoneCorruptionStartTimer:null,pendingPhoneCorruption:null,
    majorShowCooldownUntil:0,previousView:'monitor',finalSilenceMs:10000,
    promptPending:false,setViewElement(){},setPhoneAvailability(){},phoneUnavailable(){return false;},finishMajorShow(){context.sim.endMajorShow(now);},
  };
  context.window=context;
  vm.createContext(context);
  for(const file of ['anomalies','game']) vm.runInContext(read(file),context);
  for(const name of ['openPhone','switchView','closePhone','triggerPhoneCorruption','startFinalBlackout','ensureEventCue','fireEventBeat']) vm.runInContext(sourceFunction(name),context);
  const sim = context.sim = new context.NightShiftSimulation({seed:818});
  sim.start(now);
  context.cameras=sim.cameras;context.setPhoneTab=()=>sim.setView("phone-messages");
  const advance=(ms)=>{const end=now+ms;while(now<end){now=Math.min(end,now+50);for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}sim.step(now);}};
  return {context,sim,advance,sounds,get now(){return now;}};
}
let count=0, failures=0;
function test(name,run){try{run();count++;console.log(`PASS ${name}`);}catch(error){failures++;console.error(`FAIL ${name}: ${error.message}`);}}
test('anomaly cues and beats cannot start during any protected phase',()=>{
  const h=harness();h.context.eventCueState=new Set();h.context.eventBeatState=new Map();
  for(const phase of ['pre','active','post']){
    h.sim.majorGuard.phase=phase;
    h.context.ensureEventCue({id:phase});h.context.fireEventBeat({id:phase},'impact');
  }
  h.sim.majorGuard.phase='idle';h.sim.finalQuietAt=h.now;
  h.context.ensureEventCue({id:'final'});h.context.fireEventBeat({id:'final'},'impact');
  assert.equal(h.sounds.length,0);
  h.sim.finalQuietAt=0;h.context.ensureEventCue({id:'normal'});h.context.fireEventBeat({id:'normal'},'impact');
  assert.deepEqual(h.sounds.map(s=>s[0]),['playEventCue','playEventBeat']);
});
test('putting phone down during pending show releases guard',()=>{
  const h=harness();h.sim.setView('phone-messages');h.context.triggerPhoneCorruption('snow','test');
  assert.equal(h.sim.majorGuard.phase,'pre');h.context.closePhone();h.advance(30000);
  assert.equal(h.sim.majorGuard.phase,'idle');assert(h.sim.eventQueue.some(e=>e.state!=='waiting'));
  assert.equal(h.context.pendingPhoneCorruption.type,'snow');
});
test('keyboard CAM switch releases pending phone guard',()=>{
  const h=harness();h.sim.setView('phone-messages');h.context.triggerPhoneCorruption('snow','test');
  h.context.switchView('monitor');assert.equal(h.sim.majorGuard.phase,'idle');
});
test('closing during pickup cannot start a hidden phone show',()=>{
  const h=harness();h.sim.setView('monitor');h.context.pendingPhoneCorruption={type:'snow',phrase:'test'};
  h.context.openPhone();h.advance(100);h.context.closePhone();h.advance(600);
  assert.equal(h.sim.view,'monitor');assert.equal(h.sim.majorGuard.phase,'idle');assert.equal(h.context.pendingPhoneCorruption.type,'snow');
});
for(const kind of ['snow','snow-hard','flood']) test(`real phone ${kind} callbacks protect events`,()=>{
  const h=harness();h.sim.setView('phone-messages');h.context.triggerPhoneCorruption(kind,'test');
  h.advance(3500);h.context.triggerPhoneCorruption(kind,'test');
  assert.equal(h.sim.majorGuard.phase,'active');
  const before=[h.sim.minute,h.sim.missed,h.sim.danger,h.sim.trust];
  const duration={snow:2200,'snow-hard':3200,flood:4400}[kind];
  h.advance(duration-50);assert.deepEqual([h.sim.minute,h.sim.missed,h.sim.danger,h.sim.trust],before);
  h.advance(50);assert.equal(h.sim.majorGuard.phase,'post');h.advance(4950);assert.equal(h.sim.majorGuard.phase,'post');h.advance(50);assert.equal(h.sim.majorGuard.phase,'idle');
});
for(const reason of ['ordinary message','pending show']) test(`final quiet waits for ${reason}`,()=>{
  const h=harness();h.sim.minute=400;h.sim.fakeDawnPlanned=false;h.sim.eventQueue=[];h.sim.activeEvents=[];
  h.sim.processFinalClues();h.sim.pendingOrdinaryMessages=[];h.sim.lastMinute=400;
  if(reason==='ordinary message')h.sim.queueOrdinaryMessage({sender:'test',text:'last message'});
  else h.sim.requestMajorShow('phone',h.now);
  h.advance(50);assert.equal(h.sim.finalQuietAt,0);
});
test('final run-up silences audio and blocks new shows for nine real seconds',()=>{
  const h=harness();h.sim.minute=400;h.sim.fakeDawnPlanned=false;h.sim.eventQueue=[];h.sim.activeEvents=[];
  h.sim.processFinalClues();h.sim.pendingOrdinaryMessages=[];h.sim.lastMinute=400;
  const callback=main.match(/onFinalQuiet: (\(\) => audio\.enterSilence\(\)),/);
  assert(callback,'missing final quiet audio callback');
  h.sim.callbacks.onFinalQuiet=vm.runInContext(`(${callback[1]})`,h.context);
  h.advance(50);const started=h.now;
  assert.equal(h.sim.finalQuietAt,started);assert.equal(h.sounds.at(-1)[0],'enterSilence');
  assert.equal(h.sim.requestMajorShow('pa',h.now),false);
  h.advance(8950);assert.equal(h.sim.terminalStage,false);h.advance(50);assert.equal(h.sim.terminalStage,true);
});
test('actual blackout timer provides 3900ms transition then full 10000ms silence',()=>{
  const h=harness();let callAt=0;const messages=[];
  h.sim.callbacks.onMessage=m=>messages.push(m);h.sim.callbacks.onSelfCall=()=>callAt=h.now;
  h.sim.terminalStage=true;h.context.finalBlackoutPending=true;h.context.startFinalBlackout();
  const start=h.now;h.advance(3850);assert(!h.sounds.some(x=>x[0]==='enterSilence'));h.advance(50);
  assert.equal(h.sounds.find(x=>x[0]==='enterSilence')[1],start+3900);
  const before=JSON.stringify(h.sim.eventQueue);const counts=[h.sim.missed,h.sim.danger,h.sim.trust];
  h.advance(9950);assert.equal(callAt,0);assert.equal(messages.length,0);assert.equal(JSON.stringify(h.sim.eventQueue),before);assert.deepEqual([h.sim.missed,h.sim.danger,h.sim.trust],counts);
  assert.equal(h.sounds.filter(x=>x[1]>start+3900).length,0);
  h.advance(50);assert.equal(callAt,start+13900);
  assert.equal(h.sounds.findLast(x=>x[0]==='exitSilence')[1]-h.sounds.find(x=>x[0]==='enterSilence')[1],10000);
});
console.log(`Freeze regressions: ${count} passed, ${failures} failed.`);
if(failures)process.exitCode=1;
