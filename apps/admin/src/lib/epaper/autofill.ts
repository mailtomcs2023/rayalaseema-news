// Auto-fill engine for the e-paper v2.
//
// Given today's published articles + a template's block layout, score each
// article against every story slot and greedily assign the best-scoring
// article to each slot (without reusing an article).
//
// Story-bearing block types: lead, major, secondary, brief. Other block
// types (masthead, section-band, ad, image, text, story-jump) are skipped.

import { prisma } from "@rayalaseema/db";

export interface BlockSlot {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  slotFilter?: {
    categorySlug?: string;
    districtSlug?: string;
    minImages?: number;
    minWords?: number;
    maxWords?: number;
    breaking?: boolean;
  };
  // Filled by autofill
  articleId?: string;
  // Operator-locked → autofill should not overwrite
  locked?: boolean;
}

export interface AutofillInput {
  templateSlug: string;
  templateLayout: { blocks: BlockSlot[] };
  // Template-level filter (e.g. district-kurnool → only kurnool district articles)
  templateRules?: Record<string, unknown>;
  // Articles already used by other pages of the same edition (avoid duplicates).
  excludeArticleIds?: Set<string>;
}

const STORY_TYPES = new Set(["lead", "major", "secondary", "brief"]);

const SLOT_TYPE_PRIORITY: Record<string, number> = {
  // Higher priority slots get filled first
  lead: 100,
  major: 70,
  secondary: 40,
  brief: 10,
};

interface ScoredArticle {
  id: string;
  title: string;
  summary: string | null;
  categorySlug: string;
  districtSlug: string | null;
  hasImage: boolean;
  wordCount: number;
  breaking: boolean;
  featured: boolean;
  publishedAt: Date | null;
  viewCount: number;
}

async function loadCandidatePool(input: AutofillInput): Promise<ScoredArticle[]> {
  // PUBLISHED articles from the last 7 days. Earlier the window was 24h but
  // editorial-light days (no fresh publishes overnight) left every block
  // empty; 7 days gives the engine real ammunition. The scoring function
  // still rewards freshness so today's articles win when they exist.
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const where: Record<string, unknown> = {
    status: "PUBLISHED",
    publishedAt: { gte: since },
  };
  // Honor template-level rules where possible at the DB level for perf.
  if (input.templateRules?.categorySlug) {
    (where as Record<string, unknown>).category = { slug: input.templateRules.categorySlug };
  }
  if (input.templateRules?.districtSlug) {
    (where as Record<string, unknown>).constituency = {
      district: { slug: input.templateRules.districtSlug },
    };
  }

  const rows = await prisma.article.findMany({
    where: where as any,
    select: {
      id: true,
      title: true,
      summary: true,
      body: true,
      featuredImage: true,
      breaking: true,
      featured: true,
      publishedAt: true,
      viewCount: true,
      category: { select: { slug: true } },
      constituency: { select: { district: { select: { slug: true } } } },
    },
    orderBy: { publishedAt: "desc" },
    take: 500,
  });

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    categorySlug: r.category.slug,
    districtSlug: r.constituency?.district.slug ?? null,
    hasImage: !!r.featuredImage,
    wordCount: (r.body || "").replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length,
    breaking: r.breaking,
    featured: r.featured,
    publishedAt: r.publishedAt,
    viewCount: r.viewCount,
  }));
}

/**
 * Score how well an article fits a slot. Higher = better. Negative = disqualified.
 * Hard filters are checked first; soft preferences add to score.
 */
function scoreFit(slot: BlockSlot, a: ScoredArticle): number {
  const f = slot.slotFilter || {};

  // Hard disqualifiers
  if (f.categorySlug && f.categorySlug !== a.categorySlug) return -1;
  if (f.districtSlug && f.districtSlug !== a.districtSlug) return -1;
  if (f.minImages && f.minImages > 0 && !a.hasImage) return -1;
  if (f.minWords && a.wordCount < f.minWords) return -1;
  if (f.maxWords && a.wordCount > f.maxWords) return -1;
  if (f.breaking && !a.breaking) return -1;

  let s = 0;

  // Slot type preferences
  switch (slot.type) {
    case "lead":
      s += a.featured ? 30 : 0;
      s += a.breaking ? 25 : 0;
      s += a.hasImage ? 20 : 0;
      s += Math.min(a.wordCount / 50, 15);  // longer copy fills lead
      break;
    case "major":
      s += a.hasImage ? 15 : 0;
      s += Math.min(a.wordCount / 80, 10);
      break;
    case "secondary":
      s += a.hasImage ? 8 : 0;
      s += a.wordCount > 100 && a.wordCount < 600 ? 5 : 0;
      break;
    case "brief":
      s += a.wordCount > 50 && a.wordCount < 250 ? 8 : 0; // shorter copy fits briefs
      break;
  }

  // Universal soft factors
  s += Math.min(a.viewCount / 100, 10);    // popularity nudge, cap at +10
  if (a.publishedAt) {
    const hoursOld = (Date.now() - a.publishedAt.getTime()) / 3600_000;
    s += Math.max(0, 10 - hoursOld);       // freshness bonus, decays over 10h
  }

  return s;
}

export interface AutofillResult {
  blocks: BlockSlot[];
  filledCount: number;
  unfilledSlotIds: string[];
  usedArticleIds: Set<string>;
}

/**
 * Run greedy auto-fill on a template's layout.
 *  - Story-bearing slots (lead/major/secondary/brief) get their `articleId` set.
 *  - Locked slots are left untouched, but their articleId is added to the used set.
 *  - Other block types pass through unchanged.
 */
export async function autofillTemplate(input: AutofillInput): Promise<AutofillResult> {
  const pool = await loadCandidatePool(input);
  const used = new Set<string>(input.excludeArticleIds || []);
  // Preserve any already-locked assignments
  for (const b of input.templateLayout.blocks) {
    if (b.locked && b.articleId) used.add(b.articleId);
  }

  // Sort slots by priority — fill leads before briefs so leads get pick of pool.
  const storySlots = input.templateLayout.blocks
    .filter((b) => STORY_TYPES.has(b.type) && !b.locked)
    .sort((a, b) => (SLOT_TYPE_PRIORITY[b.type] ?? 0) - (SLOT_TYPE_PRIORITY[a.type] ?? 0));

  const unfilled: string[] = [];
  let filled = 0;

  for (const slot of storySlots) {
    let bestArticle: ScoredArticle | null = null;
    let bestScore = -1;
    for (const a of pool) {
      if (used.has(a.id)) continue;
      const score = scoreFit(slot, a);
      if (score > bestScore) {
        bestScore = score;
        bestArticle = a;
      }
    }
    if (bestArticle && bestScore >= 0) {
      slot.articleId = bestArticle.id;
      used.add(bestArticle.id);
      filled++;
    } else {
      slot.articleId = undefined;
      unfilled.push(slot.id);
    }
  }

  return {
    blocks: input.templateLayout.blocks,
    filledCount: filled,
    unfilledSlotIds: unfilled,
    usedArticleIds: used,
  };
}
