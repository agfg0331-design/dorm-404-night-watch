import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

let now = 1000;
const sandbox = { window: {}, performance: { now: () => now }, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const name of ["anomalies", "game"]) {
  vm.runInContext(fs.readFileSync(`public/game/js/${name}.js`, "utf8"), sandbox);
}

const { scenePool, events, createShift } = sandbox.GameContent;
const choices = [
  ...Object.values(scenePool).flatMap((scene) => scene.anomalies),
  ...events.filter((event) => event.camera === "cam04")
];
assert.equal(new Set(choices.map((event) => event.id)).size, choices.length, "测试菜单有重复的异常 ID");

for (const choice of choices) {
  const sceneId = choice.sceneId || "duty";
  const forcedScenes = sceneId === "duty" ? null
    : [sceneId, ...Object.keys(scenePool).filter((id) => id !== sceneId).slice(0, 4)];
  const shift = createShift(131500, forcedScenes);
  const sim = new sandbox.NightShiftSimulation({ seed: 131500, shift, minuteMs: 700, quickMode: true });
  const focused = sim.eventQueue.find((event) => event.id === choice.id);
  assert.ok(focused, `单项测试未加载异常：${choice.id}`);
  assert.equal(shift.cameras[focused.camera].sceneId, sceneId, `异常定位到错误监控：${choice.id}`);

  sim.eventQueue = [focused];
  shift.narrative = [];
  sim.interferencePlan = [];
  sim.firedFinalClues = new Set(["final-camera", "final-phone", "final-sound", "final-misdirect"]);
  focused.actualStart = 5;
  sim.setCamera(focused.camera);
  sim.setView("monitor");
  sim.start(now);
  for (let step = 0; step < 50; step += 1) {
    now += 200;
    sim.step(now);
  }
  assert.equal(sim.activeEvents.length, 1, `单项测试没有启动唯一异常：${choice.id}`);
  assert.equal(sim.activeEvents[0].id, choice.id, `单项测试混入其他异常：${choice.id}`);
  assert.ok(focused.progress > 0, `异常播放没有推进：${choice.id}`);
}

console.log(`内部测试选择自检通过：${choices.length} 个异常均能定位监控并独立开始。`);
