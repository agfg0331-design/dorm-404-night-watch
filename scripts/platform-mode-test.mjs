import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { onRequestOptions as boardOptions } from "../functions/api/board.js";
import { onRequestOptions as handoffOptions } from "../functions/api/handoff.js";
import { onRequestOptions as voteOptions } from "../functions/api/board/[id]/vote.js";
import { onRequestOptions as reportOptions } from "../functions/api/board/[id]/report.js";

const source = fs.readFileSync("public/game/js/platform.js", "utf8");
function platform(config, hostname = "game.example") {
  const classes = new Set();
  const styles = new Map();
  const body = { classList: { add: value => classes.add(value), toggle: (value, enabled) => enabled ? classes.add(value) : classes.delete(value) }, style: { setProperty: (key, value) => styles.set(key, value) }, append() {} };
  const sandbox = {
    window: { GAME_PLATFORM_CONFIG: config, addEventListener() {}, visualViewport: { width: 844, height: 390, addEventListener() {} } },
    document: { body, createElement: () => ({ style: {} }), addEventListener() {} },
    location: { hostname, search: "" }, URLSearchParams, innerWidth: 844, innerHeight: 390,
    getComputedStyle: () => ({ getPropertyValue: () => "0px" }), requestAnimationFrame: fn => fn()
  };
  vm.runInNewContext(source, sandbox);
  return { result: sandbox.window.GamePlatform, classes, styles };
}
const web = platform({ mode: "web", apiBase: "", allowInternalQA: true });
const dev = platform({ mode: "taptap", apiBase: "https://dorm-404-night-watch.pages.dev", allowInternalQA: true });
const release = platform({ mode: "taptap", apiBase: "https://dorm-404-night-watch.pages.dev", allowInternalQA: false });
for (const [instance, mode, qa, fullscreen, apiBase] of [
  [web, "web", true, true, ""],
  [dev, "taptap", true, false, "https://dorm-404-night-watch.pages.dev"],
  [release, "taptap", false, false, "https://dorm-404-night-watch.pages.dev"]
]) {
  assert.equal(instance.result.mode, mode);
  assert.equal(instance.result.allowInternalQA, qa);
  assert.equal(instance.result.supportsBrowserFullscreen, fullscreen);
  assert.equal(instance.result.apiBase, apiBase);
  assert.equal(instance.result.apiUrl("/api/handoff"), `${apiBase}/api/handoff`);
  assert(instance.classes.has(`platform-${mode}`));
}
assert(dev.classes.has("taptap-wide"));
assert.equal(dev.result.viewport.width, 844);
assert.equal(dev.result.safeArea.top, 0);
assert(!web.classes.has("taptap-wide"));
dev.result.storage.setItem("dorm404.archive.v1", '{"anomaly":{}}');
assert.equal(dev.result.storage.getItem("dorm404.archive.v1"), '{"anomaly":{}}', "blocked localStorage should keep the shift playable in memory");
for (const options of [boardOptions, handoffOptions, voteOptions, reportOptions]) {
  const response = options();
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.match(response.headers.get("access-control-allow-methods"), /GET.*POST.*OPTIONS/);
  assert.match(response.headers.get("access-control-allow-headers"), /Content-Type.*X-Board-Visitor/);
}
assert.match(fs.readFileSync("public/game/js/guestbook.js", "utf8"), /GamePlatform\.apiUrl\(path\)/);
assert.match(fs.readFileSync("public/game/js/handoff.js", "utf8"), /GamePlatform\.apiUrl\(path\)/);
assert.match(fs.readFileSync("public/game/js/main.js", "utf8"), /GamePlatform\.allowInternalQA && params\.get\("qa"\)/);
console.log("Web、TapTap dev/release 平台配置与 Cloudflare 预检通过。");
