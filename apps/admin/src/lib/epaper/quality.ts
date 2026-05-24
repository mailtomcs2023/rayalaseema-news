// Lightweight quality-check for the e-paper editor. Doesn't aim to be a real
// Telugu spell-checker (that needs a maintained dictionary) — instead flags
// the most common operator-time mistakes that would slip through and embarrass
// the paper:
//
//   1. Long English-letter runs inside otherwise-Telugu titles/summaries —
//      usually placeholder text the translator forgot to replace.
//   2. Missing-glyph artifacts (□ ■ ?) — happens when a font can't render a
//      character; surfaces here so DTP can switch fonts before print.
//   3. Empty story blocks on rendered pages — render-time gate.
//
// Hooked into /api/epaper/render-v2 alongside the continuity check.

import { prisma } from "@rayalaseema/db";

interface Block {
  id: string; type: string; articleId?: string | null;
  overrideTitle?: string; overrideDek?: string;
}

export interface QualityWarning {
  pageNumber: number;
  blockId: string;
  blockType: string;
  kind: "english-blob" | "missing-glyph" | "empty-story";
  detail: string;
}

const STORY_TYPES = new Set(["lead", "major", "secondary", "brief", "continuation"]);
const ENGLISH_BLOB_RE = /[A-Za-z]{8,}/;          // 8+ consecutive English letters
const MISSING_GLYPH_RE = /[■□☐�]/; // ■ □ ☐ �

function checkText(s: string | null | undefined): Array<{ kind: QualityWarning["kind"]; detail: string }> {
  if (!s) return [];
  const out: Array<{ kind: QualityWarning["kind"]; detail: string }> = [];
  const m = s.match(ENGLISH_BLOB_RE);
  if (m) out.push({ kind: "english-blob", detail: `Long English run: "${m[0].slice(0, 30)}"` });
  if (MISSING_GLYPH_RE.test(s)) out.push({ kind: "missing-glyph", detail: "Missing-glyph artifact (□ ■ ?)" });
  return out;
}

export async function findQualityWarnings(editionId: string): Promise<QualityWarning[]> {
  const pages = await prisma.epaperPage.findMany({
    where: { editionId },
    orderBy: { pageNumber: "asc" },
    select: { pageNumber: true, layout: true },
  });

  // Pre-fetch article texts in one go to avoid N+1.
  const articleIds = Array.from(new Set(
    pages.flatMap((p) => ((p.layout as unknown as { blocks: Block[] }) ?? { blocks: [] }).blocks.map((b) => b.articleId).filter((x): x is string => !!x))
  ));
  const articles = articleIds.length
    ? await prisma.article.findMany({ where: { id: { in: articleIds } }, select: { id: true, title: true, summary: true } })
    : [];
  const articleById = new Map(articles.map((a) => [a.id, a]));

  const warnings: QualityWarning[] = [];
  for (const p of pages) {
    const blocks = ((p.layout as unknown as { blocks: Block[] }) ?? { blocks: [] }).blocks;
    for (const b of blocks) {
      if (!STORY_TYPES.has(b.type)) continue;
      if (!b.articleId) {
        warnings.push({ pageNumber: p.pageNumber, blockId: b.id, blockType: b.type, kind: "empty-story", detail: "Story block has no article assigned" });
        continue;
      }
      const a = articleById.get(b.articleId);
      const title = b.overrideTitle?.trim() || a?.title;
      const summary = b.overrideDek?.trim() || a?.summary;
      for (const w of checkText(title)) warnings.push({ pageNumber: p.pageNumber, blockId: b.id, blockType: b.type, ...w });
      for (const w of checkText(summary)) warnings.push({ pageNumber: p.pageNumber, blockId: b.id, blockType: b.type, ...w });
    }
  }
  return warnings;
}
