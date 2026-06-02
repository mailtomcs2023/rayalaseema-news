// POST /api/images/enhance { url, op } - AI image edit via Azure OpenAI
// gpt-image-2's /images/edits endpoint. Downloads the source image, sends
// it + a per-operation prompt to the model, runs the output through the
// same EXIF-strip + RE-stamp pipeline as every other image surface,
// rehosts on Azure Blob, returns the new URL.
//
// Operations:
//   remove-watermark - strip logos, source attributions, channel bugs
//   enhance          - sharpen / restore detail / fix exposure
//   upscale          - 2x resolution while preserving content
//   restore          - fix old / blurry / damaged photos
//
// Cost: gpt-image-2 edits ~$0.06 per 1024x1024 image. Same Azure resource
// as /api/images/generate.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-utils";
import { processImageBuffer } from "@/lib/image-process";
import { uploadBuffer, blobConfigured } from "@/lib/blob";
import { isUrlSafeToFetch } from "@/lib/ssrf-guard";

const ENDPOINT = process.env.AZURE_IMAGES_ENDPOINT;
const KEY = process.env.AZURE_IMAGES_KEY;
const DEPLOYMENT = process.env.AZURE_IMAGES_DEPLOYMENT || "gpt-image";
const API_VERSION = process.env.AZURE_IMAGES_API_VERSION || "2025-04-01-preview";

const OP_PROMPTS: Record<string, string> = {
  "remove-watermark": "Remove all watermarks, logos, channel bugs, source attributions, and overlay text from this image. Preserve the underlying photograph exactly - same subjects, same composition, same colors. Output a clean photojournalism-quality image suitable for newspaper publication.",
  "enhance": "Enhance this photograph for newspaper publication: improve sharpness, restore detail, correct exposure if needed, reduce noise. Preserve all content exactly - same subjects, framing, colors. Output a clean photojournalism-quality result.",
  "upscale": "Upscale this image to higher resolution while preserving all detail and content. Same subjects, same composition, same colors. Output a sharp photojournalism-quality image.",
  "restore": "Restore this damaged or low-quality photograph. Fix blur, scratches, fading, color casts. Preserve all subjects + composition exactly. Output a clean photojournalism-quality result suitable for newspaper publication.",
};

const ALLOWED_OPS = Object.keys(OP_PROMPTS);

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"]);
  if (isAuthError(session)) return session;
  if (!ENDPOINT || !KEY) {
    return NextResponse.json({ error: "AZURE_IMAGES_ENDPOINT / AZURE_IMAGES_KEY not configured" }, { status: 503 });
  }
  if (!blobConfigured()) {
    return NextResponse.json({ error: "AZURE_STORAGE_CONNECTION_STRING not configured" }, { status: 503 });
  }
  try {
    const { url, op, customPrompt } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url required" }, { status: 400 });
    }
    const opKey = typeof op === "string" ? op : "enhance";
    if (!ALLOWED_OPS.includes(opKey) && !customPrompt) {
      return NextResponse.json({ error: `op must be one of ${ALLOWED_OPS.join(", ")} (or pass customPrompt)` }, { status: 400 });
    }

    // SSRF guard - same one /api/images/process uses.
    const safety = await isUrlSafeToFetch(url);
    if (!safety.safe) {
      return NextResponse.json({ error: `Refusing to fetch: ${safety.reason}` }, { status: 400 });
    }

    // Download the source image into memory.
    const srcRes = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RayalaseemaNews/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!srcRes.ok) {
      return NextResponse.json({ error: `Source fetch ${srcRes.status}` }, { status: 502 });
    }
    const ct = (srcRes.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!ct.startsWith("image/")) {
      return NextResponse.json({ error: `Source returned non-image content-type "${ct}"` }, { status: 400 });
    }
    const srcBuf = Buffer.from(await srcRes.arrayBuffer());
    if (srcBuf.length === 0 || srcBuf.length > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "Source image empty or >20MB" }, { status: 400 });
    }

    const prompt = typeof customPrompt === "string" && customPrompt.length >= 10
      ? customPrompt.slice(0, 1000)
      : OP_PROMPTS[opKey];

    // Azure OpenAI image edits - multipart/form-data with `image` + `prompt`.
    // The model accepts JPEG / PNG / WebP. gpt-image-2 returns b64.
    const form = new FormData();
    const ext = ct === "image/png" ? "png" : ct === "image/webp" ? "webp" : "jpg";
    form.append("image", new Blob([new Uint8Array(srcBuf)], { type: ct }), `source.${ext}`);
    form.append("prompt", prompt);
    form.append("size", "1024x1024");
    form.append("n", "1");

    const editRes = await fetch(
      `${ENDPOINT}openai/deployments/${DEPLOYMENT}/images/edits?api-version=${API_VERSION}`,
      {
        method: "POST",
        headers: { "api-key": KEY },
        body: form,
      },
    );
    if (!editRes.ok) {
      const body = await editRes.text();
      console.error("[images/enhance] Azure", editRes.status, body.slice(0, 500));
      return NextResponse.json({
        error: `Image edit failed (${editRes.status})`,
        detail: body.slice(0, 300),
      }, { status: 502 });
    }
    const data = await editRes.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) return NextResponse.json({ error: "No image returned by model" }, { status: 502 });

    const rawBuf = Buffer.from(b64, "base64");
    const processed = await processImageBuffer(rawBuf);
    const hosted = await uploadBuffer(processed.buffer, processed.ext, processed.contentType);
    return NextResponse.json({ url: hosted, op: opKey, bytes: processed.buffer.length });
  } catch (e: any) {
    console.error("[images/enhance]", e);
    return NextResponse.json({ error: e?.message || "Enhance failed" }, { status: 500 });
  }
}
