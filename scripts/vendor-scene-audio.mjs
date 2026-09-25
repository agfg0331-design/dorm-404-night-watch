// Download and trim the approved free/CC0 scene recordings into public/game.
// Requires curl and ffmpeg. Run: node scripts/vendor-scene-audio.mjs
// Append a clip basename to refresh one recording only.
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../public/game/assets/audio/", import.meta.url));
const clips = [
  ["scene-metal-frame-fall", "269/269693_3781640", 5.2],
  ["scene-bad-piano", "389/389673_7158173", 8],
  ["scene-curtain-wind", "486/486599_1121623", 8],
  ["scene-elevator-door", "161/161228_544580", 7],
  ["scene-elevator-ding", "588/588718_13288396", 5],
  ["scene-dance-screech", "844/844244_18042200", 3],
  ["scene-dance-whispers", "763/763804_11744683", 7],
  ["scene-tv-static", "50/50500_593941", 7],
  ["scene-robot-voices", "586/586535_3606949", 7]
];
const trims = { "scene-metal-frame-fall": 1.81 };
const treatments = {
  "scene-metal-frame-fall": "acompressor=threshold=0.05:ratio=3:attack=5:release=150:makeup=3,volume=9dB,alimiter=limit=0.85",
  "scene-bad-piano": "volume=8dB",
  "scene-curtain-wind": "volume=7dB",
  "scene-dance-whispers": "volume=26dB,alimiter=limit=0.85"
};

mkdirSync(root, { recursive: true });
const staging = mkdtempSync(join(tmpdir(), "dorm404-scene-audio-"));
const requested = new Set(process.argv.slice(2));
try {
  for (const [name, source, seconds] of clips) {
    if (requested.size && !requested.has(name)) continue;
    const sourceFile = join(staging, `${name}-source.mp3`);
    const output = join(staging, `${name}.mp3`);
    const url = `https://cdn.freesound.org/previews/${source}-lq.mp3`;
    execFileSync("curl", ["-fsSL", "--retry", "2", "--connect-timeout", "12", "--max-time", "90", url, "-o", sourceFile], { stdio: "inherit" });
    const start = trims[name] || 0;
    const filters = [treatments[name], `afade=t=out:st=${Math.max(0, seconds - 0.2)}:d=0.2`].filter(Boolean).join(",");
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(start), "-i", sourceFile, "-t", String(seconds), "-af", filters, "-ar", "44100", "-ac", "2", "-codec:a", "libmp3lame", "-q:a", "4", output], { stdio: "inherit" });
    if (statSync(output).size < 1000) throw new Error(`${name}: empty or invalid recording`);
    renameSync(output, join(root, `${name}.mp3`));
    process.stdout.write(`Saved ${name}.mp3\n`);
  }
} finally {
  rmSync(staging, { recursive: true, force: true });
}
