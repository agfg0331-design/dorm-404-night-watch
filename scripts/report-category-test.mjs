import fs from "node:fs";
import vm from "node:vm";

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const categories = ["人物异常", "物品变化", "门窗 / 通道", "灯光 / 设备", "环境 / 空间", "监控 / 信号"];
const known = new Set(categories);
const html = fs.readFileSync("public/game/index.html", "utf8");
const css = fs.readFileSync("public/game/style.css", "utf8");
const options = [...html.matchAll(/<input[^>]*name="category"[^>]*value="([^"]+)"/g)].map((match) => match[1]);
assert(JSON.stringify(options) === JSON.stringify(categories), "上报界面的六项分类或顺序有误");
assert(html.includes("按你看到的现象选择，不必判断异常原因。"), "缺少按可见现象分类的提示");
assert(!html.includes("其他 / 无法判断") && !css.includes("category-other"), "旧兜底分类仍在界面中");
assert(!html.includes("late-category") && !css.includes("late-category"), "监控 / 信号仍有阶段限制");

const sandbox = { window: {}, performance: { now: () => 1000 }, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const name of ["anomalies", "game"]) vm.runInContext(fs.readFileSync(`public/game/js/${name}.js`, "utf8"), sandbox);
const { scenePool, createShift } = sandbox.GameContent;
const allEvents = [...sandbox.GameContent.events.filter((event) => event.camera === "cam04"), ...Object.values(scenePool).flatMap((scene) => scene.anomalies)];
assert(allEvents.length === 32 && new Set(allEvents.map((event) => event.id)).size === 32, "异常清单不完整，请重新核对分类");
for (const event of allEvents) {
  assert(known.has(event.category), `异常 ${event.id} 的主分类不在上报选项中`);
  for (const accepted of event.acceptedCategories || []) {
    assert(known.has(accepted) && accepted !== event.category, `异常 ${event.id} 的兼容分类无效或重复`);
  }
}

// Put events on a shuffled CAM to verify report resolution still uses the current camera mapping.
const shift = createShift(404, ["music", "dance", "hall", "lab", "dorm"]);
const report = (eventId, category, cameraOverride) => {
  const sim = new sandbox.NightShiftSimulation({ seed: 404, shift });
  const event = sim.eventQueue.find((item) => item.id === eventId);
  assert(event, `找不到测试异常 ${eventId}`);
  sim.activeEvents = [event];
  const result = sim.report(cameraOverride || event.camera, category);
  assert(result.message === "报告已提交", "上报泄露了即时对错反馈");
  return { sim, event, result };
};
assert(shift.events.find((event) => event.id === "hall-door").camera === "cam03", "随机 CAM 映射未按预期生效");
assert(report("dorm-chair", "物品变化").result.ok, "单答案异常的主分类未被接受");
assert(!report("dorm-chair", "人物异常").result.ok, "单答案异常误接受人物分类");
for (const category of ["门窗 / 通道", "环境 / 空间"]) {
  const { sim, event, result } = report("hall-door", category);
  assert(result.ok && result.event === event && sim.correct === 1 && event.resolvingUntil, `房门异常未接受 ${category}`);
}
assert(!report("hall-door", "人物异常").result.ok, "房门异常误接受人物分类");
assert(!report("hall-door", "门窗 / 通道", "cam02").result.ok, "上报错误 CAM 仍被接受");
for (const category of ["环境 / 空间", "人物异常"]) assert(report("dance-desync", category).result.ok, `镜像异常未接受 ${category}`);
for (const category of ["监控 / 信号", "灯光 / 设备"]) assert(report("lab-feed", category).result.ok, `画面串台未接受 ${category}`);
assert(report("lab-static", "监控 / 信号").result.ok, "监控分类无法上报");
assert(!report("dorm-chair").result.ok, "兜底分类错误地接受了已知异常");
for (const category of categories) report("dorm-chair", category);

// Reversed active-event search remains in place when the same camera/category has two anomalies.
const sim = new sandbox.NightShiftSimulation({ seed: 404, shift });
const first = sim.eventQueue.find((event) => event.id === "hall-shadow");
const second = sim.eventQueue.find((event) => event.id === "hall-shadow-near");
sim.activeEvents = [first, second];
assert(sim.report("cam03", "人物异常").event === second, "同摄像头同分类未优先命中最新异常");
assert(sim.report("cam03", "人物异常").event === first, "处理中的异常被重复上报");

console.log(`上报分类自检通过：${allEvents.length} 个异常，六个 UI 选项，单/多答案与随机 CAM 判定正常。`);
