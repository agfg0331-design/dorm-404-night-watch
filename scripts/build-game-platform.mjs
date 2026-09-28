import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

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
  const htmlPath = resolve(output, "index.html");
  let html = await readFile(htmlPath, "utf8");
  const qaStart = html.indexOf('  <section class="overlay test-module hidden"');
  const qaEnd = html.indexOf('  <section class="overlay settings-overlay hidden"', qaStart);
  if (qaStart < 0 || qaEnd < 0 || !html.includes('src="js/test-module.js?')) throw new Error("QA markup changed; cannot produce release package safely");
  html = html.slice(0, qaStart) + html.slice(qaEnd);
  html = html.replace(/^\s*<script src="js\/test-module\.js\?[^\"]+"><\/script>\s*$/m, "");
  await writeFile(htmlPath, html);
  await rm(resolve(output, "js/test-module.js"));
}
console.log(`${target}: ${output}`);
