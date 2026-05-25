// Page geometry primitives for the v2 ePaper editor (#108).
//
// Real Indian-broadsheet numbers (researched: Eenadu mech-data, Sakshi/Hindu
// rate cards). All coordinates are mm. Column-snap helpers + bounds check
// + mm↔col conversion. Used by both editor (drag/resize) and render-layout
// (mm-v2 path).

export type PageGeometry = {
  trim:   { w: number; h: number };   // mm — sheet edge
  live:   { w: number; h: number };   // mm — printable area (centered inside trim)
  margin: { top: number; outer: number; inner: number; bottom: number };
  cols: number;
  colWidth: number;                   // mm — derived: (live.w - (cols-1)*gutter) / cols
  gutter: number;                     // mm
  baseline: number;                   // mm — body-text leading (12pt ≈ 4.23mm Telugu-safe)
};

// Eenadu-equivalent default (matches the 8-col broadsheet used by every
// major Telugu daily). Override via EpaperEdition.pageGeometry when an
// edition runs in a different format (e.g. Sunday magazine pull-out).
export const DEFAULT_GEOMETRY: PageGeometry = {
  trim:   { w: 381, h: 578 },
  live:   { w: 330, h: 520 },
  margin: { top: 29, outer: 25.5, inner: 25.5, bottom: 29 },
  cols: 8,
  colWidth: 40.6,
  gutter: 4,
  baseline: 4.23,
};

// ============ Column / mm conversion ============

/** Convert a 0-based column index to its left edge in mm. */
export function colToMm(col: number, g: PageGeometry = DEFAULT_GEOMETRY): number {
  return col * (g.colWidth + g.gutter);
}

/** Convert a column-span count (1..cols) to a width in mm including internal gutters. */
export function colsToWidthMm(span: number, g: PageGeometry = DEFAULT_GEOMETRY): number {
  if (span < 1) return g.colWidth;
  return span * g.colWidth + (span - 1) * g.gutter;
}

/** Convert mm to the nearest column index (rounded). */
export function mmToCol(mm: number, g: PageGeometry = DEFAULT_GEOMETRY): number {
  return Math.max(0, Math.min(g.cols, Math.round(mm / (g.colWidth + g.gutter))));
}

/** Convert mm width to the nearest column-span count (1..cols). */
export function mmToCols(mm: number, g: PageGeometry = DEFAULT_GEOMETRY): number {
  return Math.max(1, Math.min(g.cols, Math.round((mm + g.gutter) / (g.colWidth + g.gutter))));
}

// ============ Snap helpers ============

/** Snap an X/W rectangle to the column grid. Returns the snapped x + w in mm. */
export function snapColumn(
  x_mm: number,
  w_mm: number,
  g: PageGeometry = DEFAULT_GEOMETRY,
): { x: number; w: number } {
  const startCol = mmToCol(x_mm, g);
  const span = mmToCols(w_mm, g);
  const maxStart = g.cols - span;
  const clampedStart = Math.max(0, Math.min(maxStart, startCol));
  return { x: colToMm(clampedStart, g), w: colsToWidthMm(span, g) };
}

/** Snap a Y coordinate to the nearest baseline grid line (mm). */
export function snapBaseline(y_mm: number, g: PageGeometry = DEFAULT_GEOMETRY): number {
  return Math.round(y_mm / g.baseline) * g.baseline;
}

// ============ Bounds check ============

export interface BlockBounds { x: number; y: number; w: number; h: number }

/** True when the block extends past the live print area (will be clipped). */
export function isOffPage(b: BlockBounds, g: PageGeometry = DEFAULT_GEOMETRY): boolean {
  return (b.x + b.w > g.live.w + 0.5) || (b.y + b.h > g.live.h + 0.5);
}

/** mm overflow amount past the live area; 0 when fully inside. */
export function offPageAmount(b: BlockBounds, g: PageGeometry = DEFAULT_GEOMETRY): { right: number; bottom: number } {
  return {
    right: Math.max(0, b.x + b.w - g.live.w),
    bottom: Math.max(0, b.y + b.h - g.live.h),
  };
}

// ============ Geometry resolver ============

/** Read effective geometry — edition override → default. */
export function resolveGeometry(editionOverride: unknown): PageGeometry {
  if (!editionOverride || typeof editionOverride !== "object") return DEFAULT_GEOMETRY;
  const override = editionOverride as Partial<PageGeometry>;
  return {
    ...DEFAULT_GEOMETRY,
    ...override,
    trim: { ...DEFAULT_GEOMETRY.trim, ...(override.trim || {}) },
    live: { ...DEFAULT_GEOMETRY.live, ...(override.live || {}) },
    margin: { ...DEFAULT_GEOMETRY.margin, ...(override.margin || {}) },
  };
}
