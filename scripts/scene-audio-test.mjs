import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

const gameRoot = resolve("public/game");
const window = {};
runInNewContext(readFileSync(resolve(gameRoot, "js/audio.js"), "utf8"), { window });
const audio = window.NightAudio;

const expectedFiles = [
  "metalFrameFall", "badPiano", "curtainWind", "elevatorDoor", "elevatorDing",
  "danceScreech", "danceWhispers", "tvStatic", "robotVoices"
];
for (const key of expectedFiles) {
  const file = audio.sampleUrls[key];
  assert.match(file, /^assets\/audio\/scene-[\w-]+\.mp3$/, `${key} must be bundled locally`);
  assert.ok(statSync(resolve(gameRoot, file)).size > 1000, `${key} recording is missing or empty`);
}

const heard = [];
audio.playSample = (key, options) => { heard.push([key, options]); return {}; };
audio.duck = () => {};
const hear = (id, beat) => {
  heard.length = 0;
  audio.playEventBeat({ id, visual: "scene-still" }, beat);
  return heard.map(([key]) => key);
};

assert.deepEqual(hear("music-stands", "fall"), ["metalFrameFall", "chairFall"]);
assert.deepEqual(hear("music-piano", "open"), ["badPiano"]);
assert.deepEqual(hear("music-figure", "curtain"), ["curtainWind"]);
assert.deepEqual(hear("dance-figure", "blackout"), ["danceScreech"]);
assert.deepEqual(hear("dance-desync", "appear"), []);
assert.deepEqual(hear("dance-line", "appear"), ["danceWhispers", "danceWhispers"]);
assert.deepEqual(hear("elevator-die", "die"), ["elevatorDing"]);
assert.deepEqual(hear("elevator-open", "open"), ["elevatorDoor"]);
assert.deepEqual(hear("lab-screen", "screen"), ["tvStatic"]);
assert.deepEqual(hear("lab-static", "screen"), ["tvStatic"]);
assert.deepEqual(hear("lab-feed", "screens"), ["robotVoices", "robotVoices", "robotVoices"]);
for (let step = 0; step < 6; step += 1) {
  assert.equal(hear("elevator-footprints", `step-${step}`).length, 1);
  assert.ok(["heelsFar", "heelsNear"].includes(heard[0][0]));
}
console.log("新场景音效自检通过：9 段本地素材、谱架双音、舞蹈静默与电梯脚步节奏。");
