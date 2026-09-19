import fs from "node:fs";
import vm from "node:vm";

const sandbox = { window: {}, performance: { now: () => 0 }, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("public/game/js/anomalies.js", "utf8"), sandbox);
vm.runInContext(fs.readFileSync("public/game/js/game.js", "utf8"), sandbox);

function outcome(seed, turn, goodPerformance = true) {
  let ending = null;
  const simulation = new sandbox.NightShiftSimulation({
    seed,
    callbacks: { onEnding: (kind) => { ending = kind; } }
  });
  Object.assign(simulation, goodPerformance
    ? { correct: 10, missed: 2, danger: 30, trust: 60 }
    : { correct: 3, missed: 10, danger: 82, trust: 18 });
  simulation.finalStage = true;
  simulation.minute = 360;
  simulation.chooseTurn(turn);
  if (turn) simulation.resolveTurn();
  else simulation.resolveNoTurn();
  return ending;
}

function collectClues(seed) {
  const clues = [];
  const simulation = new sandbox.NightShiftSimulation({
    seed,
    callbacks: { onFinalClue: (clue) => clues.push(clue) }
  });
  for (let minute = 240; minute <= 345; minute += 1) {
    simulation.minute = minute;
    simulation.processFinalClues();
  }
  return { clues, snapshot: simulation.snapshot() };
}

const turnSeeds = [1, 2, 4];
const staySeeds = [3, 6, 7];

for (const seed of turnSeeds) {
  if (outcome(seed, true) !== "handoff") throw new Error(`seed ${seed} 回头正确时未进入 handoff`);
  if (outcome(seed, false) !== "watched") throw new Error(`seed ${seed} 不回头错误时未进入 watched`);
  if (outcome(seed, true, false) !== "watched") throw new Error(`seed ${seed} 表现差仍凭最终选择获得好结局`);
}

for (const seed of staySeeds) {
  if (outcome(seed, false) !== "dawn") throw new Error(`seed ${seed} 继续看屏幕正确时未进入 dawn`);
  if (outcome(seed, true) !== "watched") throw new Error(`seed ${seed} 回头错误时未进入 watched`);
  if (outcome(seed, false, false) !== "watched") throw new Error(`seed ${seed} 表现差仍凭最终选择获得好结局`);
}

for (const seed of [...turnSeeds, ...staySeeds]) {
  const first = collectClues(seed);
  const repeated = collectClues(seed);
  if (JSON.stringify(first.clues) !== JSON.stringify(repeated.clues)) throw new Error(`seed ${seed} 重开后线索不稳定`);
  if (Object.hasOwn(first.snapshot, "safeFinalChoice")) throw new Error("正确答案被暴露在公开快照中");
  const evidence = first.clues.filter((clue) => clue.role === "evidence");
  const interference = first.clues.filter((clue) => clue.role === "interference");
  const channels = new Set(evidence.map((clue) => clue.channel));
  if (evidence.length !== 3 || interference.length !== 1) throw new Error(`seed ${seed} 的真/误导线索数量不正确`);
  if (!["camera", "phone", "sound"].every((channel) => channels.has(channel))) throw new Error(`seed ${seed} 的线索渠道不足三种`);
  if (first.clues.some((clue) => clue.at < 240 || clue.at > 345)) throw new Error(`seed ${seed} 有线索超出04:00—05:45`);
  const cameraCue = evidence.find((clue) => clue.channel === "camera")?.cue;
  const phoneText = evidence.find((clue) => clue.channel === "phone")?.message?.text || "";
  if (turnSeeds.includes(seed)) {
    if (cameraCue?.mode !== "desk-empty" || !/(CAM 04|空椅|听见)/.test(phoneText)) throw new Error(`seed ${seed} 的TURN线索相互矛盾`);
  } else if (cameraCue?.mode !== "desk-synced" || !/(六点|06:10|敲门)/.test(phoneText)) {
    throw new Error(`seed ${seed} 的STAY线索相互矛盾`);
  }
}

if (outcome(turnSeeds[0], true) === outcome(staySeeds[0], true)) throw new Error("不同seed没有产生不同最终答案");

console.log(`最终选择自检通过：TURN seeds ${turnSeeds.join(", ")}；STAY seeds ${staySeeds.join(", ")}；同seed线索稳定。`);
