// Renders a press card to a 2-page PDF (front, back) with the same
// Playwright Chromium the e-paper uses (see lib/epaper/render-edition.ts).
// Assets are inlined as data URIs so page.setContent needs no file access;
// the photo is fetched here first so a dead URL fails fast and loudly
// instead of printing an empty box.
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import QRCode from "qrcode";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { renderCardHtml, verifyUrlFor, type CardData } from "./template";

export class PressCardRenderError extends Error {
  constructor(public code: "PHOTO_UNREACHABLE" | "RENDER_FAILED", message: string) { super(message); }
}

// We resolve the public dir from process.cwd(), not __dirname/import.meta.url:
// Next.js serves `public/` relative to the process's cwd in production (the
// admin app's own working directory), and __dirname-relative paths would
// resolve into the compiled `.next` output instead of the source tree. The
// one wrinkle is that scripts/tests are sometimes run from the repo root
// instead of apps/admin, so we fall back to the monorepo-relative path and
// cache whichever one actually exists.
let publicDirCache: string | null = null;
function resolvePublicDir(): string {
  if (publicDirCache) return publicDirCache;
  const candidates = [
    path.join(process.cwd(), "public", "press-card"),
    path.join(process.cwd(), "apps", "admin", "public", "press-card"),
  ];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, "lockup.png"))) {
      publicDirCache = dir;
      return dir;
    }
  }
  throw new PressCardRenderError("RENDER_FAILED", `press-card assets not found under ${candidates.join(", ")}`);
}

let assetCache: { lockup: string; main: string } | null = null;
async function logoAssets() {
  if (assetCache) return assetCache;
  const PUB = resolvePublicDir();
  const [l, m] = await Promise.all([readFile(path.join(PUB, "lockup.png")), readFile(path.join(PUB, "main-logo.png"))]);
  assetCache = { lockup: `data:image/png;base64,${l.toString("base64")}`, main: `data:image/png;base64,${m.toString("base64")}` };
  return assetCache;
}

// Authorised signatory's signature, printed over the signature line on the
// back. Kept out of the public repo: it lives in blob storage next to the
// staff photos and is fetched once per process, then cached.
const SIGNATURE_URL =
  process.env.PRESS_CARD_SIGNATURE_URL ||
  "https://rayalaseemamedia.blob.core.windows.net/uploads/press-cards/signature.png";
let signatureCache: string | null = null;
async function fetchSignatureDataUri(): Promise<string> {
  if (signatureCache) return signatureCache;
  try {
    signatureCache = await fetchPhotoDataUri(SIGNATURE_URL);
    return signatureCache;
  } catch (e) {
    throw new PressCardRenderError("RENDER_FAILED", `signature image unavailable: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function fetchPhotoDataUri(url: string): Promise<string> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new PressCardRenderError("PHOTO_UNREACHABLE", `photo ${res.status}`);
    const ct = res.headers.get("content-type") || "image/jpeg";
    if (!ct.startsWith("image/")) throw new PressCardRenderError("PHOTO_UNREACHABLE", `photo content-type ${ct}`);
    return `data:${ct};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch (e) {
    if (e instanceof PressCardRenderError) throw e;
    throw new PressCardRenderError("PHOTO_UNREACHABLE", String(e));
  } finally { clearTimeout(t); }
}

// The VM running this app has 3.8 GB RAM and each render launches its own
// Chromium instance; letting renders pile up unbounded under concurrent
// requests risks OOM-killing the whole process. Cap concurrent renders at 2
// with a simple promise-queue semaphore - extra callers wait their turn
// instead of all launching Chromium at once.
const MAX_CONCURRENT_RENDERS = 2;
let active = 0;
const waiters: Array<() => void> = [];

async function acquireRenderSlot(): Promise<void> {
  if (active < MAX_CONCURRENT_RENDERS) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  active++;
}

function releaseRenderSlot(): void {
  active--;
  const next = waiters.shift();
  if (next) next();
}

export async function renderPressCardPdf(card: CardData): Promise<Buffer> {
  await acquireRenderSlot();
  try {
    return await renderPressCardPdfInner(card);
  } finally {
    releaseRenderSlot();
  }
}

async function renderPressCardPdfInner(card: CardData): Promise<Buffer> {
  const [{ lockup, main }, photo, qr, signature] = await Promise.all([
    logoAssets(),
    fetchPhotoDataUri(card.photoUrl),
    QRCode.toDataURL(verifyUrlFor(card.token), { errorCorrectionLevel: "M", margin: 1, scale: 12, color: { dark: "#111111", light: "#ffffff" } }),
    fetchSignatureDataUri(),
  ]);
  const assets = { lockupDataUri: lockup, mainLogoDataUri: main, qrDataUri: qr, signatureDataUri: signature };
  const browser = await chromium.launch();
  try {
    const out = await PDFDocument.create();
    for (const side of ["front", "back"] as const) {
      const page = await browser.newPage({ viewport: { width: 227, height: 347 }, deviceScaleFactor: 2 });
      try {
        await page.setContent(renderCardHtml(side, { ...card, photoUrl: photo }, assets), { waitUntil: "load" });
        const bytes = await page.pdf({ width: "60mm", height: "91.6mm", printBackground: true, preferCSSPageSize: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
        const src = await PDFDocument.load(bytes);
        const [p] = await out.copyPages(src, [0]);
        out.addPage(p);
      } finally { await page.close(); }
    }
    out.setTitle(`Press card ${card.cardNo} - ${card.name}`);
    out.setProducer("Rayalaseema News admin");
    return Buffer.from(await out.save());
  } catch (e) {
    if (e instanceof PressCardRenderError) throw e;
    throw new PressCardRenderError("RENDER_FAILED", String(e));
  } finally {
    await browser.close();
  }
}
