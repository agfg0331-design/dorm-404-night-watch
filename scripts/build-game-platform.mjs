import { cp, mkdir, rm, writeFile } from "node:fs/promises";
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
await cp(resolve("public/game"), output, { recursive: true, filter: (path) => !path.endsWith("/_headers") && !path.includes("/scene-preview") });
await writeFile(resolve(output, "js/platform-config.js"), `window.GAME_PLATFORM_CONFIG = Object.freeze(${JSON.stringify(configurations[target])});\n`);
console.log(`${target}: ${output}`);
