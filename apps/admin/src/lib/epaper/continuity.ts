// Continuity check: detect the same article appearing across more than one
// non-continuation story block within an edition. Run on Render PDF so the
// operator sees a warning before publishing.

import { prisma } from "@rayalaseema/db";

interface Block {
  id: string;
  type: string;
  articleId?: string | null;
  continuesFromPage?: number;
}

export interface DuplicateReport {
  articleId: string;
  title: string;
  placements: Array<{ pageNumber: number; blockId: string; type: string }>;
}

export async function findDuplicateArticles(editionId: string): Promise<DuplicateReport[]> {
  const pages = await prisma.epaperPage.findMany({
    where: { editionId },
    orderBy: { pageNumber: "asc" },
    select: { pageNumber: true, layout: true },
  });

  // article-id → list of placements (excluding continuation blocks, which are
  // legitimate "this article continues here").
  const map = new Map<string, Array<{ pageNumber: number; blockId: string; type: string }>>();
  for (const p of pages) {
    const blocks = ((p.layout as unknown as { blocks: Block[] }) ?? { blocks: [] }).blocks;
    for (const b of blocks) {
      if (!b.articleId) continue;
      if (b.type === "continuation") continue;
      const list = map.get(b.articleId) || [];
      list.push({ pageNumber: p.pageNumber, blockId: b.id, type: b.type });
      map.set(b.articleId, list);
    }
  }

  const duplicates: DuplicateReport[] = [];
  const idsToLookup: string[] = [];
  for (const [aid, list] of map) {
    if (list.length > 1) idsToLookup.push(aid);
  }
  if (idsToLookup.length === 0) return duplicates;

  const articles = await prisma.content.findMany({
    where: { id: { in: idsToLookup }, type: "ARTICLE" },
    select: { id: true, title: true },
  });
  const titleById = new Map(articles.map((a) => [a.id, a.title]));

  for (const aid of idsToLookup) {
    duplicates.push({
      articleId: aid,
      title: titleById.get(aid) ?? "(unknown article)",
      placements: map.get(aid)!,
    });
  }
  return duplicates;
}
