// Trending desk math (spec 12.11): how fast a competitor video is moving,
// how unusual that is for its channel, and a key that groups the same story
// across channels.
import { canonicalizeNames, PEOPLE } from "./people";
import { PLACES } from "./places";

/** Views per hour since publish, with a 15 minute floor so fresh uploads do not explode. */
export function velocity(views: number, publishedAt: Date, now: Date): number {
  const hours = Math.max(0.25, (now.getTime() - publishedAt.getTime()) / 36e5);
  return Math.round(views / hours);
}

/** views ÷ median views of the channel's videos of similar age (±50%); 1 when nothing to compare. */
export function outlier(views: number, ageHours: number, history: Array<{ views: number; ageHours: number }>): number {
  const similar = history
    .filter((h) => h.ageHours >= ageHours * 0.5 && h.ageHours <= ageHours * 1.5)
    .map((h) => h.views)
    .sort((a, b) => a - b);
  if (!similar.length) return 1;
  const median = similar[Math.floor(similar.length / 2)];
  return median > 0 ? views / median : 1;
}

const STOP = new Set([
  "news", "live", "today", "breaking", "latest", "telugu", "tv", "updates", "update", "video", "the", "on", "in", "of", "to", "and",
  "vs", "at", "with", "for", "by", "ap", "big", "strong", "warning", "sensational", "comments", "fire", "over", "about", "after",
  "row", "shocking", "full", "exclusive", "speech", "press", "meet", "reaction", "react", "reacts", "says", "said", "slams",
]);

/** Names and places first (canonical), then the strongest content tokens; sorted so order of mention does not matter. */
export function topicKey(title: string): string {
  const canonical = canonicalizeNames(title);
  const lower = canonical.toLowerCase();
  const names = new Set<string>();
  for (const p of PEOPLE) if (canonical.includes(p.te) || lower.includes(p.en.toLowerCase()) || p.aliases.some((a) => canonical.includes(a))) names.add(p.en.toLowerCase());
  for (const p of PLACES) if (canonical.includes(p.te) || lower.includes(p.en.toLowerCase())) names.add(p.en.toLowerCase());
  const nameText = [...names].join(" ");
  const tokens = lower
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !nameText.includes(w));
  // Two or more canonical names identify a story on their own; one name
  // needs a topic word; no names fall back to the three strongest tokens.
  const need = names.size >= 2 ? 0 : names.size === 1 ? 1 : 3;
  const key = [...names, ...tokens.slice(0, need)];
  return key.sort().slice(0, 3).join("+");
}
