#!/usr/bin/env node
/**
 * One-off SVG -> PNG rasterizer for the two new horizontal logo variants.
 * Input:
 *   apps/web/public/logo-candidates/red-black.svg
 *   apps/web/public/logo-candidates/white-gray.svg
 * Output:
 *   apps/web/public/logo.svg          (red-black)
 *   apps/web/public/logo.png          (red-black @ 800x222 from 300x83 viewBox)
 *   apps/web/public/logo-transparent.svg
 *   apps/web/public/logo-inverse.svg  (white-gray)
 *   apps/web/public/logo-inverse.png  (white-gray @ 800x222)
 *   apps/admin/public/logo.svg / .png  (same as web)
 *   apps/admin/public/logo-inverse.svg / .png
 */

import { copyFileSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const sharp = (await import("sharp")).default;

const SRC_LIGHT = "apps/web/public/logo-candidates/red-black.svg";
const SRC_DARK = "apps/web/public/logo-candidates/white-gray.svg";

// Read viewBox from the SVG so the PNG aspect matches whatever the source
// is (the previous design was 300x83 = 3.61:1; the current is 1500x308 =
// 4.87:1). Render at ~1600px wide for retina quality on common screen sizes.
const TARGET_WIDTH = 1600;

function readViewBox(svgText) {
  const m = svgText.match(/viewBox="([\d.\s-]+)"/);
  if (!m) return { w: 300, h: 83 };
  const parts = m[1].trim().split(/\s+/).map(Number);
  // viewBox = "minX minY width height"
  return { w: parts[2], h: parts[3] };
}

async function emit(srcSvgPath, targets) {
  const svgText = readFileSync(srcSvgPath, "utf8");
  const svgBuf = Buffer.from(svgText, "utf8");
  const { w: vbW, h: vbH } = readViewBox(svgText);
  const aspect = vbW / vbH;
  const WIDTH = TARGET_WIDTH;
  const HEIGHT = Math.round(WIDTH / aspect);
  const pngBuf = await sharp(svgBuf, { density: 288 })
    .resize(WIDTH, HEIGHT, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  console.log(`  (source viewBox ${vbW}x${vbH} aspect ${aspect.toFixed(2)}:1 -> PNG ${WIDTH}x${HEIGHT})`);

  for (const [pathSvg, pathPng] of targets) {
    if (pathSvg) {
      mkdirSync(dirname(pathSvg), { recursive: true });
      copyFileSync(srcSvgPath, pathSvg);
      console.log(`  svg: ${pathSvg}  (${(svgBuf.length / 1024).toFixed(0)} KB)`);
    }
    if (pathPng) {
      mkdirSync(dirname(pathPng), { recursive: true });
      writeFileSync(pathPng, pngBuf);
      console.log(`  png: ${pathPng}  (${(pngBuf.length / 1024).toFixed(0)} KB, ${WIDTH}x${HEIGHT})`);
    }
  }
}

console.log("Light variant (Red & Black on white bg) → logo + logo-transparent:");
await emit(SRC_LIGHT, [
  ["apps/web/public/logo.svg",              "apps/web/public/logo.png"],
  ["apps/web/public/logo-transparent.svg",  "apps/web/public/logo-transparent.png"],
  ["apps/admin/public/logo.svg",            "apps/admin/public/logo.png"],
  ["apps/admin/public/logo-transparent.svg", null],
  ["apps/reporter/assets/logo-transparent.svg", null],
]);

console.log("Dark variant (White & Gray on dark bg) → logo-inverse:");
await emit(SRC_DARK, [
  ["apps/web/public/logo-inverse.svg",   "apps/web/public/logo-inverse.png"],
  ["apps/admin/public/logo-inverse.svg", "apps/admin/public/logo-inverse.png"],
]);

// Clean up candidates folder — no longer needed once mapped to final names.
rmSync("apps/web/public/logo-candidates", { recursive: true, force: true });
console.log("\n✓ candidates folder removed; logos mapped to final paths.");
