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
      .replace(/Source:.*$/s, "") // Remove source attribution
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 5000);

    if (cleanText.length < 10) {
      return NextResponse.json({ error: "No readable text" }, { status: 400 });
    }

    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="te-IN">
      <voice name="te-IN-ShrutiNeural">
        <mstts:express-as style="newscast-formal" styledegree="2">
          ${escapeXml(cleanText)}
        </mstts:express-as>
      </voice>
    </speak>`;

    const res = await fetch(
      `https://${SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": SPEECH_KEY,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
        },
        body: ssml,
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("Azure TTS error:", err);
      return NextResponse.json({ error: "TTS generation failed" }, { status: 500 });
    }

    const audioBuffer = await res.arrayBuffer();

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400", // Cache 24 hours
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
