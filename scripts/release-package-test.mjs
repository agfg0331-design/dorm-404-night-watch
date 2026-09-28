import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import vm from "node:vm";

// Run after npm run build:taptap, also accepts an extracted ZIP's game/ directory.
const root = resolve(process.argv[2] || "dist/taptap-release");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? files(resolve(dir, entry.name)) : [resolve(dir, entry.name)]);
const config = { window: {} };
vm.runInNewContext(read("js/platform-config.js"), config);
assert.equal(config.window.GAME_PLATFORM_CONFIG.mode, "taptap");
assert.equal(config.window.GAME_PLATFORM_CONFIG.allowInternalQA, false);
assert.equal(config.window.GAME_PLATFORM_CONFIG.apiBase, "https://dorm-404-night-watch.pages.dev");
assert(!existsSync(resolve(root, "js/test-module.js")));
assert(!existsSync(resolve(root, "scene-preview/index.html")));
const html = read("index.html"), css = read("style.css"), platform = read("platform.css");
const categories = [...html.matchAll(/name="category" value="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(categories, ["人物异常", "物品变化", "门窗 / 通道", "灯光 / 设备", "环境 / 空间", "监控 / 信号"]);
assert(!html.includes("其他 / 无法判断"));
assert(html.includes('id="sceneWatermark"') && css.includes("font:300 clamp(.6rem,1.12vw,.75rem)"));
assert(css.includes("top:max(3%,calc(env(safe-area-inset-top) + 2rem));bottom:auto"));
assert(platform.includes("scale(1.05)") && platform.includes(".platform-taptap .guestbook-note"));
for (const file of files(root).filter((file) => /\.(js|css|html|json)$/.test(file))) {
  const source = readFileSync(file, "utf8");
  for (const forbidden of ["feed-matte", "test-module", "dorm404:test-open", "dorm404:test-start"])
    assert(!source.includes(forbidden), `${relative(root, file)} contains ${forbidden}`);
}
const main = read("js/main.js"), guestbook = read("js/guestbook.js"), archive = read("js/archive.js");
for (const parameter of ["qa", "fast", "test", "event", "show", "start", "rate", "globalAt", "seed"])
  assert(!main.includes(`params.get("${parameter}")`) && !main.includes(`params.has("${parameter}")`));
assert(guestbook.includes('if (content === "131500") return setNote('));
assert(archive.includes('const KEY = "dorm404.archive.v1"'));
assert(archive.includes('ledgerImage.src = "assets/archive-ledger-flat.webp"') && archive.includes("ledgerImage.decode()"));
assert(main.includes("cameraPreload.then(() => window.GameArchive.warmup())"));

// The generated defaults must equal the original game with QA disabled,
// including when a caller supplies every internal URL parameter.
function defaults(source, search) {
  const prefix = source.slice(source.indexOf('  const audio = '), source.indexOf('  const shiftSeed = '));
  return vm.runInNewContext(`${prefix}\nJSON.stringify({qa,fast,testMode,testEventId,testShow,startMinute,minuteMs,globalSignalAt,finalSilenceMs,requestedSeed})`,
    { window: { GamePlatform: { allowInternalQA: false } }, location: { search }, URLSearchParams });
}
const sourceMain = readFileSync("public/game/js/main.js", "utf8");
for (const search of ["", "?qa=1&fast=1&test=full&start=342&rate=90&globalAt=1&seed=1", "?qa=1&test=event&event=hall-door", "?qa=1&test=show&show=final-blackout"])
  assert.equal(defaults(main, search), defaults(sourceMain, search));

const changedByBuild = new Set(["index.html", "style.css", "js/main.js", "js/guestbook.js", "js/platform-config.js"]);
for (const file of files(resolve("public/game"))) {
  const path = relative(resolve("public/game"), file);
  if (["_headers", "scene-preview/index.html", "js/test-module.js"].includes(path)) continue;
  assert(existsSync(resolve(root, path)), `Missing release resource ${path}`);
  if (!changedByBuild.has(path)) assert(readFileSync(file).equals(readFileSync(resolve(root, path))), `Unexpected change: ${path}`);
}
assert.equal(files(resolve(root, "scene-preview/assets")).filter((p) => p.endsWith(".webp")).length, 16);
console.log("Release package: QA entries removed, normal defaults unchanged, six categories, archive warmup and all resources passed.");
