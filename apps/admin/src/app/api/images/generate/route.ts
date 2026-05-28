// POST /api/images/generate { prompt } - generate a news-photo image via
// Azure OpenAI gpt-image-2 (sweden central). Decodes the b64 response,
// runs it through the same EXIF-strip + RE-copyright pipeline as every
// other image surface, uploads to Azure Blob, returns the hosted URL.
//
// Use case: editors searching for "Pawan Kalyan at rally" find no Pexels
// match (no stock photo of named politicians) and Google CSE is paid;
// AI generation produces a photojournalism-style image instead.
//
// Cost: gpt-image-2 ~$0.04 per 1024x1024. Free for the first ~10K
// images/month on the Azure pay-as-you-go tier.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-utils";
import { processImageBuffer } from "@/lib/image-process";
import { uploadBuffer, blobConfigured } from "@/lib/blob";

const ENDPOINT = process.env.AZURE_IMAGES_ENDPOINT;
const KEY = process.env.AZURE_IMAGES_KEY;
const DEPLOYMENT = process.env.AZURE_IMAGES_DEPLOYMENT || "gpt-image";
const API_VERSION = process.env.AZURE_IMAGES_API_VERSION || "2025-04-01-preview";

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR", "CHIEF_SUB_EDITOR", "SUB_EDITOR", "REPORTER"]);
  if (isAuthError(session)) return session;
  if (!ENDPOINT || !KEY) {
    return NextResponse.json({
      error: "AZURE_IMAGES_ENDPOINT / AZURE_IMAGES_KEY not configured",
    }, { status: 503 });
  }
  if (!blobConfigured()) {
    return NextResponse.json({ error: "AZURE_STORAGE_CONNECTION_STRING not configured" }, { status: 503 });
  }
  try {
    const { prompt, size } = await req.json();
    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 5) {
      return NextResponse.json({ error: "Prompt required (min 5 chars)" }, { status: 400 });
    }
    if (prompt.length > 1000) {
      return NextResponse.json({ error: "Prompt too long (max 1000 chars)" }, { status: 400 });
    }

    // Aspect: 1024x1024 default. Editor's featured-image crop is 16:9 so
    // 1792x1024 is the better preset; the modal exposes the choice.
    const allowedSizes = ["1024x1024", "1792x1024", "1024x1792"];
    const reqSize = typeof size === "string" && allowedSizes.includes(size) ? size : "1792x1024";

    // Encourage news-photo / photojournalism register - avoids the cartoon
    // / sketchy default style most image models drift toward. The model
    // honours these adjectives reliably enough that we don't need a
    // dedicated system prompt.
    const enhancedPrompt = `${prompt.trim()} - photojournalism style, news photography, realistic, no text overlay, no watermark, no logos`;

    const res = await fetch(
      `${ENDPOINT}openai/deployments/${DEPLOYMENT}/images/generations?api-version=${API_VERSION}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": KEY },
        body: JSON.stringify({
          prompt: enhancedPrompt,
          size: reqSize,
          n: 1,
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      console.error("[images/generate] Azure OpenAI", res.status, body.slice(0, 500));
      return NextResponse.json({
        error: `Image generation failed (${res.status})`,
        detail: body.slice(0, 300),
      }, { status: 502 });
    }
    const data = await res.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json({ error: "No image returned by model" }, { status: 502 });
    }

    // Decode → strip any embedded metadata + stamp RE copyright → rehost.
    const rawBuf = Buffer.from(b64, "base64");
    const processed = await processImageBuffer(rawBuf);
    const url = await uploadBuffer(processed.buffer, processed.ext, processed.contentType);

    return NextResponse.json({
      url,
      size: processed.buffer.length,
      revisedPrompt: data?.data?.[0]?.revised_prompt || undefined,
    });
  } catch (e: any) {
    console.error("[images/generate]", e);
    return NextResponse.json({ error: e?.message || "Generation failed" }, { status: 500 });
  }
}
