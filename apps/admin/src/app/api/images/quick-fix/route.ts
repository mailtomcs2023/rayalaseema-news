// POST /api/images/quick-fix { url, op, contentId?, role? }
//
// Sharp-backed image edits that don't need AI. The editor reaches for
// this first; AI (/api/images/enhance) is reserved for the two cases
// sharp genuinely can't do (remove-watermark, severe restore).
//
// Why this exists: ~80% of editorial photo edits are "brighten this
// dark district shot" / "sharpen this slightly soft press conf
// frame" / "upscale this small wire thumb" — all sub-second sharp
// ops that gpt-image-2 was burning ~$0.06 and 15s on.
//
// Operations (free, ~150ms each):
//   auto-fix    - re-run the editorial baseline harder (stronger
//                 normalize + sharpen, lifts dark photos cleanly)
//   brighten    - +15% brightness
//   darken      - -15% brightness
//   sharpen     - heavier USM than the baseline
//   upscale-2x  - lanczos3 2x resample (good through ~2x; AI better
//                 for 4x+ but most editorial use is 1.5-2x)
//   saturate    - +20% saturation (for dull rural light)
//   desaturate  - -25% saturation
//   grayscale   - editorial b&w
//
// Every result still flows through processImageBuffer (so the
// editorial baseline + EXIF strip + brand stamp + max-1600px cap
// apply) and ends up on Azure Blob + queued for SP mirror.

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { processImageBuffer } from "@/lib/image-process";
import { uploadBuffer, blobConfigured } from "@/lib/blob";
import { isUrlSafeToFetch } from "@/lib/ssrf-guard";
import { queueMirror, type MirrorRole } from "@/lib/sharepoint";

type QuickOp =
  | "auto-fix"
  | "brighten"
  | "darken"
  | "sharpen"
  | "upscale-2x"
  | "saturate"
  | "desaturate"
  | "grayscale";

const ALL_OPS: ReadonlyArray<QuickOp> = [
  "auto-fix", "brighten", "darken", "sharpen", "upscale-2x", "saturate", "desaturate", "grayscale",
];

const VALID_ROLES = new Set<MirrorRole>(["cover", "body", "gallery", "thumb"]);

/**
 * Apply a single quick-fix op. Returns the working buffer post-op so
 * processImageBuffer can run the editorial baseline + EXIF strip + brand
 * stamp on top. We do NOT call applyEditorialBaseline here directly
 * because processImageBuffer is the canonical pipeline + handles alpha.
 */
async function applyOp(input: Buffer, op: QuickOp): Promise<Buffer> {
  let s = sharp(input).rotate();
  switch (op) {
    case "auto-fix":
      // Aggressive variant of the baseline. Pulls deeper into the
      // shadows + sharper USM. Use when the default baseline didn't
      // quite get there (typical dark district stringer shots).
      s = s.normalize({ lower: 0.5, upper: 99.5 }).sharpen({ sigma: 1.8 });
      break;
    case "brighten":
      s = s.modulate({ brightness: 1.15 });
      break;
    case "darken":
      s = s.modulate({ brightness: 0.85 });
      break;
    case "sharpen":
      s = s.sharpen({ sigma: 2.0 });
      break;
    case "upscale-2x": {
      // 2x lanczos3 - editorial use rarely needs more. AI is genuinely
      // better at 4x+ but we don't reach for that very often.
      const meta = await s.metadata();
      const targetW = (meta.width || 1) * 2;
      // The downstream maxWidth (1600 in processImageBuffer) clamps the
      // final dimensions so a 1200-wide source upscales to 2400 here
      // then resamples down to 1600. Net effect = mild sharpen-ish
      // restoration. We accept that — it's still better than the
      // original on a hero-sized render.
      s = s.resize({ width: targetW, kernel: "lanczos3" });
      break;
    }
    case "saturate":
      s = s.modulate({ saturation: 1.20 });
      break;
    case "desaturate":
      s = s.modulate({ saturation: 0.75 });
      break;
    case "grayscale":
      s = s.grayscale();
      break;
  }
  return s.toBuffer();
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"]);
  if (isAuthError(session)) return session;
  if (!blobConfigured()) {
    return NextResponse.json({ error: "Image storage isn't set up." }, { status: 503 });
  }

  try {
    const { url, op, contentId, role } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url required" }, { status: 400 });
    }
    if (!ALL_OPS.includes(op as QuickOp)) {
      return NextResponse.json({ error: `op must be one of ${ALL_OPS.join(", ")}` }, { status: 400 });
    }

    // Same SSRF guard as /api/images/process — block 127.0.0.1, cloud
    // metadata, DNS rebinds, etc.
    const safety = await isUrlSafeToFetch(url);
    if (!safety.safe) {
      return NextResponse.json({ error: "Refusing to fetch that URL." }, { status: 400 });
    }

    // Pull source. 20 MB cap so a runaway request can't OOM the box.
    const src = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RayalaseemaNews/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!src.ok) {
      return NextResponse.json({ error: "Couldn't load the current image." }, { status: 502 });
    }
    const ct = (src.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (!ct.startsWith("image/")) {
      return NextResponse.json({ error: "The current file isn't an image." }, { status: 400 });
    }
    const inBuf = Buffer.from(await src.arrayBuffer());
    if (inBuf.length === 0 || inBuf.length > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "Image too big (>20 MB)." }, { status: 400 });
    }

    // Run the op then the canonical pipeline. The pipeline re-applies
    // the editorial baseline (normalize + saturation + sharpen) so the
    // output is brand-consistent regardless of which op the editor ran.
    const rawOut = await applyOp(inBuf, op as QuickOp);
    const processed = await processImageBuffer(rawOut);
    const hosted = await uploadBuffer(processed.buffer, processed.ext, processed.contentType);

    // Mirror the new blob to SP. Caller's role (defaults to cover) +
    // contentId thread article context.
    const mirrorRole: MirrorRole = VALID_ROLES.has(role as MirrorRole)
      ? (role as MirrorRole)
      : "cover";
    void queueMirror({
      blobUrl: hosted,
      contentId: typeof contentId === "string" ? contentId : null,
      role: mirrorRole,
      mimeType: processed.contentType,
      sizeBytes: processed.buffer.length,
    }).catch((e) => console.warn("[images/quick-fix] sp mirror enqueue failed:", e));

    return NextResponse.json({ url: hosted, op, bytes: processed.buffer.length });
  } catch (e: any) {
    console.error("[images/quick-fix]", e);
    return apiError(e);
  }
}
