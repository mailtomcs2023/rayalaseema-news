// Brand thumbnail renderer (spec 4.5): a video frame, dark gradient, RSN
// icon, optional బ్రేకింగ్ badge and a 2-line Telugu headline, rendered by
// the same Playwright Chromium the e-paper pipeline already installs.
import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { THUMBNAIL_TEMPLATE } from "./thumbnail-template";

const YT_MAX_BYTES = 2_000_000;

// `public/` lives under apps/admin; the app runs with that as cwd in
// production, but tests may run from the repo root.
function publicPath(...segments: string[]): string {
  const direct = join(process.cwd(), "public", ...segments);
  if (existsSync(direct)) return direct;
  return join(process.cwd(), "apps", "admin", "public", ...segments);
}

const DEFAULT_LOGO = () => publicPath("brand", "rsn-icon-256.png");
const DEFAULT_FONT = () => publicPath("anu-fonts", "Anek-Telugu-Bold.ttf");

const dataUri = (bytes: Uint8Array, mime: string) => `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
const escapeHtml = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] as string);

export function jpegUnder2MB(buf: Uint8Array): boolean {
  return buf.byteLength <= YT_MAX_BYTES;
}

export type ThumbnailInput = {
  /** Raw image bytes (png/jpeg) or an https URL the browser can load. */
  frame: Uint8Array | string;
  headline: string;
  breaking: boolean;
  logoPath?: string;
  fontPath?: string;
  launchTimeoutMs?: number;
};

export async function renderThumbnail(a: ThumbnailInput): Promise<{ jpeg: Uint8Array; width: 1280; height: 720 }> {
  const logo = dataUri(readFileSync(a.logoPath ?? DEFAULT_LOGO()), "image/png");
  const font = dataUri(readFileSync(a.fontPath ?? DEFAULT_FONT()), "font/ttf");
  const frame = typeof a.frame === "string" ? a.frame : dataUri(a.frame, a.frame[0] === 0x89 ? "image/png" : "image/jpeg");
  const html = THUMBNAIL_TEMPLATE
    .replace("{{FRAME}}", frame)
    .replace("{{LOGO}}", logo)
    .replace("{{FONT}}", font)
    .replace("{{BADGE}}", a.breaking ? "block" : "none")
    .replace("{{HEADLINE}}", escapeHtml(a.headline));

  // Bounded launch so a broken browser install fails fast instead of hanging
  // the worker; the VM launches in under a second.
  const browser = await chromium.launch({ timeout: a.launchTimeoutMs ?? 30_000 });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    let quality = 90;
    let jpeg = new Uint8Array(await page.screenshot({ type: "jpeg", quality }));
    while (!jpegUnder2MB(jpeg) && quality > 50) {
      quality -= 10;
      jpeg = new Uint8Array(await page.screenshot({ type: "jpeg", quality }));
    }
    return { jpeg, width: 1280, height: 720 };
  } finally {
    await browser.close();
  }
}
