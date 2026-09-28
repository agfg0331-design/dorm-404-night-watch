import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const sourceDir = resolve("public/game/scene-preview/assets");
const sourceAssets = (await readdir(sourceDir)).filter((name) => name.endsWith(".webp")).sort();
const anomalies = await readFile(resolve("public/game/js/anomalies.js"), "utf8");
const sourceHtml = await readFile(resolve("public/game/index.html"), "utf8");
const sourceCss = await readFile(resolve("public/game/style.css"), "utf8");
const sourcePlatformCss = await readFile(resolve("public/game/platform.css"), "utf8");
const sourceMain = await readFile(resolve("public/game/js/main.js"), "utf8");
assert(sourceMain.includes("const finalSilenceMs = 10000") && sourceMain.includes("audio.enterSilence()") &&
  sourceMain.indexOf("audio.enterSilence()") < sourceMain.indexOf("sim.beginFinalCall()"), "final ten-second silence was changed");
for (const content of [sourceHtml, sourceCss, sourcePlatformCss]) assert(!content.includes("feed-matte"), "source contains old matte");
assert(sourceHtml.includes('id="sceneWatermark"') && sourceCss.includes(".scene-watermark"));
assert(!sourceHtml.includes("其他 / 无法判断") && !sourceHtml.includes("category-other"));
assert((sourceHtml.match(/name="category"/g) || []).length === 6);
assert(sourceCss.includes("grid-template-columns:1fr 1fr"));
assert(sourcePlatformCss.includes(".platform-taptap .report-panel") && sourcePlatformCss.includes(".platform-taptap .submit-report"));
assert(sourcePlatformCss.includes(".phone-view.report-open .phone-title button { min-height:44px;padding:0;white-space:nowrap }") &&
  sourcePlatformCss.includes("min-height:43px") && sourcePlatformCss.includes("min-height:44px"));
assert(sourcePlatformCss.includes("scale(1.05)"));
const referenced = [...new Set(anomalies.match(/scene-preview\/assets\/[\w-]+\.webp/g) || [])];
for (const scene of ["music", "dance", "elevator", "lab"]) {
  assert(referenced.includes(`scene-preview/assets/${scene}-normal.webp`));
  assert(referenced.some((path) => path.startsWith(`scene-preview/assets/${scene}-`) && !path.endsWith("-normal.webp")));
}

// This smoke test builds only the development target; release validates its
// scene manifest when the release command is deliberately run.
for (const target of ["taptap-dev"]) {
  execFileSync(process.execPath, ["scripts/build-game-platform.mjs", target]);
  const output = resolve("dist", target);
  assert((await stat(resolve(output, "index.html"))).isFile());
  assert((await stat(resolve(output, "platform.css"))).isFile());
  const platformStyles = await readFile(resolve(output, "platform.css"), "utf8");
  const distHtml = await readFile(resolve(output, "index.html"), "utf8");
  const distCss = await readFile(resolve(output, "style.css"), "utf8");
  assert(![distHtml, distCss, platformStyles].some((content) => content.includes("feed-matte")));
  assert(!distHtml.includes("其他 / 无法判断") && (distHtml.match(/name="category"/g) || []).length === 6);
  assert(distHtml.includes('id="sceneWatermark"') && distHtml.includes('id="testModule"'));
  assert(platformStyles.includes("scale(1.05)"));
  assert(platformStyles.includes(".platform-taptap .mobile-fullscreen-tip"));
  assert(platformStyles.includes("--tap-stage-height"));
  await assert.rejects(stat(resolve(output, "scene-preview/index.html")), { code: "ENOENT" });
  assert.deepEqual((await readdir(resolve(output, "scene-preview/assets"))).sort(), sourceAssets);
  for (const path of referenced) assert((await stat(resolve(output, path))).isFile(), `${target}: ${path}`);
  const config = await readFile(resolve(output, "js/platform-config.js"), "utf8");
  assert.match(config, /"mode":"taptap"/);
  assert.match(config, /"apiBase":"https:\/\/dorm-404-night-watch\.pages\.dev"/);
  assert.match(config, new RegExp(`"allowInternalQA":${target === "taptap-dev"}`));
}
console.log("TapTap H5 packaging: all normal and anomaly scene frames present; QA modes intact.");
