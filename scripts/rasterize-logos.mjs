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

// SVG viewBox is 300x83.04 (≈ 3.61:1). Render PNGs at 2x retina for HiDPI.
const WIDTH = 800;
const HEIGHT = Math.round((83.04 / 300) * WIDTH); // 221

async function emit(srcSvgPath, targets) {
  const svgBuf = readFileSync(srcSvgPath);
  const pngBuf = await sharp(svgBuf, { density: 288 })
    .resize(WIDTH, HEIGHT, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();

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
