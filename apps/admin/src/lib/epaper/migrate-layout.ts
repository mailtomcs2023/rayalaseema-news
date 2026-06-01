// Legacy → v2 layout migration (#120).
//
// Old editor used a 12-col × 30-row grid (no real-world units). v2 editor
// uses absolute mm coords on a 330×520 mm live area with 8-col snap.
//
// On editor load we detect any page whose layout has no coordSystem field
// (or coordSystem='grid-v1') and scale every block:
//   x_mm = (x_grid / 12) * live.w
//   w_mm = (w_grid / 12) * live.w
//   y_mm = (y_grid / 30) * live.h
//   h_mm = (h_grid / 30) * live.h
// Then snap X+W to the column grid so blocks land cleanly inside the new
// 8-col model.
//
// Result persisted on first save. Render pipeline keeps the legacy renderer
// available for pages still flagged grid-v1 so the published archive
// keeps rendering identically.

import { snapColumn, DEFAULT_GEOMETRY, type PageGeometry } from "./geometry";

type AnyBlock = Record<string, unknown> & {
  x?: number; y?: number; w?: number; h?: number;
};

type LegacyLayout = {
  coordSystem?: "grid-v1" | "mm-v2";
  blocks?: AnyBlock[];
  masterSlug?: string;
};

const LEGACY_COLS = 12;
const LEGACY_ROWS = 30;

export function isLegacyLayout(layout: unknown): boolean {
  if (!layout || typeof layout !== "object") return false;
  const l = layout as LegacyLayout;
  // Treat anything without explicit mm-v2 tag as legacy.
  return l.coordSystem !== "mm-v2";
}

/** Scale + snap one legacy block to mm-v2. Preserves every non-geometry field. */
export function migrateLegacyBlock(b: AnyBlock, g: PageGeometry = DEFAULT_GEOMETRY): AnyBlock {
  const x_grid = typeof b.x === "number" ? b.x : 0;
  const y_grid = typeof b.y === "number" ? b.y : 0;
  const w_grid = typeof b.w === "number" ? b.w : 1;
  const h_grid = typeof b.h === "number" ? b.h : 1;

  const x_mm = (x_grid / LEGACY_COLS) * g.live.w;
  const w_mm = (w_grid / LEGACY_COLS) * g.live.w;
  const y_mm = (y_grid / LEGACY_ROWS) * g.live.h;
  const h_mm = (h_grid / LEGACY_ROWS) * g.live.h;

  const snapped = snapColumn(x_mm, w_mm, g);
  return {
    ...b,
    x: snapped.x,
    w: snapped.w,
    y: Math.max(0, Math.round(y_mm * 10) / 10),    // 0.1 mm precision
    h: Math.max(g.baseline, Math.round(h_mm * 10) / 10),
  };
}

/** Migrate a whole page layout. Idempotent - already-mm-v2 layouts pass through. */
export function migrateLegacyLayout(
  layout: unknown,
  g: PageGeometry = DEFAULT_GEOMETRY,
): { coordSystem: "mm-v2"; blocks: AnyBlock[]; masterSlug?: string } {
  if (!isLegacyLayout(layout)) {
    const l = (layout as LegacyLayout) || { blocks: [] };
    return { coordSystem: "mm-v2", blocks: l.blocks || [], masterSlug: l.masterSlug };
  }
  const l = (layout as LegacyLayout) || { blocks: [] };
  return {
    coordSystem: "mm-v2",
    blocks: (l.blocks || []).map((b) => migrateLegacyBlock(b, g)),
    masterSlug: l.masterSlug,
  };
}
