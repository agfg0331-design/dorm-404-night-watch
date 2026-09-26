import fs from "node:fs";
import vm from "node:vm";

let now = 0;
const messages = [];
const sandbox = { window: {}, performance: { now: () => now }, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of ["anomalies", "game"]) vm.runInContext(fs.readFileSync(`public/game/js/${file}.js`, "utf8"), sandbox);
const legacyScenes = ["dorm", "hall", "laundry", "stairs", "lobby"];
const sim = new sandbox.NightShiftSimulation({ seed: 12, sceneIds: legacyScenes, callbacks: { onMessage: (message) => messages.push(message) } });
function assert(condition, reason) { if (!condition) throw new Error(reason); }
function advance(minute) { sim.minute = minute; sim.processEvents(); }
sim.setView("phone-messages");
assert(sim.timeScale > 0 && sim.timeScale < 1, "查看手机消息时仍按全速推进");
sim.setView("phone-report");
assert(sim.timeScale > 0 && sim.timeScale < 0.5, "填写上报时没有足够时间");
sim.setView("monitor");

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

const interferenceMessages = [];
const pacingSim = new sandbox.NightShiftSimulation({ seed: 12, sceneIds: legacyScenes, callbacks: { onMessage: (message, state) => interferenceMessages.push({ ...message, minute: state.minute }) } });
for (let minute = 0; minute <= 335; minute++) {
  pacingSim.minute = minute;
  pacingSim.processEvents();
  pacingSim.processInterference();
}
const misleading = interferenceMessages.filter((message) => message.suspicious && !message.linkedEvent);
assert(misleading.filter((message) => message.minute < 120).length === 2, "前期误导信息应保持稀疏");
assert(misleading.filter((message) => message.minute >= 120).length > 2, "中后期误导信息没有逐渐增多");
assert(misleading.every((message) => !message.corrupt), "误导信息被直接标成故障");
assert(misleading.length <= 10, "干扰信息过密");
const earlyEvents = pacingSim.eventQueue.filter((event) => event.actualStart < 120);
assert(earlyEvents.length >= 4 && earlyEvents.every((event) => !event.silent && event.lead.kind === "real" && event.lead.offset <= -4), "前期异常缺少真实提前提示");
const midLateEvents = pacingSim.eventQueue.filter((event) => event.actualStart >= 120);
assert(midLateEvents.some((event) => event.silent), "中后期没有无提示异常");
for (const id of ["duty-self", "hall-shadow", "laundry-reflection", "lobby-clock", "stairs-light"]) {
  const important = pacingSim.eventQueue.find((event) => event.id === id);
  assert(important?.hintPriority === "essential" && !important.silent && important.lead.kind === "real" && important.lead.offset <= -5,
    `${id} 的多段演出缺少指向真实镜头的提前提示`);
  assert(important.lead.text.includes(pacingSim.cameras[important.camera].code), `${id} 的提前提示没有标明实际监控位`);
}
const dutyNotice = new sandbox.NightShiftSimulation({ seed: 12, sceneIds: legacyScenes, callbacks: { onMessage: (message) => messages.push(message) } });
const dutyMoment = dutyNotice.eventQueue.find((event) => event.id === "duty-self");
assert(dutyMoment.lead.text.includes("CAM 04") && !/CAM 0[1-356]/.test(dutyMoment.lead.text), "固定值班室提示的监控编号被随机映射到别处");
dutyNotice.minute = dutyMoment.actualStart + dutyMoment.lead.offset;
dutyNotice.processEvents();
assert(messages.some((message) => message.linkedEvent === "duty-self" && message.text.includes("CAM 04")), "监控室起身人影出现前没有实际送出提示");
const variableHints = new Set();
for (let seed = 0; seed < 120; seed += 1) {
  const run = new sandbox.NightShiftSimulation({ seed, sceneIds: ["music", "dance", "elevator", "lab", "dorm"] });
  const variable = run.eventQueue.find((event) => event.id === "music-stands");
  variableHints.add(variable.silent);
  assert(!run.eventQueue.find((event) => event.id === "duty-self").silent, "监控室起身人影在某局失去提示");
  assert(run.eventQueue.filter((event) => event.actualStart < 120).every((event) => !event.silent), "某局前期出现无提示异常");
}
assert(variableHints.size === 2, "同一个普通异常在不同局没有提示变化");
const earlier = misleading.filter((message) => message.minute < 120).length;
const later = misleading.filter((message) => message.minute >= 120).length;
assert(later > earlier, "中后期错误消息没有增多");
const paused = new sandbox.NightShiftSimulation({ seed: 12, sceneIds: legacyScenes, minuteMs: 100 });
paused.start(1000);
now = 1000;
paused.step(now);
paused.pauseFor(8000, now);
now = 5000;
paused.step(now);
assert(paused.minute === 0 && paused.missed === 0, "全监控演出期间异常计时仍在推进");
now = 9000;
paused.step(now);
assert(paused.minute >= 0 && paused.minute < 3, "全监控演出结束后产生了异常计时跳跃");
const dawnSeeds = Array.from({ length: 1000 }, (_, seed) => new sandbox.NightShiftSimulation({ seed, sceneIds: legacyScenes }).fakeDawnPlanned);
const dawnCount = dawnSeeds.filter(Boolean).length;
assert(dawnCount >= 250 && dawnCount <= 350, `假天亮触发率偏离约30%：${dawnCount}/1000`);
for (let seed = 0; seed < 100; seed += 1) {
  const run = new sandbox.NightShiftSimulation({ seed, sceneIds: legacyScenes, minuteMs: 420000 / 360 });
  const normal = new sandbox.NightShiftSimulation({ seed, sceneIds: legacyScenes, minuteMs: 420000 / 360, quickMode: true });
  assert(run.eventQueue.length === normal.eventQueue.length && run.eventQueue.every((event) => normal.eventQueue.some((other) => other.id === event.id)), "假天亮删掉或替换了原有异常");
  if (run.fakeDawnPlanned) {
    assert(Math.abs(run.minuteMs * 352 + 25000 - 480000) < 1, "假天亮局没有延长到八分钟");
    assert(run.eventQueue.every((event) => event.actualStart >= 325 || event.actualStart + event.duration + event.grace <= 315), "有异常跨过假天亮前后安静窗口");
    run.minute = 309;
    run.processFinalClues();
    assert(run.firedFinalClues.has("final-sound"), "假天亮前仍有终局声音线索撞进静场");
  } else assert(Math.abs(run.minuteMs * 360 - 420000) < 1, "普通局不再是七分钟");
}
const selectedDawnSeed = dawnSeeds.findIndex(Boolean);
let dawnMessages = 0;
const dawnStages = [];
const dawn = new sandbox.NightShiftSimulation({ seed: selectedDawnSeed, sceneIds: legacyScenes, minuteMs: 100, quickMode: true, startMinute: 315.9, callbacks: {
  onMessage: () => { dawnMessages += 1; }, onFakeDawn: (stage) => dawnStages.push(stage)
} });
now = 1000;
dawn.start(now);
dawn.step(now);
now = 1020;
dawn.step(now);
assert(dawn.fakeDawnStage === "pre" && dawn.minute === 316, "05:20前五秒没有进入静场");
const beforeDawn = { missed: dawn.missed, danger: dawn.danger, messages: dawnMessages };
const dawnStart = now;
for (const [delta, stage, progress, minute] of [[4990, "pre", 0, 319.992], [5000, "bright", 0, 320], [8500, "bright", 1, 320], [16000, "bright", 1, 320], [19000, "bright", .25, 320], [20000, "post", 0, 320], [24990, "post", 0, 323.992], [25000, "done", 0, 324]]) {
  now = dawnStart + delta;
  dawn.step(now);
  assert(dawn.fakeDawnStage === stage && Math.abs(dawn.fakeDawnProgress - progress) < .02, `假天亮 ${delta}ms 的阶段或亮度不正确`);
  assert(Math.abs(dawn.minute - minute) < .02 && dawn.missed === beforeDawn.missed && dawn.danger === beforeDawn.danger && dawnMessages === beforeDawn.messages, "假天亮前后计时、异常或消息不正确");
}
assert(dawnStages.join(",") === "pre,bright,post,done", "假天亮阶段顺序不正确");
now = dawnStart + 25100;
dawn.step(now);
assert(dawn.minute > 324, "假天亮结束后计时没有恢复");
let prompts = 0;
let failures = 0;
let calls = 0;
const phoneFinal = new sandbox.NightShiftSimulation({ seed: 12, sceneIds: legacyScenes, callbacks: {
  onMonitorFail: () => { failures += 1; }, onSelfCall: () => { calls += 1; }, onTurnPrompt: () => { prompts += 1; }
} });
phoneFinal.minute = 342;
phoneFinal.processMilestones();
assert(failures === 1 && phoneFinal.monitorFailed && phoneFinal.terminalStage && phoneFinal.timeScale === 0, "终局监控故障后时间没有冻结");
phoneFinal.minute = 359;
phoneFinal.processMilestones();
assert(calls === 0 && prompts === 0, "静音未结束就自动来电或跳到结局选择");
phoneFinal.beginFinalCall();
phoneFinal.beginFinalCall();
assert(calls === 1, "静音结束后的来电没有触发或重复触发");
phoneFinal.promptTurn();
assert(prompts === 1 && phoneFinal.finalStage && phoneFinal.minute === 360 && phoneFinal.timeScale === 0, "接听结尾电话后未进入唯一的最终选择");
console.log("夜班流程自检通过：误报持续、改报解除、漏报保留与补报、中期有限干扰。");
