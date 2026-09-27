import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const real = process.argv.includes("--real");
const normalVirtual = process.argv.includes("--normal-virtual");
const stress = process.argv.includes("--stress");
const normalRate = real || normalVirtual;
const seeds = stress ? Array.from({ length: 100 }, (_, seed) => seed + 1) : normalRate ? [1, 5] : [1, 2, 5, 6, 17];
const results = await Promise.all(seeds.map((seed) => run(seed)));
if (stress) console.log(`100 个 seed 消息节奏通过；误导数量范围 ${Math.min(...results.map((item) => item.interference))}–${Math.max(...results.map((item) => item.interference))}`);
else for (const result of results) console.log(JSON.stringify(result));
assert(results.some((result) => result.fakeDawn) && results.some((result) => !result.fakeDawn), "缺少两种夜班的覆盖");

async function run(seed) {
  let now = 1000;
  let locked = false;
  let lockUntil = 0;
  let cooldownUntil = 0;
  let globalDone = false;
  let paDone = false;
  let handoffQueued = false;
  let dawnStarted = false;
  let dawnCompleted = false;
  let ordinaryDuringShow = 0;
  const messages = [];
  const sandbox = { window: {}, performance: { now: () => now }, console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const file of ["anomalies", "game"]) vm.runInContext(fs.readFileSync(`public/game/js/${file}.js`, "utf8"), sandbox);
  const minuteMs = normalRate ? 470000 / 360 : 75;
  const sim = new sandbox.NightShiftSimulation({ seed, minuteMs, quickMode: !normalRate, callbacks: {
    canSendOrdinaryMessage: () => !locked,
    canSendAnomalyLead: () => !locked,
    canStartFakeDawn: () => !locked && now >= cooldownUntil,
    onFakeDawn: (stage) => {
      if (stage === "pre") { dawnStarted = true; locked = true; }
      if (stage === "done") { dawnCompleted = true; locked = false; cooldownUntil = now + cooldownMs; }
    },
    onMessage: (message, state) => {
      if (locked && (message.id || message.interference || message.sender === "上一任值班员")) ordinaryDuringShow++;
      messages.push({ time: now - 1000, minute: state.minute, id: message.id || null,
        type: message.linkedEvent ? "lead" : message.interference ? "interference" : message.sender === "上一任值班员" ? "handoff" : message.id ? "narrative" : "final",
        event: message.linkedEvent || null, text: message.text });
    },
    onTick: (state) => {
      if (!handoffQueued && state.minute >= 4) {
        handoffQueued = true;
        sim.queueOrdinaryMessage({ sender: "上一任值班员", text: "今晚的值班记录还在桌上。" }, 25, 0);
      }
    }
  } });
  const ratio = minuteMs / (470000 / 360);
  const cooldownMs = normalRate ? 30000 : Math.max(1500, Math.round(30000 * ratio));
  const globalAt = normalRate ? 240000 : Math.round(240000 * ratio);
  const globalDuration = normalRate ? 8000 : Math.max(500, Math.round(8000 * ratio));
  const paDuration = normalRate ? 16000 : Math.max(900, Math.round(16000 * ratio));
  const paMinute = 180 + ((Math.imul(seed ^ 0x50415359, 0x45d9f3b) >>> 0) % 90);
  const events = sim.eventQueue.length;
  sim.setView("monitor");
  sim.start(now);
  const startedAt = real ? performance.now() : 0;
  let frames = 0;
  while (!sim.terminalStage && frames++ < 40000) {
    if (real) {
      await new Promise((resolve) => setTimeout(resolve, 40));
      now = 1000 + performance.now() - startedAt;
    } else now += 50;
    if (locked && lockUntil && now >= lockUntil) {
      locked = false;
      lockUntil = 0;
      cooldownUntil = now + cooldownMs;
    }
    if (!locked && now >= cooldownUntil && !globalDone && now - 1000 >= globalAt) {
      globalDone = true; locked = true; lockUntil = now + globalDuration;
      sim.pauseFor(globalDuration, now);
    } else if (!locked && now >= cooldownUntil && !paDone && sim.minute >= paMinute && sim.minute < 334) {
      paDone = true; locked = true; lockUntil = now + paDuration;
      sim.pauseFor(paDuration, now);
    }
    sim.step(now);
  }
  assert(sim.terminalStage, `seed ${seed} 未抵达最终断流`);
  assert(globalDone && paDone, `seed ${seed} 缺少全局演出或广播`);
  assert(!dawnStarted || dawnCompleted, `seed ${seed} 假天亮未结束`);
  assert.equal(ordinaryDuringShow, 0, `seed ${seed} 演出期间收到普通信息`);
  const narrative = messages.filter((message) => message.type === "narrative");
  assert.deepEqual(narrative.map((message) => message.id), ["welcome", "cam03-off", "looked", "contradiction"]);
  const interference = messages.filter((message) => message.type === "interference");
  assert(interference.length <= 4 && interference.every((message) => message.minute < 240), `seed ${seed} 误导消息过多或过晚`);
  assert(interference.filter((message) => /检测到短时人员活动|有人经过/.test(message.text)).length <= 2 &&
    interference.filter((message) => /无异常|状态正常/.test(message.text)).length <= 2, `seed ${seed} 误导类型失衡`);
  const lead = messages.filter((message) => message.type === "lead");
  for (const event of sim.eventQueue.filter((entry) => entry.hintPriority === "essential")) {
    assert(lead.some((message) => message.event === event.id && message.minute <= event.actualStart), `seed ${seed} 关键提示迟到：${event.id}`);
  }
  const ordinary = messages.filter((message) => ["narrative", "interference", "handoff"].includes(message.type));
  assert(ordinary.every((message, index) => index === 0 || message.time - ordinary[index - 1].time >= sim.phoneSpacingMs - 50), `seed ${seed} 普通信息间隔太短`);
  const max30 = Math.max(...messages.map((message) => messages.filter((item) => item.time >= message.time && item.time < message.time + 30000).length));
  const burstsUnder3s = messages.filter((message, index) => index > 0 && message.time - messages[index - 1].time < 3000).length;
  const shortPairs = messages.flatMap((message, index) => index > 0 && message.time - messages[index - 1].time < 3000
    ? [`${messages[index - 1].type}:${messages[index - 1].event || messages[index - 1].id}→${message.type}:${message.event || message.id}`] : []);
  const elapsed = (now - 1000) / 1000;
  if (real) assert(elapsed >= (sim.fakeDawnPlanned ? 475 : 460) && elapsed <= (sim.fakeDawnPlanned ? 520 : 500), `seed ${seed} 正常速度时长超出范围：${elapsed}`);
  sim.promptTurn();
  sim.chooseTurn(false);
  sim.resolveNoTurn();
  assert(sim.ended, `seed ${seed} 无法完成结算`);
  return { seed, mode: real ? "real-time" : normalVirtual ? "normal-rate-virtual" : "fast-virtual", fakeDawn: sim.fakeDawnPlanned,
    secondsToBlackout: +elapsed.toFixed(1), events, total: messages.length,
    narrative: narrative.length, interference: interference.length, lead: lead.length,
    handoff: messages.filter((message) => message.type === "handoff").length,
    final: messages.filter((message) => message.type === "final").length,
    max30, burstsUnder3s: normalRate ? burstsUnder3s : null, shortPairs: normalRate ? shortPairs : undefined,
    lastInterferenceMinute: interference.at(-1)?.minute ?? null,
    minuteAfter300: messages.filter((message) => message.minute >= 300).map((message) => message.type),
    missed: sim.missed, correct: sim.correct, ended: sim.ended };
}
