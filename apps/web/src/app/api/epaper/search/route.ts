import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";

// GET /api/epaper/search?q=<text>&limit=50
//
// Full-text search across past editions. Two parallel sources:
//   1. Article DB - when the matching article was placed on any rendered
//      EpaperPage, surface the edition+page so the reader can jump there.
//   2. EpaperPage.ocrText - Tesseract output for legacy/uploaded PDFs that
//      predate the article-DB era (populated by background OCR worker).
//
// Public - readers search the archive. KILLED editions excluded.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") || "").trim();
  const limit = Math.max(5, Math.min(100, parseInt(sp.get("limit") || "30", 10)));
  if (!q || q.length < 2) return NextResponse.json({ hits: [] });

  const articles = await prisma.content.findMany({
    where: {
      type: "ARTICLE",
      status: "PUBLISHED",
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { summary: { contains: q, mode: "insensitive" } },
        { body: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, slug: true, title: true, summary: true },
    take: limit,
  });

  const articleHits: any[] = [];
  if (articles.length > 0) {
    const articleIds = articles.map((a) => a.id);
    const pages = await prisma.epaperPage.findMany({
      where: {
        edition: { active: true, status: "ready", NOT: { workflowState: "KILLED" } },
      },
      select: {
        pageNumber: true, label: true, layout: true,
        edition: { select: { id: true, date: true, edition: true } },
      },
      orderBy: { edition: { date: "desc" } },
      take: 500,
    });
    for (const p of pages) {
      const blocks = ((p.layout as any)?.blocks || []) as Array<{ articleId?: string }>;
      for (const b of blocks) {
        if (b.articleId && articleIds.includes(b.articleId)) {
          const a = articles.find((x) => x.id === b.articleId)!;
          articleHits.push({
            kind: "article",
            editionId: p.edition.id,
            editionDate: p.edition.date.toISOString().slice(0, 10),
            edition: p.edition.edition,
            pageNumber: p.pageNumber,
            pageLabel: p.label,
            articleId: a.id, articleSlug: a.slug,
            title: a.title,
            snippet: (a.summary || "").slice(0, 200),
          });
        }
      }
    }
  }

  const ocrRows = await prisma.epaperPage.findMany({
    where: {
      ocrText: { contains: q, mode: "insensitive" },
      edition: { active: true, status: "ready", NOT: { workflowState: "KILLED" } },
    },
    select: {
      pageNumber: true, label: true, ocrText: true,
      edition: { select: { id: true, date: true, edition: true } },
    },
    orderBy: { edition: { date: "desc" } },
    take: limit,
  });
  const ocrHits = ocrRows.map((p) => {
    const t = p.ocrText || "";
    const idx = t.toLowerCase().indexOf(q.toLowerCase());
    const start = Math.max(0, idx - 80);
    const end = Math.min(t.length, idx + q.length + 80);
    return {
      kind: "ocr",
      editionId: p.edition.id,
      editionDate: p.edition.date.toISOString().slice(0, 10),
      edition: p.edition.edition,
      pageNumber: p.pageNumber,
      pageLabel: p.label,
      title: `${p.label} - Page ${p.pageNumber}`,
      snippet: (t.slice(start, end) || "").trim() + (end < t.length ? "…" : ""),
    };
  });

  const seenArticle = new Set<string>();
  const dedupedArticleHits = articleHits.filter((h) => {
    const k = `${h.editionId}:${h.articleId}`;
    if (seenArticle.has(k)) return false;
    seenArticle.add(k);
    return true;
  });

  const hits = [...dedupedArticleHits, ...ocrHits].slice(0, limit);
  return NextResponse.json({ hits, total: hits.length, q });
}
