import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// POST /api/epaper/smart-crop
// Body: { imageUrl: string, aspectRatio?: number }
// Calls Azure Computer Vision "areaOfInterest" to return a crop rectangle
// centered on the detected subject/face. Returns 0..1 fractional rect.
//
// Requires env: AZURE_VISION_ENDPOINT + AZURE_VISION_KEY
// (separate from the OpenAI deployment used elsewhere).
//
// Returns 503 if not configured so the editor can degrade gracefully and
// show a "smart-crop disabled — set AZURE_VISION_KEY" notice instead of a
// silent failure.

const ENDPOINT = process.env.AZURE_VISION_ENDPOINT;
const KEY = process.env.AZURE_VISION_KEY;

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "CHIEF_SUB_EDITOR", "SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  if (!ENDPOINT || !KEY) {
    return NextResponse.json({
      error: "Smart crop disabled",
      detail: "Set AZURE_VISION_ENDPOINT + AZURE_VISION_KEY env vars (separate Azure Computer Vision resource).",
    }, { status: 503 });
  }
  try {
    const body = await req.json();
    const imageUrl = body?.imageUrl as string;
    if (!imageUrl) return NextResponse.json({ error: "imageUrl required" }, { status: 400 });

    // Azure Vision REST: POST /vision/v3.2/areaOfInterest
    // Body: { url: "<image url>" } with Ocp-Apim-Subscription-Key header.
    const url = `${ENDPOINT.replace(/\/$/, "")}/vision/v3.2/areaOfInterest`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Ocp-Apim-Subscription-Key": KEY },
      body: JSON.stringify({ url: imageUrl }),
    });
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: "Azure Vision call failed", azure: res.status, detail: err.slice(0, 300) }, { status: 502 });
    }
    const data = await res.json();
    // Azure returns { areaOfInterest: { x, y, w, h }, metadata: { width, height } }
    const aoi = data?.areaOfInterest;
    const meta = data?.metadata;
    if (!aoi || !meta?.width || !meta?.height) {
      return NextResponse.json({ error: "Unexpected Azure response" }, { status: 502 });
    }
    return NextResponse.json({
      crop: {
        x: aoi.x / meta.width,
        y: aoi.y / meta.height,
        w: aoi.w / meta.width,
        h: aoi.h / meta.height,
      },
      meta: { width: meta.width, height: meta.height },
    });
  } catch (e) {
    return apiError(e);
  }
}
