// What the editor picked in the panel (spec 4.6), validated before it is
// stored, and finalised (article link, place line, chapters, footer) right
// before publish so the model never has to write URLs.
import { z } from "zod";
import { buildDescription, placeLine, splitTitle, type Place } from "@rayalaseema/youtube";

export const SITE = "https://rayalaseemanews.com";
export const SUBSCRIBE = "https://www.youtube.com/@rayalaseemanewstv?sub_confirmation=1";

export const chosenSchema = z.object({
  title: z.string().min(5).max(100).refine((t) => t.includes(" | "), "title needs 'Telugu hook | English headline'"),
  thumbnailIndex: z.number().int().min(0).nullable(),
  thumbnailUrl: z.string().url().nullable(),
  description: z.string().max(5000),
  tags: z.array(z.string().max(60)).min(5).max(30),
  chapters: z.array(z.object({ start: z.string(), title_te: z.string() })).max(12),
  hashtags: z.array(z.string()).max(5),
  playlists: z.array(z.string()).max(3),
  comment: z.string().max(500).refine((s) => !/https?:\/\//i.test(s), "no URLs in comments"),
  override: z.object({ note: z.string().min(5), by: z.string(), at: z.string(), originalFootage: z.boolean().optional() }).optional(),
}).strict();

export type Chosen = z.infer<typeof chosenSchema>;

// Lines that finalizeChosen itself adds; stripped first so re-finalising is idempotent.
const ADDED_LINE = /^(పూర్తి వార్త:.*|.* News(?: Today)? \| .* న్యూస్ \| .*|రాయలసీమ న్యూస్ \| Rayalaseema News|🌐 .*|సబ్‌స్క్రైబ్ చేయండి:.*|\d{2}:\d{2}(?::\d{2})? .*|#\S+(?: #\S+)*)$/;

export function finalizeChosen(row: { suggestions: { summary_en?: string } | null }, c: Chosen, a: { url: string | null; place: Place | null; today: boolean }): Chosen {
  const lines = c.description.split("\n").map((l) => l.trimEnd());
  const hook = lines[0]?.trim() || splitTitle(c.title).hook;
  const enLine = row.suggestions?.summary_en?.trim() || null;
  const story = lines
    .slice(1)
    .filter((l) => l.trim() !== enLine && !ADDED_LINE.test(l.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const chapters = c.chapters.length ? c.chapters.map((ch) => `${ch.start} ${ch.title_te}`).join("\n") : "";
  const description = buildDescription({
    hook,
    enLine,
    articleUrl: a.url,
    placeLine: placeLine(a.place, a.today),
    story: [story, chapters].filter(Boolean).join("\n\n"),
    hashtags: c.hashtags,
    site: SITE,
    subscribeUrl: SUBSCRIBE,
  });
  return { ...c, description };
}
