// SubRip (.srt) parsing for YouTube caption downloads (captions.download
// with tfmt=srt). Timestamps become seconds; multi-line cues are joined.
export type Segment = { start: number; end: number; text: string };

const toSeconds = (s: string): number => {
  const m = s.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000 : 0;
};

export function parseSrt(srt: string): Segment[] {
  const out: Segment[] = [];
  for (const block of srt.replace(/\r/g, "").trim().split(/\n\n+/)) {
    const lines = block.split("\n").filter(Boolean);
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i === -1) continue;
    const [a, b] = lines[i].split("-->");
    const text = lines.slice(i + 1).join(" ").trim();
    if (text) out.push({ start: toSeconds(a), end: toSeconds(b), text });
  }
  return out;
}
