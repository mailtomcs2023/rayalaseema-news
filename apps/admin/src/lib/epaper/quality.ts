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
import { findTeluguTypos, loadIgnoreList } from "./telugu-spell";

interface Block {
  id: string; type: string;
  x?: number; y?: number; w?: number; h?: number;
  articleId?: string | null;
  adAssetId?: string | null;
  overrideTitle?: string; overrideDek?: string;
  continuesToPage?: number;
  style?: { textColumns?: number };
}

export interface QualityWarning {
  pageNumber: number;
  blockId: string;
  blockType: string;
  kind: "english-blob" | "missing-glyph" | "empty-story" | "block-overflow" | "telugu-typo" | "image-unlicensed";
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

// Rough char-capacity per block, calibrated against the broadsheet 1480x2760 px
// render at 92 px/row and 12 cols. ~22 chars per row-col grid cell after
// padding/gutters; image-bearing blocks consume vertical space → reserve a
// chunk of capacity for the image. Continuation blocks split text across
// pages so we only check the head segment.
function blockTextCapacity(b: Block): number {
  if (!b.w || !b.h) return Infinity;
  const cells = b.w * b.h;
  const cols = b.style?.textColumns ?? (b.type === "lead" ? 2 : 1);
  const imageReservedCells =
    (b.type === "lead" || b.type === "major" || b.type === "secondary") ? Math.min(cells, b.w * 3) : 0;
  const textCells = Math.max(0, cells - imageReservedCells);
  // Telugu serif ~22 chars per cell; ×0.9 for inter-column gutters.
  return Math.floor(textCells * 22 * (cols > 1 ? 0.9 : 1));
}

function stripHtmlLen(s: string | null | undefined): number {
  if (!s) return 0;
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
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
    ? await prisma.article.findMany({ where: { id: { in: articleIds } }, select: { id: true, title: true, summary: true, body: true, deskId: true } })
    : [];
  const articleById = new Map(articles.map((a) => [a.id, a]));

  // Image asset license lookup (#98) — flag image blocks whose linked asset
  // lacks licenseType so render-time use is blocked on legal-risk content.
  const imageAssetIds = Array.from(new Set(
    pages.flatMap((p) => ((p.layout as unknown as { blocks: Block[] }) ?? { blocks: [] }).blocks
      .filter((b) => b.type === "image" && b.adAssetId).map((b) => b.adAssetId!))
  ));
  const imageAssets = imageAssetIds.length
    ? await prisma.epaperImageAsset.findMany({
        where: { id: { in: imageAssetIds } },
        select: { id: true, title: true, licenseType: true, licenseExpiresAt: true },
      })
    : [];
  const assetById = new Map(imageAssets.map((a) => [a.id, a]));

  // Cache ignore-list per desk so we don't re-query for each block.
  const ignoreByDesk = new Map<string, Set<string>>();
  const getIgnore = async (deskId: string | null | undefined) => {
    const key = deskId || "*";
    if (!ignoreByDesk.has(key)) ignoreByDesk.set(key, await loadIgnoreList(deskId));
    return ignoreByDesk.get(key)!;
  };

  const warnings: QualityWarning[] = [];
  for (const p of pages) {
    const blocks = ((p.layout as unknown as { blocks: Block[] }) ?? { blocks: [] }).blocks;
    for (const b of blocks) {
      // Image-asset license gate runs for image blocks (not the story loop).
      if (b.type === "image" && b.adAssetId) {
        const asset = assetById.get(b.adAssetId);
        if (!asset?.licenseType) {
          warnings.push({
            pageNumber: p.pageNumber, blockId: b.id, blockType: b.type,
            kind: "image-unlicensed",
            detail: `Image "${asset?.title ?? b.adAssetId}" missing licenseType — set in image-asset library before publish.`,
          });
        } else if (asset.licenseExpiresAt && asset.licenseExpiresAt < new Date()) {
          warnings.push({
            pageNumber: p.pageNumber, blockId: b.id, blockType: b.type,
            kind: "image-unlicensed",
            detail: `Image "${asset.title}" license expired on ${asset.licenseExpiresAt.toISOString().slice(0, 10)} — renew or replace.`,
          });
        }
      }
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

      // Telugu typo scan — desk-scoped ignore list filters proper nouns.
      const ignore = await getIgnore(a?.deskId ?? null);
      const titleTypos = await findTeluguTypos(title, ignore);
      const summaryTypos = await findTeluguTypos(summary, ignore);
      for (const t of [...titleTypos, ...summaryTypos]) {
        warnings.push({
          pageNumber: p.pageNumber, blockId: b.id, blockType: b.type,
          kind: "telugu-typo",
          detail: `'${t.token}' → '${t.suggestion}'`,
        });
      }

      // block-overflow: estimate whether the chosen article's body fits the
      // block's pixel area. Continuation blocks have their text auto-split so
      // we skip them. Brief blocks use the summary not the body.
      if (b.type !== "continuation" && !b.continuesToPage) {
        const sourceText = b.type === "brief"
          ? (b.overrideDek?.trim() || a?.summary || "")
          : (b.overrideDek?.trim() || a?.body || a?.summary || "");
        const len = stripHtmlLen(sourceText);
        const cap = blockTextCapacity(b);
        if (len > cap * 1.15) {
          const overBy = len - cap;
          warnings.push({
            pageNumber: p.pageNumber, blockId: b.id, blockType: b.type,
            kind: "block-overflow",
            detail: `Story body (${len} chars) exceeds block capacity (~${cap}) by ${overBy} chars — will be clipped. Resize block, split to continuation, or trim copy.`,
          });
        }
      }
    }
  }
  return warnings;
}
