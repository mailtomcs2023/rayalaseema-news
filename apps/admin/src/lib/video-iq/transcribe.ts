// Speech-to-text for Video IQ.
//
// BLOB source: Azure Speech fast transcription (synchronous REST, te-IN) with
// a phrase list of Rayalaseema place and people names so proper nouns come
// back spelled the way the desk writes them.
//
// YOUTUBE source (back catalog): download the Telugu caption track YouTube
// already generated; null until that track exists.
import { parseSrt, type Segment, type YouTubeClient } from "@rayalaseema/youtube";

export type Transcript = { locale: string; durationSec: number; segments: Segment[]; words?: number };

const countWords = (segments: Segment[]) => segments.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);

export function plainText(t: Transcript): string {
  return t.segments.map((s) => s.text).join(" ").replace(/\s+/g, " ").trim();
}

export async function transcribeAudio(mp3: Uint8Array, opts: { phrases: string[]; fetchImpl?: typeof fetch }): Promise<Transcript> {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION || "centralindia";
  if (!key) throw new Error("AZURE_SPEECH_KEY not configured");

  const fd = new FormData();
  const audio = new Uint8Array(mp3).buffer as ArrayBuffer;
  fd.append("audio", new Blob([audio], { type: "audio/mpeg" }), "audio.mp3");
  fd.append("definition", JSON.stringify({
    locales: ["te-IN"],
    profanityFilterMode: "None",
    phraseList: { phrases: opts.phrases.slice(0, 500) },
  }));

  const res = await (opts.fetchImpl ?? fetch)(
    `https://${region}.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15`,
    { method: "POST", headers: { "Ocp-Apim-Subscription-Key": key }, body: fd, signal: AbortSignal.timeout(300_000) },
  );
  if (!res.ok) throw new Error(`speech transcription failed: ${res.status} ${(await res.text()).slice(0, 300)}`);

  const j = (await res.json()) as {
    durationMilliseconds: number;
    phrases: Array<{ offsetMilliseconds: number; durationMilliseconds: number; text: string }>;
  };
  const segments = (j.phrases ?? [])
    .map((p) => ({ start: p.offsetMilliseconds / 1000, end: (p.offsetMilliseconds + p.durationMilliseconds) / 1000, text: p.text.trim() }))
    .filter((s) => s.text);
  return { locale: "te-IN", durationSec: j.durationMilliseconds / 1000, segments, words: countWords(segments) };
}

type CaptionClient = Pick<YouTubeClient, "listCaptions" | "downloadCaption">;

export async function transcriptFromCaptions(client: CaptionClient, videoId: string): Promise<Transcript | null> {
  const tracks = await client.listCaptions(videoId);
  const te = tracks.find((t: any) => t.snippet?.language === "te" && t.snippet?.trackKind !== "asr")
    ?? tracks.find((t: any) => t.snippet?.language === "te");
  if (!te) return null;
  const segments = parseSrt(await client.downloadCaption(te.id));
  const durationSec = segments.length ? segments[segments.length - 1].end : 0;
  return { locale: "te-IN", durationSec, segments, words: countWords(segments) };
}
