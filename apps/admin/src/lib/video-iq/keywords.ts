// Keyword intelligence for one video (spec 4.3a): volumes for the English
// phrases the model proposed (30-day cache in KeywordVolume), long-tail ideas
// around the main entity, and who ranks on YouTube for the lead title.
// DataForSEO failures degrade to `unavailable`; the panel still works.
import { splitTitle, type DataForSeo, type KeywordIdea, type KeywordRow, type Suggestions, type YoutubeHit } from "@rayalaseema/youtube";

export type KeywordBlock = { terms: KeywordRow[]; suggested: KeywordIdea[]; serp: YoutubeHit[]; unavailable?: string };

type PrismaLike = {
  keywordVolume: {
    findMany: (a: { where: { term: { in: string[] } } }) => Promise<Array<{ term: string; volume: number | null; competition: string | null; fetchedAt: Date | string }>>;
    upsert: (a: { where: { term: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => Promise<unknown>;
  };
};

const THIRTY_DAYS = 30 * 86400_000;
const MAX_TERMS = 60;

const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ,:\-']/g, " ").replace(/\s+/g, " ").trim();

/** English phrases worth pricing: the English half of each title plus Latin-script tags. */
export function englishTerms(s: Suggestions): string[] {
  const out = new Set<string>();
  for (const t of s.titles) {
    const e = clean(splitTitle(t.text).english);
    if (e) out.add(e);
  }
  for (const tag of s.tags) if (/^[a-z0-9 \-']+$/i.test(tag)) out.add(tag.toLowerCase().trim());
  return [...out].filter(Boolean).slice(0, MAX_TERMS);
}

export async function enrichKeywords(s: Suggestions, deps: { prisma: PrismaLike; dfs: DataForSeo | null; now?: Date }): Promise<KeywordBlock> {
  const now = deps.now ?? new Date();
  const terms = englishTerms(s);
  const cached = await deps.prisma.keywordVolume.findMany({ where: { term: { in: terms } } });
  const fresh = new Map(
    cached.filter((r) => now.getTime() - new Date(r.fetchedAt).getTime() < THIRTY_DAYS).map((r) => [r.term, r] as const),
  );
  const missing = terms.filter((t) => !fresh.has(t));
  const block: KeywordBlock = {
    terms: terms.map((t) => ({ term: t, volume: fresh.get(t)?.volume ?? null, competition: fresh.get(t)?.competition ?? null })),
    suggested: [],
    serp: [],
  };
  if (!deps.dfs) {
    block.unavailable = "DataForSEO not configured";
    return block;
  }
  try {
    if (missing.length) {
      for (const r of await deps.dfs.searchVolume(missing)) {
        const term = r.term.toLowerCase();
        await deps.prisma.keywordVolume.upsert({
          where: { term },
          create: { term, volume: r.volume, competition: r.competition, fetchedAt: now },
          update: { volume: r.volume, competition: r.competition, fetchedAt: now },
        });
        const slot = block.terms.find((t) => t.term === term);
        if (slot) {
          slot.volume = r.volume;
          slot.competition = r.competition;
        }
      }
    }
    const seed = s.entities.people[0] ?? s.entities.places[0];
    if (seed) {
      const ideas = [...(await deps.dfs.suggestions(seed, 20)), ...(await deps.dfs.related(seed, 10))];
      const seen = new Set<string>();
      block.suggested = ideas.filter((x) => x.term && !seen.has(x.term) && (seen.add(x.term), true)).slice(0, 25);
    }
    block.serp = await deps.dfs.youtubeSerp(splitTitle(s.titles[0].text).english || s.summary_en);
  } catch (e) {
    block.unavailable = String((e as Error).message).slice(0, 200);
  }
  return block;
}
