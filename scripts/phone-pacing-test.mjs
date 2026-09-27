import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const real = process.argv.includes("--real");
const normalVirtual = process.argv.includes("--normal-virtual");
const stress = process.argv.includes("--stress");
const normalRate = real || normalVirtual || stress;
const seeds = stress ? Array.from({ length: 100 }, (_, seed) => seed + 1) : normalRate ? [1, 5] : [1, 2, 5, 6, 17];
const results = await Promise.all(seeds.map((seed) => run(seed)));
if (stress) console.log(JSON.stringify({ seeds: results.length, interferenceRange: [Math.min(...results.map((item) => item.interference)), Math.max(...results.map((item) => item.interference))],
  shortestIntervalSeconds: Math.min(...results.map((item) => item.shortestIntervalSeconds)),
  subsecondPairs: results.reduce((sum, item) => sum + item.subsecondPairs, 0),
  leadCollisions: results.reduce((sum, item) => sum + item.leadCollisions, 0),
  essentialOnTime: results.every((item) => item.essentialOnTime),
  midDensity: +average(results.map((item) => item.midDensity)).toFixed(2),
  lateDensity: +average(results.map((item) => item.lateDensity)).toFixed(2),
  shortestExamples: results.filter((item) => item.shortestIntervalSeconds < 3).map(({ seed, shortestIntervalSeconds, shortPairs }) => ({ seed, shortestIntervalSeconds, shortPairs })) }));
else for (const result of results) console.log(JSON.stringify(result));
assert(results.some((result) => result.fakeDawn) && results.some((result) => !result.fakeDawn), "缺少两种夜班的覆盖");
function average(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }

async function run(seed) {
  let now = 1000;
  let locked = false;
  let lockUntil = 0;
  let cooldownUntil = 0;
  let ordinaryResumeAt = 0;
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
    canSendOrdinaryMessage: () => !locked && now >= ordinaryResumeAt,
    canSendAnomalyLead: () => !locked,
    canStartFakeDawn: () => !locked && now >= cooldownUntil,
    onFakeDawn: (stage) => {
      if (stage === "pre") { dawnStarted = true; locked = true; }
      if (stage === "done") { dawnCompleted = true; locked = false; cooldownUntil = now + cooldownMs; ordinaryResumeAt = now + sim.scaleMessageDelay(3000); }
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
      ordinaryResumeAt = now + sim.scaleMessageDelay(3000);
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
  assert(messages.filter((message) => message.minute >= 300).every((message) => ["lead", "final"].includes(message.type) || message.id === "contradiction"), `seed ${seed} 05:00 后出现普通信息`);
  assert(interference.filter((message) => /检测到短时人员活动|有人经过/.test(message.text)).length <= 2 &&
    interference.filter((message) => /无异常|状态正常/.test(message.text)).length <= 2, `seed ${seed} 误导类型失衡`);
  const lead = messages.filter((message) => message.type === "lead");
  for (const event of sim.eventQueue.filter((entry) => entry.hintPriority === "essential")) {
    assert(lead.some((message) => message.event === event.id && message.minute <= event.actualStart), `seed ${seed} 关键提示迟到：${event.id}`);
  }
  const featuredDelays = lead.flatMap((message) => {
    const event = sim.eventQueue.find((entry) => entry.id === message.event);
    return event.hintPriority === "featured" ? [(message.minute - event.actualStart - event.lead.offset) * sim.minuteMs] : [];
  });
  assert(featuredDelays.every((delay) => delay <= sim.scaleMessageDelay(3000) + 100), `seed ${seed} featured 提示排队过久：${featuredDelays}`);
  const ordinary = messages.filter((message) => ["narrative", "interference", "handoff"].includes(message.type));
  assert(ordinary.every((message, index) => index === 0 || message.time - ordinary[index - 1].time >= sim.scaleMessageDelay(4900) - 50), `seed ${seed} 普通信息间隔太短`);
  const intervals = messages.slice(1).map((message, index) => ({ gap: message.time - messages[index].time, previous: messages[index], current: message }));
  const subsecondPairs = intervals.filter(({ gap }) => gap < sim.scaleMessageDelay(1000) - 50).length;
  const leadCollisions = intervals.filter(({ gap, previous, current }) => previous.type === "lead" && current.type === "lead" && gap < sim.scaleMessageDelay(1000) - 50).length;
  assert.equal(subsecondPairs, 0, `seed ${seed} 仍有一秒内连响：${JSON.stringify(intervals.filter(({ gap }) => gap < sim.scaleMessageDelay(1000) - 50))}`);
  const finalPhone = messages.find((message) => message.type === "final" && message.minute >= 286 && message.minute < 297);
  const looked = narrative.find((message) => message.id === "looked");
  const contradiction = narrative.find((message) => message.id === "contradiction");
  assert(finalPhone && looked && finalPhone.time - looked.time >= sim.scaleMessageDelay(10000), `seed ${seed} looked 与最终线索撞车`);
  assert(contradiction && contradiction.time - finalPhone.time >= sim.scaleMessageDelay(9000), `seed ${seed} contradiction 与最终线索撞车`);
  const max30 = Math.max(...messages.map((message) => messages.filter((item) => item.time >= message.time && item.time < message.time + 30000).length));
  const burstsUnder3s = messages.filter((message, index) => index > 0 && message.time - messages[index - 1].time < sim.scaleMessageDelay(3000)).length;
  const shortPairs = messages.flatMap((message, index) => index > 0 && message.time - messages[index - 1].time < sim.scaleMessageDelay(3000)
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
    shortestIntervalSeconds: +(Math.min(...intervals.map(({ gap }) => gap)) / 1000).toFixed(2), subsecondPairs, leadCollisions, essentialOnTime: true,
    maxFeaturedDelaySeconds: +(Math.max(0, ...featuredDelays) / 1000).toFixed(2),
    midDensity: messages.filter((message) => message.minute >= 100 && message.minute < 250).length,
    lateDensity: messages.filter((message) => message.minute >= 250 && message.minute < 342).length,
    lastInterferenceMinute: interference.at(-1)?.minute ?? null,
    minuteAfter300: messages.filter((message) => message.minute >= 300).map((message) => message.type),
    missed: sim.missed, correct: sim.correct, ended: sim.ended };
}
