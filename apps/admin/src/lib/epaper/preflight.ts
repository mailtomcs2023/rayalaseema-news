// Unified preflight issue collector (#137).
//
// Consolidates everything that could go wrong at publish time:
//   - quality.ts warnings (empty-story, telugu-typo, english-blob, missing-glyph, block-overflow, image-unlicensed)
//   - bounds check (block past trim → overflow)
//
// Severity defaults are configurable per-deployment but ship with sensible
// publisher-grade defaults. PreflightPanel + publish-gate consume this.

import { prisma } from "@rayalaseema/db";
import { findQualityWarnings, type QualityWarning } from "./quality";
import { isOffPage, resolveGeometry, type PageGeometry } from "./geometry";

export type IssueKind = QualityWarning["kind"] | "overflow";
export type Severity = "blocking" | "warn" | "info";

export interface PreflightIssue {
  pageNumber: number;
  blockId?: string;
  blockType?: string;
  kind: IssueKind;
  severity: Severity;
  detail: string;
}

// Default severity per issue kind. Operator can downgrade per-issue via the
// preflight panel; the downgrade is audit-logged so the chief editor can
// see who waived which check.
export const DEFAULT_SEVERITY: Record<IssueKind, Severity> = {
  "overflow": "blocking",
  "image-unlicensed": "blocking",
  "block-overflow": "warn",
  "telugu-typo": "warn",
  "english-blob": "warn",
  "missing-glyph": "warn",
  "empty-story": "warn",
};

interface PageLite {
  pageNumber: number;
  layout: unknown;
}

/** Collect every preflight issue across every page of an edition. */
export async function collectIssues(editionId: string): Promise<PreflightIssue[]> {
  const [qualityWarnings, edition, pages] = await Promise.all([
    findQualityWarnings(editionId),
    prisma.epaperEdition.findUnique({
      where: { id: editionId },
      select: { pageGeometry: true },
    }),
    prisma.epaperPage.findMany({
      where: { editionId },
      orderBy: { pageNumber: "asc" },
      select: { pageNumber: true, layout: true },
    }),
  ]);

  const geometry: PageGeometry = resolveGeometry(edition?.pageGeometry as unknown);

  const issues: PreflightIssue[] = [];

  // 1. Map quality warnings → preflight issues with default severity.
  for (const w of qualityWarnings) {
    issues.push({
      pageNumber: w.pageNumber,
      blockId: w.blockId,
      blockType: w.blockType,
      kind: w.kind,
      severity: DEFAULT_SEVERITY[w.kind] ?? "warn",
      detail: w.detail,
    });
  }

  // 2. Bounds check — any block past the trim/live area on the editor's
  //    coord system. mm-v2 layouts get a precise mm check; grid-v1 layouts
  //    rely on the existing block-overflow heuristic in quality.ts.
  for (const p of pages as PageLite[]) {
    const layout = (p.layout as { coordSystem?: string; blocks?: Array<{ id: string; type: string; x: number; y: number; w: number; h: number }> }) ?? {};
    if (layout.coordSystem !== "mm-v2") continue;
    for (const b of layout.blocks ?? []) {
      if (isOffPage(b, geometry)) {
        const right = Math.max(0, b.x + b.w - geometry.live.w);
        const bottom = Math.max(0, b.y + b.h - geometry.live.h);
        const parts: string[] = [];
        if (right > 0) parts.push(`${right.toFixed(1)}mm past right edge`);
        if (bottom > 0) parts.push(`${bottom.toFixed(1)}mm past bottom`);
        issues.push({
          pageNumber: p.pageNumber,
          blockId: b.id,
          blockType: b.type,
          kind: "overflow",
          severity: DEFAULT_SEVERITY["overflow"],
          detail: `Block extends past live area (${parts.join(", ")}). Will be clipped on print.`,
        });
      }
    }
  }

  return issues;
}

/** Count of blocking issues — used by publish gate. */
export function blockingCount(issues: PreflightIssue[]): number {
  return issues.filter((i) => i.severity === "blocking").length;
}

/** Group issues by page for panel rendering. */
export function groupByPage(issues: PreflightIssue[]): Map<number, PreflightIssue[]> {
  const m = new Map<number, PreflightIssue[]>();
  for (const i of issues) {
    const arr = m.get(i.pageNumber) || [];
    arr.push(i);
    m.set(i.pageNumber, arr);
  }
  return m;
}
