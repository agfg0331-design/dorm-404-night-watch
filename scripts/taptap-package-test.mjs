import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const sourceDir = resolve("public/game/scene-preview/assets");
const sourceAssets = (await readdir(sourceDir)).filter((name) => name.endsWith(".webp")).sort();
const anomalies = await readFile(resolve("public/game/js/anomalies.js"), "utf8");
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
