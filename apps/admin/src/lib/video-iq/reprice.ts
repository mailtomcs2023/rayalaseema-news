// Re-price a run's keyword terms (DataForSEO) after the fact: the run was
// analysed while the server's IP was not whitelisted, so every term sat at
// volume null and the title could not earn its search-term points.
import type { Scores } from "@rayalaseema/youtube";
import type { KeywordBlock } from "./keywords";
import { scoresForRow } from "./scores";

export type RepriceDeps = {
  prisma: { videoOptimization: { update: (a: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown> } };
  enrichKeywords: (s: any, d: { prisma: any; dfs: any }) => Promise<KeywordBlock>;
  dfs: unknown | null;
};

export async function repriceRun(row: any, d: RepriceDeps): Promise<{ keywords: KeywordBlock; scores: Scores }> {
  if (!d.dfs) throw new Error("DataForSEO is not configured on this server");
  if (!row?.suggestions?.titles) throw new Error("run the analysis first; there is nothing to price yet");
  const keywords = await d.enrichKeywords(row.suggestions, { prisma: d.prisma, dfs: d.dfs });
  const suggestions = { ...row.suggestions, keywords };
  const scores = scoresForRow({ ...row, suggestions });
  const priced = keywords.terms.filter((t) => t.volume != null).length;
  const text = keywords.unavailable
    ? `Keywords still unavailable: ${keywords.unavailable}`
    : `Keywords re-priced: ${priced} of ${keywords.terms.length} terms priced, ${keywords.suggested.length} ideas; title now ${scores.title}`;
  const events = [...((row.events as Array<{ at: string; text: string }> | null) ?? []), { at: new Date().toISOString(), text }].slice(-60);
  await d.prisma.videoOptimization.update({ where: { id: row.id }, data: { suggestions, scores, events } });
  return { keywords, scores };
}
