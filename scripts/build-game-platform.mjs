import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Script } from "node:vm";

const target = process.argv[2];
const configurations = {
  "taptap-dev": { mode: "taptap", apiBase: "https://dorm-404-night-watch.pages.dev", allowInternalQA: true },
  "taptap-release": { mode: "taptap", apiBase: "https://dorm-404-night-watch.pages.dev", allowInternalQA: false }
};
if (!Object.hasOwn(configurations, target)) throw new Error("Use taptap-dev or taptap-release");
const output = resolve("dist", target);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve("public/game"), output, { recursive: true, filter: (path) => !path.endsWith("/_headers") && !path.endsWith("/scene-preview/index.html") });
const anomalySource = await readFile(resolve("public/game/js/anomalies.js"), "utf8");
const sceneAssets = new Set(anomalySource.match(/scene-preview\/assets\/[\w-]+\.webp/g) || []);
const normalFrames = ["music", "dance", "elevator", "lab"].map((scene) => `scene-preview/assets/${scene}-normal.webp`);
if (normalFrames.some((frame) => !sceneAssets.has(frame)) || sceneAssets.size <= normalFrames.length) {
  throw new Error("Scene asset manifest is incomplete");
}
for (const asset of sceneAssets) {
  try { await access(resolve(output, asset)); }
  catch { throw new Error(`TapTap package is missing game scene asset: ${asset}`); }
}
await writeFile(resolve(output, "js/platform-config.js"), `window.GAME_PLATFORM_CONFIG = Object.freeze(${JSON.stringify(configurations[target])});\n`);
if (target === "taptap-release") {
  // Strip release-only QA entry points from generated files. Fail closed if
  // the source boundaries change; public/game remains the tested Web/Dev game.
  function replaceSection(source, start, end, replacement = "") {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from + start.length);
    if (from < 0 || to < 0) throw new Error(`Cannot strip release QA section: ${start}`);
    return source.slice(0, from) + replacement + source.slice(to);
  }
  const htmlPath = resolve(output, "index.html");
  let html = await readFile(htmlPath, "utf8");
  const qaStart = html.indexOf('  <section class="overlay test-module hidden"');
  const qaEnd = html.indexOf('  <section class="overlay settings-overlay hidden"', qaStart);
  if (qaStart < 0 || qaEnd < 0 || !html.includes('src="js/test-module.js?')) throw new Error("QA markup changed; cannot produce release package safely");
  html = html.slice(0, qaStart) + html.slice(qaEnd);
  html = html.replace(/^\s*<script src="js\/test-module\.js\?[^\"]+"><\/script>\s*$/m, "");
  await writeFile(htmlPath, html);
  await rm(resolve(output, "js/test-module.js"));

  const cssPath = resolve(output, "style.css");
  const css = await readFile(cssPath, "utf8");
  await writeFile(cssPath, replaceSection(css, ".overlay.test-module{", ".global-signal-grid{"));

  const guestbookPath = resolve(output, "js/guestbook.js");
  const guestbook = replaceSection(await readFile(guestbookPath, "utf8"),
    '    if (content === "131500" &&', '    if (!nickname || !content)',
    '    if (content === "131500") return setNote("这条留言无法发布，请修改后再试。", true);\n');
  new Script(guestbook);
  await writeFile(guestbookPath, guestbook);

  const mainPath = resolve(output, "js/main.js");
  let main = replaceSection(await readFile(mainPath, "utf8"),
    '  const qa = ', '  const shiftSeed = ',
    '  const qa = false;\n  const fast = false;\n  const testMode = null;\n  const testEventId = null;\n  const testShow = null;\n  const startMinute = 0;\n  const minuteMs = 470000 / 360;\n  const globalSignalAt = 240000;\n  const finalSilenceMs = 10000;\n  const requestedSeed = null;\n');
  main = replaceSection(main, '  if (testMode) {\n', '  const fullscreenTipKey = ');
  new Script(main);
  await writeFile(mainPath, main);
}
console.log(`${target}: ${output}`);
