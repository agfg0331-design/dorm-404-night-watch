import fs from "node:fs";
import vm from "node:vm";

let now = 0;
const sandbox = { window: {}, performance: { now: () => now }, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const name of ["anomalies", "game"]) {
  vm.runInContext(fs.readFileSync(`public/game/js/${name}.js`, "utf8"), sandbox);
}
const { scenePool, createShift } = sandbox.GameContent;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const names = Object.values(scenePool).map((scene) => scene.name);
const combinations = new Set();
const seenScenes = new Set();

for (let seed = 0; seed < 120; seed += 1) {
  const shift = createShift(seed);
  const sameSeed = createShift(seed);
  const selected = new Set(shift.sceneIds);
  shift.sceneIds.forEach((id) => seenScenes.add(id));
  combinations.add(shift.sceneIds.join("/"));
  assert(JSON.stringify(shift.sceneIds) === JSON.stringify(sameSeed.sceneIds), "同一随机种子抽取结果改变");
  assert(selected.size === 5 && Object.keys(shift.cameras).length === 6, "没有抽到五个不重复场景");
  assert(shift.cameras.cam04.name === "值班室" && shift.cameras.cam04.sceneId === "duty", "值班室不是固定 CAM 04");
  const availableCodes = new Set(Object.values(shift.cameras).map((camera) => camera.code));
  for (const scene of Object.values(shift.cameras)) {
    assert(fs.existsSync(`public/game/${scene.image}`), `场景正常图缺失：${scene.image}`);
  }
  for (const event of shift.events) {
    const scene = shift.cameras[event.camera];
    assert(scene && scene.sceneId === event.sceneId, `异常刷在错误场景：${event.id}`);
    assert(event.category && event.lead.text && event.reportLocation === (scene.reportLocation || scene.name), `上报地点或手机线索缺失：${event.id}`);
    for (const [, code] of event.lead.text.matchAll(/(CAM 0[1-6])/g)) assert(availableCodes.has(code), `短信引用不存在的监控：${event.id}`);
    for (const source of event.frames || []) assert(fs.existsSync(`public/game/${source}`), `异常素材缺失：${source}`);
  }
  const messages = [];
  const sim = new sandbox.NightShiftSimulation({ seed, shift, callbacks: { onMessage: (message) => messages.push(message.text) } });
  for (let minute = 0; minute <= 338; minute += 1) {
    sim.minute = minute;
    sim.processEvents();
    sim.processNarrative();
    sim.processInterference();
  }
  for (const message of messages) {
    for (const name of names) {
      if (name === "四楼走廊" && message.includes("走廊")) continue;
      if (!selected.has(Object.values(scenePool).find((scene) => scene.name === name)?.id)) {
        assert(!message.includes(name), `短信引用本局未抽中场景 ${name}：${message}`);
      }
    }
  }
}
assert(combinations.size > 20, "多局开局没有变化");
assert(seenScenes.size === Object.keys(scenePool).length, "有场景永远不会被抽到");

const shift = createShift(404, ["music", "dance", "elevator", "lab", "dorm"]);
assert(shift.events.filter((event) => event.sceneId !== "duty").length === 16, "新场景的异常没有完整进入各自池");
const sim = new sandbox.NightShiftSimulation({ seed: 404, shift });
const event = sim.eventQueue.find((item) => item.id === "dance-figure");
sim.minute = event.actualStart + 1;
sim.processEvents();
assert(sim.activeEvents.includes(event), "新场景异常没有出现");
assert(!sim.report(event.camera, "灯光异常").ok && sim.activeEvents.includes(event) && !event.resolvingUntil, "误报错误地解除异常");
sim.setCamera(event.camera);
assert(sim.report(event.camera, event.category).ok && sim.correct === 1, "新场景正确上报失败");
now += 5000;
sim.processEvents();
assert(!sim.getVisibleEvent(), "新场景异常正确上报后未解除");

console.log(`场景池自检通过：${combinations.size} 种组合，CAM 04 固定，素材/消息/上报联动有效。`);
