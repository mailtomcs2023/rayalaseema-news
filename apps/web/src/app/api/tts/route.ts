import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

const SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const SPEECH_REGION = process.env.AZURE_SPEECH_REGION || "centralindia";
const VOICE = process.env.AZURE_SPEECH_VOICE || "te-IN-MohanNeural"; // Male Telugu voice

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { maxRequests: 5, windowMs: 60_000, prefix: "tts" }); if (limited) return limited;
  if (!SPEECH_KEY) return NextResponse.json({ error: "TTS service not configured" }, { status: 503 });
  try {
    const { text } = await req.json();
    if (!text || text.length < 5) {
      return NextResponse.json({ error: "Text too short" }, { status: 400 });
    }

    // Clean text - remove HTML, limit to 5000 chars (Azure limit per request)
    const cleanText = text
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/Source:[\s\S]*$/, "") // Remove source attribution
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 5000);

    if (cleanText.length < 10) {
      return NextResponse.json({ error: "No readable text" }, { status: 400 });
    }

    // Telugu neural voices: te-IN-ShrutiNeural (F), te-IN-MohanNeural (M).
    // express-as styles only work for voices that publish them; te-IN doesn't list any
    // supported styles as of the 2026 voice catalog - sending an unsupported style
    // silently returns 200 + empty audio. Use plain <voice> only.
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="te-IN">
      <voice name="${VOICE}">${escapeXml(cleanText)}</voice>
    </speak>`;

    const res = await fetch(
      `https://${SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": SPEECH_KEY,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
          "User-Agent": "rayalaseema-express",
        },
        body: ssml,
      }
    );

    // Diagnostic mode (?diag=1) - emits Azure status + headers WITHOUT leaking the key,
    // so we can debug "200 empty body" cases from the browser.
    const url = new URL(req.url);
    if (url.searchParams.get("diag") === "1") {
      const headersOut: Record<string, string> = {};
      res.headers.forEach((v, k) => { headersOut[k] = v; });
      const buf = await res.arrayBuffer();
      return NextResponse.json({
        azure_status: res.status,
        azure_headers: headersOut,
        azure_body_bytes: buf.byteLength,
        speech_key_len: SPEECH_KEY?.length ?? 0,
        speech_region: SPEECH_REGION,
        voice: VOICE,
        ssml_len: ssml.length,
      });
    }

    if (!res.ok) {
      const err = await res.text();
      console.error(`[TTS] Azure ${res.status}: ${err.slice(0, 400)}`);
      return NextResponse.json({ error: "TTS generation failed", azure: res.status, detail: err.slice(0, 200) }, { status: 502 });
    }

    const audioBuffer = await res.arrayBuffer();

    // Don't cache an empty body - earlier deploys returned 200 + 0 bytes and the 24h
    // public cache-control froze that empty response in nginx/CDN for everyone.
    if (audioBuffer.byteLength === 0) {
      const azureReqId = res.headers.get("x-requestid") || res.headers.get("x-microsoft-cognitiveservices-tts-request-id");
      console.error(`[TTS] Azure returned 200 with empty body. azure-request-id=${azureReqId}, voice=${VOICE}, region=${SPEECH_REGION}, ssml-len=${ssml.length}`);
      return NextResponse.json({ error: "TTS returned empty audio", azureRequestId: azureReqId }, { status: 502 });
    }

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (e: any) {
    console.error("TTS error:", e.message);
    return NextResponse.json({ error: "TTS generation failed" }, { status: 500 });
  }
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
