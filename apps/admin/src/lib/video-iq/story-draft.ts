// Trending desk → Create story (spec 12.11). Turns a competitor video and its
// topic cluster into a DRAFT prefill: a working title, the title patterns
// winning today, and the own-footage rule in the editor note.

/** Phrases of 2 to 4 words shared by at least two titles, most common and longest first. */
export function titlePatterns(titles: string[]): string[] {
  const grams = new Map<string, number>();
  for (const t of titles) {
    const toks = t.toLowerCase().replace(/[|:,.!?"'()]/g, " ").split(/\s+/).filter(Boolean);
    const seen = new Set<string>();
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i + n <= toks.length; i++) {
        const g = toks.slice(i, i + n).join(" ");
        if (seen.has(g)) continue;
        seen.add(g);
        grams.set(g, (grams.get(g) ?? 0) + 1);
      }
    }
  }
  return [...grams]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([g]) => g)
    .slice(0, 10);
}

export function isLiveTitle(title: string): boolean {
  return /^\s*(🔴\s*)?live\b/i.test(title) || /\blive\s*[:|]/i.test(title.slice(0, 12));
}

export type StoryDraft = { title: string; summary: string; editorNote: string };

export function storyDraftFrom(video: { title: string; towns: string[]; topicKey: string | null }, cluster: { titles: string[] } | null): StoryDraft {
  const town = video.towns[0] ?? "Rayalaseema";
  const lead = video.title.split("|")[0].trim();
  const patterns = cluster ? titlePatterns(cluster.titles) : [];
  const note = [
    `Trending desk lead. Topic: ${video.topicKey ?? "n/a"}. Town: ${town}.`,
    patterns.length ? `Title patterns winning today: ${patterns.slice(0, 5).join(" / ")}.` : "",
    "Own footage only. The competitor video is a reference for the story; never re-upload or clip it.",
  ].filter(Boolean);
  return { title: `${town}: ${lead}`.slice(0, 120), summary: "", editorNote: note.join("\n") };
}
