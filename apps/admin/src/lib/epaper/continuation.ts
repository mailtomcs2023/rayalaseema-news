// Auto text-continuation: detect lead/major blocks whose article body
// exceeds the visible capacity of the block and allocate continuation slots
// on later pages. Runs as a post-process after autofill, mutating the per-page
// layout JSON so the renderer just emits what it sees.

import { prisma } from "@rayalaseema/db";

export interface Block {
  id: string;
  type: string;
  x: number; y: number; w: number; h: number;
  articleId?: string | null;
  locked?: boolean;
  content?: string;
  href?: string;
  // Continuation metadata - set on BOTH source and continuation blocks.
  // Source block: { continuesToPage, continuesToBlockId }
  // Continuation block: { continuesFromPage, continuesFromBlockId, bodyStart, articleId (same article) }
  continuesToPage?: number;
  continuesToBlockId?: string;
  continuesFromPage?: number;
  continuesFromBlockId?: string;
  bodyStart?: number;
}

interface PageBundle {
  id: string;
  pageNumber: number;
  blocks: Block[];
}

/**
 * Estimate how many characters of plain-text body fit visibly in a story block.
 * Numbers are empirical for the broadsheet render grid (1480×2760 px, 92px rows,
 * 12 cols). Headline-only blocks (secondary/brief) return 0 - they can't host a
 * continuation tail.
 */
export function estimateCapacity(b: Block): number {
  const area = b.w * b.h;     // rough proxy for total area in grid cells
  switch (b.type) {
    case "lead": {
      // Body sits below the photo, runs as 2-column justified dek.
      // ~5 chars per cell unit for body copy after subtracting headline + image area.
      return Math.max(400, area * 18 - 600);
    }
    case "major": {
      return Math.max(150, area * 10 - 100);
    }
    // Continuation slots themselves can host more body. Treat them generously.
    case "continuation": {
      return area * 25;
    }
    case "secondary":
    case "brief":
    default:
      return 0;
  }
}

function stripHtml(s: string): string {
  return s
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Find a Telugu/English sentence boundary close to `target` chars. */
export function findSplit(text: string, target: number): number {
  if (text.length <= target) return text.length;
  // Look forward then backward for "। " (devanagari/Indic full stop), ". ",
  // "? ", "! " near the target.
  const candidates = [/। /g, /\. /g, /\? /g, /! /g];
  let best = target;
  for (const re of candidates) {
    re.lastIndex = Math.max(0, target - 200);
    const m = re.exec(text);
    if (m && Math.abs(m.index - target) < Math.abs(best - target)) best = m.index + m[0].length;
  }
  // Fall back to last space within target.
  if (best === target) {
    const sp = text.lastIndexOf(" ", target);
    if (sp > target - 200) best = sp + 1;
  }
  return Math.min(best, text.length);
}

/**
 * Walk every page of an edition and:
 *   1. For each lead/major block whose article body length > estimateCapacity,
 *      look for the next EMPTY secondary/brief slot on a LATER page.
 *   2. Convert that empty slot to a `continuation` block, copy the
 *      articleId across, set bodyStart to where the source was clipped, and
 *      wire `continuesToPage`/`continuesFromPage` cross-references.
 *
 * Returns the number of continuations created.
 */
export async function buildContinuations(editionId: string): Promise<number> {
  const pages = (await prisma.epaperPage.findMany({
    where: { editionId },
    orderBy: { pageNumber: "asc" },
    select: { id: true, pageNumber: true, layout: true },
  })).map((p) => ({
    id: p.id,
    pageNumber: p.pageNumber,
    blocks: ((p.layout as unknown as { blocks: Block[] }) ?? { blocks: [] }).blocks,
  })) as PageBundle[];

  // Collect every distinct articleId on every lead/major.
  const articleIds = new Set<string>();
  for (const p of pages) {
    for (const b of p.blocks) {
      if ((b.type === "lead" || b.type === "major") && b.articleId) {
        articleIds.add(b.articleId);
      }
    }
  }
  if (articleIds.size === 0) return 0;

  // Pull body lengths only - keep payload tiny. (Spec #1 #133 → Content.)
  const bodies = await prisma.content.findMany({
    where: { id: { in: [...articleIds] }, type: "ARTICLE" },
    select: { id: true, body: true },
  });
  const bodyLen = new Map<string, number>();
  for (const a of bodies) bodyLen.set(a.id, stripHtml(a.body || "").length);

  // Walk pages in order; allocate continuation slots from later pages.
  // Cursor tracks the next page index we're allowed to consume slots from.
  let created = 0;
  const dirtyPages = new Set<string>();

  for (let pi = 0; pi < pages.length; pi++) {
    const p = pages[pi];
    for (const b of p.blocks) {
      if (b.continuesToPage) continue; // already wired
      if (b.type !== "lead" && b.type !== "major") continue;
      if (!b.articleId) continue;
      const cap = estimateCapacity(b);
      const total = bodyLen.get(b.articleId) ?? 0;
      if (total <= cap) continue;

      // Find a target slot on a later page: empty secondary/brief that
      // ISN'T itself already a continuation.
      let target: { page: PageBundle; block: Block } | null = null;
      for (let qi = pi + 1; qi < pages.length && !target; qi++) {
        const q = pages[qi];
        for (const cb of q.blocks) {
          if ((cb.type === "secondary" || cb.type === "brief")
            && !cb.articleId
            && !cb.locked
            && !cb.continuesFromPage) {
            target = { page: q, block: cb };
            break;
          }
        }
      }
      if (!target) continue; // no room to continue; renderer will just clip

      // Wire both sides
      b.continuesToPage = target.page.pageNumber;
      b.continuesToBlockId = target.block.id;

      target.block.type = "continuation";
      target.block.articleId = b.articleId;
      target.block.continuesFromPage = p.pageNumber;
      target.block.continuesFromBlockId = b.id;
      target.block.bodyStart = findSplit(stripHtml((bodies.find((x) => x.id === b.articleId)?.body) || ""), cap);

      dirtyPages.add(p.id);
      dirtyPages.add(target.page.id);
      created++;
    }
  }

  if (created === 0) return 0;

  // Persist mutated pages
  for (const p of pages) {
    if (!dirtyPages.has(p.id)) continue;
    await prisma.epaperPage.update({
      where: { id: p.id },
      data: { layout: { blocks: p.blocks } as any },
    });
  }
  return created;
}
