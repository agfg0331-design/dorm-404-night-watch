import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const sandbox = { window: {}, performance: { now: () => now }, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of ["anomalies", "game"]) vm.runInContext(fs.readFileSync(`public/game/js/${file}.js`, "utf8"), sandbox);
let now = 0;
const results = [];
for (let seed = 1; seed <= 250; seed++) {
  now = 1000;
  const messages = [];
  const shows = [];
  let blackout = 0;
  let activeUntil = 0;
  let globalDone = false;
  let paDone = false;
  let phoneDone = false;
  let floodDone = false;
  let preChecked = 0;
  let postChecked = 0;
  const sim = new sandbox.NightShiftSimulation({ seed, callbacks: {
    onMessage: (message) => {
      assert(sim.majorGuard.phase === "idle" && !sim.finalQuietAt, `seed ${seed}: protected message`);
      if (message.interference) assert(!sim.activeEvents.some((event) => event.camera === message.targetCamera &&
        !event.reported && event.state !== "missed"), `seed ${seed}: interference targeted active anomaly`);
      messages.push({ ...message, now, minute: sim.minute });
    },
    onEventStart: () => assert(sim.majorGuard.phase === "idle" && !sim.finalQuietAt, `seed ${seed}: spawned during guard`),
    onMonitorFail: () => { blackout = now; },
    onFakeDawn: (stage) => {
      if (stage === "done") {
        sim.endMajorShow(now);
        shows.push({ kind: "fake-dawn", ended: now });
      }
    },
    canStartFakeDawn: () => {
      if (sim.majorGuard.phase === "idle") sim.requestMajorShow("fake-dawn", now);
      if (sim.majorGuard.kind !== "fake-dawn") return false;
      const ready = sim.startMajorShow(now);
      if (ready) preChecked++;
      return ready;
    }
  } });
  sim.start(now);
  let previousPhase = sim.majorGuard.phase;
  let preAt = 0;
  let postAt = 0;
  for (let frames = 0; frames < 13000 && !sim.terminalStage; frames++) {
    now += 100;
    if (sim.majorGuard.phase === "active" && now >= activeUntil && activeUntil) {
      sim.endMajorShow(now);
      shows.push({ kind: sim.majorGuard.kind, ended: now });
      activeUntil = 0;
    }
    const due = !globalDone && now >= 241000 ? "global"
      : !paDone && sim.minute >= 200 ? "pa"
        : !phoneDone && sim.minute >= 275 ? "phone-snow"
          : !floodDone && sim.minute >= 300 ? "phone-flood" : null;
    if (due && sim.majorGuard.phase === "idle") sim.requestMajorShow(due, now);
    if (due && sim.majorGuard.kind === due && sim.startMajorShow(now)) {
      preChecked++;
      if (due === "global") globalDone = true;
      if (due === "pa") paDone = true;
      if (due === "phone-snow") phoneDone = true;
      if (due === "phone-flood") floodDone = true;
      activeUntil = now + ({ global: 8000, pa: 14000, "phone-snow": 2200, "phone-flood": 4400 })[due];
    }
    const before = { missed: sim.missed, events: sim.activeEvents.map((event) => `${event.id}:${event.progress}:${event.state}`).join("|") };
    sim.step(now);
    const phase = sim.majorGuard.phase;
    if (phase === "pre" && previousPhase !== "pre") preAt = now;
    if (phase === "active" && previousPhase === "pre") {
      assert(now - preAt >= 3400, `seed ${seed}: pre quiet too short`);
      assert(!sim.activeEvents.some((event) => event.state !== "missed" && !event.reported), `seed ${seed}: show covered anomaly`);
    }
    if (phase === "post" && previousPhase !== "post") postAt = now;
    if (previousPhase === "post" && phase === "idle") {
      assert(now - postAt >= 5000, `seed ${seed}: post quiet too short`);
      postChecked++;
    }
    if (["active", "post"].includes(phase) && sim.fakeDawnStage === "idle") {
      assert.equal(sim.missed, before.missed, `seed ${seed}: missed during show`);
      assert.equal(sim.activeEvents.map((event) => `${event.id}:${event.progress}:${event.state}`).join("|"), before.events,
        `seed ${seed}: anomaly advanced during show`);
      assert.equal(sim.getVisibleEvent(), null, `seed ${seed}: anomaly visible during show`);
    }
    previousPhase = phase;
  }
  assert(sim.terminalStage && blackout && globalDone && paDone && phoneDone && floodDone, `seed ${seed}: missing show/end`);
  assert(preChecked >= 4 && postChecked >= 4, `seed ${seed}: missing show guard`);
  assert(now - sim.finalQuietAt >= 9000, `seed ${seed}: final quiet too short ${now} - ${sim.finalQuietAt}`);
  assert(messages.every((item) => item.now <= sim.finalQuietAt), `seed ${seed}: message in final quiet`);
  const interference = messages.filter((item) => item.interference);
  assert.equal(interference.length, 4, `seed ${seed}: expected exactly four interference`);
  assert(interference.every((item) => sim.sceneIds.includes(item.targetScene) &&
    sim.cameras[item.targetCamera]?.sceneId === item.targetScene && item.text.includes(sim.cameras[item.targetCamera].code)),
  `seed ${seed}: invalid scene/CAM`);
  assert(interference.every((item, index) => index === 0 || item.targetScene !== interference[index - 1].targetScene),
    `seed ${seed}: repeated interference scene`);
  for (const item of interference) {
    const before = messages.filter((message) => message.linkedEvent && message.now < item.now).at(-1);
    const after = messages.find((message) => message.linkedEvent && message.now > item.now);
    assert(item.targetCamera !== before?.targetCamera && item.targetCamera !== after?.targetCamera,
      `seed ${seed}: interference adjacent to same real lead`);
  }
  const replay = new sandbox.NightShiftSimulation({ seed });
  assert.deepEqual(JSON.parse(JSON.stringify(replay.interferencePlan)), JSON.parse(JSON.stringify(sim.interferencePlan)),
    `seed ${seed}: interference windows are not deterministic`);
  results.push({ seed, seconds: +(blackout / 1000).toFixed(1), fakeDawn: sim.fakeDawnPlanned,
    selection: interference.map((item) => item.targetScene).join(",") });
}
assert(new Set(results.map((item) => item.selection)).size > 30, "interference does not vary between seeds");
function replayInterference(seed) {
  now = 1000;
  const sent = [];
  const sim = new sandbox.NightShiftSimulation({ seed, callbacks: {
    onMessage: (message) => { if (message.interference) sent.push([now, message.targetScene, message.text]); }
  } });
  sim.start(now);
  for (let frame = 0; frame < 5000 && sent.length < 4; frame++) {
    now += 100;
    sim.step(now);
  }
  assert.equal(sent.length, 4, `seed ${seed}: replay lost an interference`);
  return sent;
}
for (let seed = 1; seed <= 25; seed++) assert.deepEqual(replayInterference(seed), replayInterference(seed),
  `seed ${seed}: interference target or send time was not reproducible`);
console.log(`Major Show / interference: ${results.length} seeds; blackout ${(Math.min(...results.map((item) => item.seconds))).toFixed(1)}–${(Math.max(...results.map((item) => item.seconds))).toFixed(1)}s; four valid interference each.`);
