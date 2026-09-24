import fs from "node:fs";
import vm from "node:vm";

let now = 0;
const messages = [];
const sandbox = { window: {}, performance: { now: () => now }, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of ["anomalies", "game"]) vm.runInContext(fs.readFileSync(`public/game/js/${file}.js`, "utf8"), sandbox);
const sim = new sandbox.NightShiftSimulation({ seed: 12, callbacks: { onMessage: (message) => messages.push(message) } });
function assert(condition, reason) { if (!condition) throw new Error(reason); }
function advance(minute) { sim.minute = minute; sim.processEvents(); }

advance(sim.eventQueue.find((event) => event.id === "hall-light").actualStart + 1);
const first = sim.activeEvents[0];
assert(first?.id === "hall-light", "首个异常未出现");
sim.setCamera(first.camera);
assert(!sim.report(first.camera, "人物异常").ok && sim.wrong === 1, "错误上报未计数");
assert(sim.getVisibleEvent() === first && !first.resolvingUntil, "错误上报让异常消失");
assert(sim.report(first.camera, first.category).ok && sim.correct === 1, "报错后无法改报正确");
assert(sim.getVisibleEvent() === first, "正确上报瞬间消失");
now += 5000;
advance(32);
assert(!sim.getVisibleEvent(), "正确上报未在延时后解除");

advance(sim.eventQueue.find((event) => event.id === "laundry-drip").actualStart + 1);
const second = sim.activeEvents.find((event) => event.id === "laundry-drip");
assert(second, "第二个异常未出现");
sim.setCamera(second.camera);
advance(second.actualStart + second.duration + second.grace + 1);
assert(second.state === "missed" && sim.missed === 1 && sim.activeEvents.includes(second), "漏报后异常不再可见");
advance(second.actualStart + second.duration + second.grace + 15);
assert(sim.missed === 1, "同一异常重复计为漏报");
assert(sim.report(second.camera, second.category).ok, "漏报后无法补报");

const oldLobby = sim.eventQueue.find((event) => event.id === "lobby-door");
const doubleLobby = sim.eventQueue.find((event) => event.id === "lobby-double");
sim.activeEvents.push(oldLobby, doubleLobby);
oldLobby.state = "missed";
doubleLobby.state = "changing";
sim.setCamera("cam06");
assert(sim.getVisibleEvent() === doubleLobby, "旧漏报挡住同监控的新异常");

const oldDuty = sim.eventQueue.find((event) => event.id === "duty-self");
const newDuty = sim.eventQueue.find((event) => event.id === "duty-extra");
oldDuty.state = "missed";
newDuty.state = "changing";
sim.activeEvents.push(oldDuty, newDuty);
sim.setCamera("cam04");
assert(sim.getVisibleEvent() === newDuty, "值班室新异常未显示");
assert(sim.report("cam04", "人物异常").event === newDuty, "同类旧异常抢走当前画面的上报");
assert(!oldDuty.resolvingUntil, "当前异常上报却解除旧漏报");
sim.finalCameraCue = { mode: "desk-empty", status: "CAM 04 / FRAME HOLD 03:17" };
sim.activeEvents = sim.activeEvents.filter((event) => event !== newDuty);
assert(!sim.getVisibleEvent(), "旧漏报遮住终局 CAM 04 摄像头线索");
assert(sim.activeEvents.includes(oldDuty), "终局线索不应删除旧漏报的补报资格");

for (let minute = 0; minute <= 335; minute++) { sim.minute = minute; sim.processInterference(); }
assert(messages.filter((message) => message.suspicious).length >= 2, "中期干扰信息不足");
assert(messages.filter((message) => message.suspicious).every((message) => !message.corrupt), "误导信息被直接标成故障");
assert(messages.filter((message) => message.suspicious).length <= 5, "干扰信息过密");
console.log("夜班流程自检通过：误报持续、改报解除、漏报保留与补报、中期有限干扰。");
