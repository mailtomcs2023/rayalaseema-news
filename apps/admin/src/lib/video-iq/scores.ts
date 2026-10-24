// One place that turns stored suggestions + the editor's current choice into
// the scorecard. The worker scores the model's best title at READY; after
// that, Save, Override and Re-price all re-score the chosen metadata here so
// the ring the editor sees is the ring that gets stored.
import { overall, scoreDescription, scoreFit, scoreTags, scoreTitle, type Scores, type TitleContext } from "@rayalaseema/youtube";

type Entities = { people: string[]; places: string[]; parties: string[]; topics: string[] };
const NO_ENTITIES: Entities = { people: [], places: [], parties: [], topics: [] };

export type ScoredChoice = { title: string; description: string; tags: string[]; override?: { originalFootage?: boolean } | null };

export function titleContext(s: any, breaking: boolean): TitleContext {
  const volumes = new Map<string, number | null>((s?.keywords?.terms ?? []).map((k: any) => [String(k.term), k.volume ?? null]));
  return { entities: (s?.entities as Entities | undefined) ?? NO_ENTITIES, breaking, volumes };
}

/** The thumbnail score the worker stored (Shorts need none, so 100). */
export function thumbnailScoreOf(row: { scores?: { thumbnail?: number } | null; suggestions?: { format?: string } | null }): number {
  if (typeof row.scores?.thumbnail === "number") return row.scores.thumbnail;
  return row.suggestions?.format === "SHORT" ? 100 : 0;
}

/** What to score when the editor has not saved a choice yet: the model's best title with its own description and tags. */
export function effectiveChoice(s: any, chosen: ScoredChoice | null | undefined, breaking: boolean): ScoredChoice {
  if (chosen?.title) return chosen;
  const ctx = titleContext(s, breaking);
  const titles: Array<{ text: string }> = s?.titles ?? [];
  const best = titles.map((t) => t.text).sort((a, b) => scoreTitle(b, ctx) - scoreTitle(a, ctx))[0] ?? "";
  return { title: best, description: s?.description ?? "", tags: s?.tags ?? [] };
}

export function scoresFor(s: any, chosen: ScoredChoice, o: { thumbnail: number; breaking: boolean }): Scores {
  const parts = {
    title: scoreTitle(chosen.title, titleContext(s, o.breaking)),
    thumbnail: o.thumbnail,
    description: scoreDescription(chosen.description ?? ""),
    tags: scoreTags(chosen.tags ?? []),
    fit: s?.fit ? scoreFit(s.fit, chosen.override ?? undefined) : 0,
  };
  return { ...parts, overall: overall(parts) };
}

/** Scores for a stored row (chosen or not), as Save / Override / Re-price store them. */
export function scoresForRow(row: { suggestions: any; chosen: any; breaking?: boolean | null; scores?: any }): Scores {
  const breaking = Boolean(row.breaking ?? row.suggestions?.breaking);
  return scoresFor(row.suggestions, effectiveChoice(row.suggestions, row.chosen, breaking), { thumbnail: thumbnailScoreOf(row), breaking });
}
