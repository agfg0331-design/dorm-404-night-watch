import fs from "node:fs";
import vm from "node:vm";

const gameRoot = "public/game";
const html = fs.readFileSync(`${gameRoot}/index.html`, "utf8");
const main = fs.readFileSync(`${gameRoot}/js/main.js`, "utf8");
const phoneSource = fs.readFileSync(`${gameRoot}/js/phone.js`, "utf8");
const handoffSource = fs.readFileSync(`${gameRoot}/js/handoff.js`, "utf8");
const simulationSource = fs.readFileSync(`${gameRoot}/js/game.js`, "utf8");
const css = fs.readFileSync(`${gameRoot}/style.css`, "utf8");
const anomalies = fs.readFileSync(`${gameRoot}/js/anomalies.js`, "utf8");
const audio = fs.readFileSync(`${gameRoot}/js/audio.js`, "utf8");
const headers = fs.readFileSync(`${gameRoot}/_headers`, "utf8");
const localRefs = [
  ...[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]),
  ...[...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((match) => match[1]),
  ...[...anomalies.matchAll(/"(assets\/[^"']+)"/g)].map((match) => match[1]),
  ...[...audio.matchAll(/"(assets\/audio\/[^"']+)"/g)].map((match) => match[1])
].map((value) => value.split("?")[0]).filter((value) => !value.startsWith("data:") && !value.startsWith("http") && !value.startsWith("#") && !value.startsWith("%23"));
const missingFiles = localRefs.filter((value) => !fs.existsSync(`${gameRoot}/${value}`));
if (missingFiles.length) throw new Error(`缺少本地资源：${missingFiles.join(", ")}`);

for (const file of fs.readdirSync(`${gameRoot}/js`).filter((name) => name.endsWith(".js"))) {
  new vm.Script(fs.readFileSync(`${gameRoot}/js/${file}`, "utf8"), { filename: file });
}

const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
const references = [...main.matchAll(/\$\("([^"]+)"\)/g)].map((match) => match[1]);
const missing = references.filter((id) => !ids.has(id));
if (missing.length) throw new Error(`缺少 DOM 节点：${missing.join(", ")}`);

for (const requiredId of ["phoneHome", "settingsOverlay", "masterVolume", "bgmVolume", "sfxVolume", "brightness", "cameraSwitchMask", "phoneCorruption", "phoneRedFlood", "phoneGhostWarning"]) {
  if (!ids.has(requiredId)) throw new Error(`缺少新交互节点：${requiredId}`);
}
for (const requiredId of ["handoffForm", "handoffContent", "handoffCounter", "handoffNote"]) {
  if (!ids.has(requiredId)) throw new Error(`缺少交班留言节点：${requiredId}`);
}
for (const requiredId of ["openGuestbook", "guestbookOverlay", "guestbookList", "guestbookForm", "guestbookHome"]) {
  if (!ids.has(requiredId)) throw new Error(`缺少访客留言节点：${requiredId}`);
}
const guestbook = fs.readFileSync(`${gameRoot}/js/guestbook.js`, "utf8");
for (const feature of ["/api/board", "data-vote", "latest", "hot", "textContent"]) {
  if (!guestbook.includes(feature)) throw new Error(`留言板功能缺失：${feature}`);
}
if (!fs.existsSync("drizzle/0000_serious_frog_thor.sql")) throw new Error("留言数据库迁移缺失");
if (!fs.existsSync("app/api/board/route.ts") || !fs.existsSync("app/api/board/[id]/vote/route.ts")) throw new Error("留言接口缺失");
const boardRoute = fs.readFileSync("app/api/board/route.ts", "utf8");
if (!/\bmessages, votes, and, desc\b/.test(boardRoute)) throw new Error("留言接口缺少 and 查询条件导入");
if (!boardRoute.includes("boardOptions") || !fs.readFileSync("app/api/board/shared.ts", "utf8").includes("Access-Control-Allow-Origin")) throw new Error("留言接口缺少 EdgeOne 跨站兼容");
if (!fs.readFileSync("public/game/js/guestbook.js", "utf8").includes(".edgeone.dev")) throw new Error("EdgeOne 留言板没有连接共享接口");
if (!html.includes("js/guestbook.js?v=d1-20260918")) throw new Error("Cloudflare 留言板脚本缺少缓存版本标识");
for (const path of ["functions/api/board.js", "functions/api/board/[id]/vote.js", "d1/schema.sql"]) {
  if (!fs.existsSync(path)) throw new Error(`Cloudflare 留言后端缺失：${path}`);
}
if (!fs.existsSync("functions/api/handoff.js")) throw new Error("交班留言接口缺失");
const cloudflareBoard = fs.readFileSync("functions/api/board.js", "utf8");
const cloudflareVote = fs.readFileSync("functions/api/board/[id]/vote.js", "utf8");
const d1Schema = fs.readFileSync("d1/schema.sql", "utf8");
for (const feature of ["env.DB", "onRequestGet", "onRequestPost", "ensureSchema", "visitorHash", "latest", "hot"]) {
  if (!cloudflareBoard.includes(feature)) throw new Error(`Cloudflare 留言接口能力缺失：${feature}`);
}
for (const feature of ["onRequestPost", "ON CONFLICT(message_id, voter_hash)", "likes", "dislikes"]) {
  if (!cloudflareVote.includes(feature)) throw new Error(`Cloudflare 投票接口能力缺失：${feature}`);
}
for (const table of ["guestbook_messages", "guestbook_votes"]) {
  if (!d1Schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) throw new Error(`D1 表结构缺失：${table}`);
}
if (!d1Schema.includes("CREATE TABLE IF NOT EXISTS handoff_messages")) throw new Error("交班留言 D1 表结构缺失");
for (const feature of ["/api/handoff", "X-Board-Visitor", "getRandom", "submit"]) {
  if (!handoffSource.includes(feature)) throw new Error(`交班留言前端能力缺失：${feature}`);
}
for (const feature of ['sender: "上一任值班员"', "handoffDeliveryMinute", "state.minute > 15", "submitHandoff", "留言已留在值班室。"] ) {
  if (!main.includes(feature)) throw new Error(`交班留言游戏流程缺失：${feature}`);
}
const roomSection = html.match(/<section class="view room-view[\s\S]*?<\/section>/)?.[0] || "";
const startSection = html.match(/<section class="overlay start-overlay[\s\S]*?<\/section>/)?.[0] || "";
if (!roomSection.includes('id="openGuestbook"') || startSection.includes('id="openGuestbook"')) throw new Error("留言板入口没有放在值班室右侧手机上");
if (html.includes('id="leaveMonitor"') || html.includes("退出监控")) throw new Error("监控界面仍保留退出监控入口");
for (const promptElement of ['id="audioCheckOverlay"', 'id="confirmHeadphones"', 'id="skipHeadphones"', "建议佩戴耳机"]) {
  if (!html.includes(promptElement)) throw new Error(`耳机提示界面缺失：${promptElement}`);
}
if (!main.includes("function finishAudioCheck") || !main.includes('audioCheckOverlay.classList.remove("hidden", "closing")')) throw new Error("耳机提示交互流程缺失");
if (!main.includes("async function beginShift") || !main.includes("sim.start(performance.now())")) throw new Error("点击监控正式开始值班的流程缺失");
const startBody = main.match(/async function startGame\(\)[\s\S]*?\n  }/)?.[0] || "";
if (startBody.includes("sim.start(")) throw new Error("点击开始值班后计时仍提前启动");
for (const anomalyLayer of ["rising-water", "machine-drum", "air-draft", "space-echo", "event-flash"]) {
  if (!html.includes(`class="${anomalyLayer}"`)) throw new Error(`缺少异常表现层：${anomalyLayer}`);
}
for (const source of [...new Set(localRefs.filter((value) => value.endsWith(".webp")))]) {
  const bytes = fs.statSync(`${gameRoot}/${source}`).size;
  if (bytes > 200_000) throw new Error(`优化后的画面过大：${source} (${bytes} bytes)`);
}
if (!css.includes("phoneLift") || !css.includes("phoneLower")) throw new Error("手机拿起/放回动画缺失");
if (!css.includes("skewX(1.85deg)")) throw new Error("手机屏幕透视贴合缺失");
for (const retiredPhoneEffect of ["filter:blur(8px) brightness(.48)", "filter:blur(7px) brightness(.42)", "backdrop-filter:blur(1.5px)"]) {
  if (css.includes(retiredPhoneEffect)) throw new Error(`手机动画仍包含高开销逐帧滤镜：${retiredPhoneEffect}`);
}
if (main.includes("void els.phoneView.offsetWidth")) throw new Error("手机动画仍通过强制同步布局重启");
if (!main.includes('if (state.view === "monitor") renderCamera()')) throw new Error("手机动画期间仍在更新隐藏监控图层");
if (!main.includes("1000 / 30") || !main.includes("renderedFrameEventKey")) throw new Error("主循环或事件图层仍缺少性能限流");
if (!main.includes("phoneTransitionTimer") || !main.includes('classList.contains("lowering")')) throw new Error("手机动画仍可能吞掉返回输入或发生计时器竞争");
if (css.includes(".camera-dock{position:absolute;z-index:10;left:50%;bottom:1.25rem;transform:translateX(-50%);display:flex;gap:.35rem;padding:.45rem;background:rgba(2,7,6,.78);border:1px solid var(--line);backdrop-filter")) throw new Error("监控底栏仍在使用实时背景模糊");
if (!css.includes("body.custom-brightness .game")) throw new Error("默认亮度仍可能对整个游戏施加滤镜");
for (const versionedAsset of ["style.css?v=mirror-20260924", "js/audio.js?v=anomaly-20260919", "js/phone.js?v=neutral-status-20260918", "js/handoff.js?v=handoff-20260919", "js/anomalies.js?v=anomaly-20260919", "js/game.js?v=review-20260924", "js/main.js?v=review-20260924"]) {
  if (!html.includes(versionedAsset)) throw new Error(`核心资源缺少缓存版本标识：${versionedAsset}`);
}
const coreEventCount = [...anomalies.matchAll(/\{ id: "[^"]+", start:/g)].length;
if (coreEventCount !== 20) throw new Error(`正式异常数量应保持20，当前为${coreEventCount}`);
for (const layer of ["stairs-darkness", "duty-gaze", "mirror-figure", "lobby-twins", "footprint-trail"]) {
  if (!html.includes(`class="${layer}`)) throw new Error(`缺少安静恐怖表现层：${layer}`);
}
for (const mapping of ['id: "stairs-light"[\\s\\S]*?visual: "stairs-darkness"', 'id: "laundry-reflection"[\\s\\S]*?visual: "mirror-reflection"', 'id: "lobby-footprints"[\\s\\S]*?visual: "wet-footprints"']) {
  if (!(new RegExp(mapping)).test(anomalies)) throw new Error(`异常视觉映射缺失：${mapping}`);
}
const footprintsDefinition = anomalies.match(/\{ id: "lobby-footprints"[^\n]+/)?.[0] || "";
if (footprintsDefinition.includes("frames:")) throw new Error("大厅湿脚印仍会整帧替换画面");
if ((css.match(/\.footprint-trail i:nth-child\(/g) || []).length !== 10) throw new Error("湿脚印没有按10个独立脚印推进");
if (!css.includes("@keyframes twinEcho") || !css.includes("animation-delay:.72s")) throw new Error("大厅双人缺少延迟同步动作");
if (css.includes("event-lobby-double .extra-shadow") || css.includes("event-self-turn .extra-shadow")) throw new Error("专属人物异常仍被通用 extra-shadow 规则覆盖");
if (!/id: "lobby-double", start: 334[\s\S]*?duration: 8/.test(anomalies)) throw new Error("大厅双人必须在05:42断流前完成演出");
for (const quietVisual of ["stairs-darkness", "self-turn", "mirror-reflection", "wet-footprints", "lobby-double"]) {
  if (!main.includes(`"${quietVisual}"`)) throw new Error(`主循环缺少安静异常节奏：${quietVisual}`);
}
for (const beat of ["douse-1", "douse-4", "step-10", "stop", "cloth", "outside", "echo", "hold"]) {
  if (!main.includes(`"${beat}"`)) throw new Error(`缺少细分异常节拍：${beat}`);
}
const quietAudioSection = audio.match(/else if \(cue === "stairs-darkness"\)[\s\S]*?else if \(cue === "light-flicker"\)/)?.[0] || "";
if (!quietAudioSection || quietAudioSection.includes("horrorHit") || quietAudioSection.includes("vibrate")) throw new Error("楼梯熄灯仍包含强惊吓音效");
for (const leakedPrompt of ["画面中有什么正在改变", "有一项变化没有被记录", "监控信号正在失去同步", "变化正在发生", "信号出现变化", "画面已改变"]) {
  if (main.includes(leakedPrompt)) throw new Error(`监控仍会直接暴露异常：${leakedPrompt}`);
}
if (!main.includes('`${camera.code} / MONITORING`')) throw new Error("监控底部缺少统一中性状态");
if (phoneSource.includes('message.suspicious ? " suspicious"')) throw new Error("可疑消息仍会获得专属视觉样式");
if (css.includes(".chat-message.suspicious")) throw new Error("可疑消息仍保留专属视觉样式");
if (!main.includes('const level = message.corrupt ? "corrupt" : "normal"')) throw new Error("真假消息仍使用不同通知反馈");
if (!css.includes("audioCardIn") || !css.includes("prefers-reduced-motion:reduce")) throw new Error("耳机提示缺少平滑动画或减少动态效果适配");
if (!headers.includes("/*.css") || !headers.includes("/js/*") || !headers.includes("Cache-Control: no-cache")) throw new Error("Cloudflare 静态资源缺少更新校验规则");
if (!css.includes("turnMidFrame") || !css.includes("turnFinalFrame")) throw new Error("分阶段回头动画缺失");
for (const animation of ["waterClimb", "machineViolent", "curtainHeadTurn", "spaceCollapse", "figureNotice"]) {
  if (!css.includes(`@keyframes ${animation}`)) throw new Error(`缺少多阶段异常动画：${animation}`);
}
for (const cue of ["ceiling-hit", "inside-breath", "head-turn", "collapse"]) {
  if (!main.includes(`"${cue}"`)) throw new Error(`缺少异常节拍：${cue}`);
}
if (!audio.includes("startBgm")) throw new Error("全局氛围音乐缺失");
if (!audio.includes("phoneInterference")) throw new Error("手机污染音效缺失");
for (const audioMethod of ["loadSamples", "playSample", "setTension", "startRingtone", "stopRingtone"]) {
  if (!audio.includes(`${audioMethod}(`)) throw new Error(`缺少真实音频能力：${audioMethod}`);
}
for (const sample of ["door-knock.mp3", "phone-old-ring.mp3", "heartbeat-fast.mp3", "wood-scrape.mp3", "glass-break.mp3", "human-breathing.mp3", "horror-ambience.mp3", "horror-hit.mp3"]) {
  const path = `${gameRoot}/assets/audio/${sample}`;
  if (!fs.existsSync(path) || fs.statSync(path).size < 20_000) throw new Error(`真实音频缺失或无效：${sample}`);
}
for (const sample of [
  "crt_glitch_medium.mp3", "crt_severe_static.mp3", "crt_switch_short.mp3",
  "door_creak_long.mp3", "door_creak_short.mp3", "door_creak_tense.mp3",
  "drip_single_01.mp3", "drip_single_02.mp3", "drip_single_03.mp3",
  "fluorescent_buzz_loop_20s.mp3", "heels_far_to_near.mp3", "heels_near_walk.mp3", "heels_stop_outside.mp3",
  "room_night_loop_60s.mp3", "washer_stage_1_normalish.mp3", "washer_stage_2_unbalanced.mp3", "washer_stage_3_out_of_control.mp3"
]) {
  const path = `${gameRoot}/assets/audio/${sample}`;
  if (!fs.existsSync(path) || fs.statSync(path).size < 5_000) throw new Error(`专用音效缺失或无效：${sample}`);
}
for (const integration of ["playRandomDrip", "playDoor", 'playSample("crtSwitch"', 'playSample("heelsFar"', 'playSample("heelsStop"', 'playSample("washer3"']) {
  if (!audio.includes(integration)) throw new Error(`专用音效未完成接入：${integration}`);
}
for (const retired of ['footsteps: "assets/audio/footsteps-tunnel.mp3"', 'doorOpen: "assets/audio/door-scary-open.mp3"', 'waterDrip: "assets/audio/water-drip.mp3"']) {
  if (audio.includes(retired)) throw new Error(`旧通用音效映射仍在启用：${retired}`);
}
if (!main.includes("audio.glitch(true)")) throw new Error("严重监控故障未接入专用CRT音效");
if (!main.includes("audio.startRingtone()") || !main.includes("audio.stopRingtone()")) throw new Error("来电铃声未接入接听/拒接流程");
if (!main.includes("audio.setTension(currentPhase, state.danger)")) throw new Error("BGM 未随阶段和危险值变化");
if (!audio.includes("setEventFocus(focused)") || !main.includes("audio.setEventFocus")) throw new Error("异常期间环境杂音未被抑制");
if (css.includes(".monitor-view.event-pipe-drip .rising-water{display:block")) throw new Error("旧的发光滴水浮层仍在启用");
if (!main.includes("0.92].map")) throw new Error("走廊脚步没有扩展为连续逼近节拍");
if (!main.includes("allCameraSources") || !main.includes("cameraPreload") || !main.includes("record?.ready") || !main.includes("72")) {
  throw new Error("监控切换未使用优先预载和快速换帧");
}
if (!main.includes("criticalAudioSamples") || !main.includes("audio.loadSamples(criticalAudioSamples)")) {
  throw new Error("关键事件音效没有在进入监控前预热");
}
if (!simulationSource.includes("Math.max(event.lead.offset, -1.2)")) {
  throw new Error("手机线索到异常发生的等待时间仍然过长");
}
if (!main.includes("cameraRequestToken += 1") || !main.includes('pendingCameraSource = null')) {
  throw new Error("连续切换镜头时旧图片请求未被取消");
}
if (!main.includes("renderedEventKey") || main.includes("classList.remove(...eventClasses)")) {
  throw new Error("异常样式仍可能在每帧重启动画");
}
if (!main.includes("fireDueBeats") || !main.includes("ensureEventCue")) {
  throw new Error("异常音效没有按当前可见镜头同步");
}
if (!audio.includes('loadSamples(["crtSwitch"])') || !audio.includes("samplePromises")) {
  throw new Error("音频仍在阻塞首屏或缺少按需加载");
}
if (audio.includes('this.scene === "hall") {\n        if (Math.random() > 0.68) this.playSample("heelsFar"') || audio.includes('this.scene === "lobby") {\n        if (Math.random() > 0.62) this.playDoor')) {
  throw new Error("普通环境音仍会错误播放异常脚步或开门声");
}
for (const phoneEffect of ["phone-corruption-ghost", "phone-corruption-snow-hard", "phone-corruption-flood", "phoneSnow", "floodScreen"]) {
  if (!css.includes(phoneEffect)) throw new Error(`缺少手机污染效果：${phoneEffect}`);
}
if (!main.includes("queuePhoneCorruption") || !main.includes("triggerPhoneCorruption")) throw new Error("手机污染触发逻辑缺失");
if (!main.includes(": 1800")) throw new Error("正常流程未扩展到约10.8分钟");
if (!main.includes("eventVisualProgress")) throw new Error("异常画面加速逻辑缺失");
for (const integratedFrame of [
  "cam-stairs-footprints-v3.webp",
  "cam-lobby-door-open-v3.webp",
  "cam-laundry-drip-mid-v4.webp",
  "cam-laundry-drip-reverse-v4.webp",
  "cam-laundry-machine-mid-v4.webp",
  "cam-laundry-machine-violent-v4.webp",
  "cam-lobby-clock-mid-v4.webp",
  "cam-lobby-clock-final-v4.webp",
  "cam-hall-door-mid-v4.webp",
  "cam-hall-door-open-v4.webp"
]) {
  if (!anomalies.includes(integratedFrame)) throw new Error(`场景融合异常帧未接入：${integratedFrame}`);
}
if (!anomalies.includes('image: "assets/cam-lobby-clean-v3.webp"')) throw new Error("大厅干净底图未接入");
if (css.includes(".monitor-view.event-wet-footprints .wet-footprints") || css.includes(".monitor-view.event-door-open .door-gap")) {
  throw new Error("旧的浮层式脚印或门缝仍在启用");
}

const sandbox = { window: {}, performance: { now: () => 0 }, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(`${gameRoot}/js/anomalies.js`, "utf8"), sandbox);
vm.runInContext(fs.readFileSync(`${gameRoot}/js/game.js`, "utf8"), sandbox);

let starts = 0;
let prompts = 0;
const simulation = new sandbox.NightShiftSimulation({
  minuteMs: 100,
  seed: 404,
  callbacks: {
    onEventStart: () => { starts += 1; },
    onTurnPrompt: () => { prompts += 1; }
  }
});
simulation.running = true;
for (let now = 0; now <= 36200; now += 100) simulation.step(now);
if (!simulation.finalStage || simulation.ended || starts !== 20 || prompts !== 1 || simulation.minute !== 360) {
  throw new Error(`最终选择阶段异常：${JSON.stringify({ ended: simulation.ended, finalStage: simulation.finalStage, starts, prompts, minute: simulation.minute })}`);
}
simulation.chooseTurn(true);
simulation.resolveTurn();
if (!simulation.ended) throw new Error("回头分支未能进入结局");

const noTurnTest = new sandbox.NightShiftSimulation({ seed: 404 });
noTurnTest.finalStage = true;
noTurnTest.minute = 360;
noTurnTest.chooseTurn(false);
noTurnTest.resolveNoTurn();
if (!noTurnTest.ended) throw new Error("不回头分支未能进入结局");

const reportTest = new sandbox.NightShiftSimulation({ seed: 404 });
const event = reportTest.eventQueue[0];
if (reportTest.eventQueue.some((item) => item.lead.offset < -0.75)) throw new Error("消息到异常开始的等待仍然过长");
reportTest.minute = event.actualStart + 1;
reportTest.processEvents();
if (!reportTest.report(event.camera, event.category).ok) throw new Error("正确上报未被识别");
reportTest.setView("phone-report");
if (reportTest.timeScale !== 0.42) throw new Error("上报期间时间未减速");

if (Object.keys(sandbox.GameContent.cameras).length !== 6) throw new Error("监控场景未扩展到6路");

console.log(`自检通过：${references.length} 个界面连接，${starts} 条事件链，6路监控、共享留言与双结局流程。`);
