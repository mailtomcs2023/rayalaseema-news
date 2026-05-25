# ePaper Editor v2 — Pro-Grade Redesign

**Date:** 2026-05-25
**Status:** Brainstorming output, ready for implementation plan
**Replaces:** Current `DraggableBlockGrid` (RGL 12-col × 30-row) editor

---

## 1. Why

User audit of the current editor surfaced concrete defects:

- Hardcoded "30 rows" — invented unit, not grounded in real broadsheet math.
- Hardcoded page size 300×560 mm — wrong (Eenadu = 330×520 mm live area).
- 12-column grid — wrong (Eenadu/Sakshi/Hindu all use 8 columns).
- Drag-overflow popup blocks the operator with a `window.alert` — described as "childish".
- No master-page concept — masthead/cities band duplicated per page, edits don't propagate.
- Hard blocks instead of preflight warnings — diverges from InDesign/Quark/Affinity convention.

Research (Eenadu mech data, Sakshi/Hindu rate cards, Adobe InDesign docs) confirms:

| Primitive | Real value (Eenadu main) | Current code |
|---|---|---|
| Live print area | 330 × 530 mm | 300 × 560 mm |
| Columns | 8 | 12 |
| Column width | 40.6 mm | implicit |
| Gutter | ~3–4 mm | none |
| Baseline | 4.23 mm (12pt) | none |
| Off-page | Preflight warning | Hard alert block |

## 2. Goals

1. Use real Indian broadsheet geometry (Eenadu-equivalent).
2. Drop the row-count fiction; coordinates in mm.
3. Operator can place blocks anywhere with column-snap, free Y.
4. Off-page never blocks the drag — surfaced via a preflight panel.
5. Repeating elements (masthead, folio, cities band) live in master pages, propagate on edit.
6. Migrate existing edition layouts losslessly; legacy renderer keeps published archive readable.
7. Each phase ships independently; v2 lives behind a feature flag until proven.

## 3. Non-goals

- Full InDesign feature set (variable data, GREP, anchored frames, etc.)
- WYSIWYG headline editing inside the canvas (still uses the existing override modal)
- Real-time multi-cursor (existing SSE presence still applies)
- 4-up / 8-up press signatures here (already shipped #71)

## 4. Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Scope | Pro-grade rewrite, absolute mm coords |
| Snap model | Column-snap only (x + w lock to columns, Y free in mm) |
| Overflow | Soft Preflight warning, never blocks drag |
| Masters | InDesign-style master pages with detach |
| Framework | moveable.js + selecto |
| Migration | Auto-migrate legacy 12×30 → 8-col mm on first editor load |

## 5. Geometry model

```ts
type PageGeometry = {
  trim:   { w: 381, h: 578 };   // mm — sheet edge
  live:   { w: 330, h: 520 };   // mm — printable area, centered
  margin: { top: 29, outer: 25.5, inner: 25.5, bottom: 29 }; // derived
  cols: 8;
  colWidth: 40.6;               // (330 - 7*gutter) / 8
  gutter: 4;
  baseline: 4.23;               // mm (12pt leading, Telugu-safe)
};
```

Defaults stored on `EpaperEdition.pageGeometry` (Json, nullable → defaults apply).
Per-edition override possible. Render + editor + preflight all read from this object.

## 6. Coordinate model

Blocks store `{ x, y, w, h }` in **mm**. Column-snap enforced on `x` + `w`:

- `x ∈ { 0, 44.6, 89.2, 133.8, 178.4, 223.0, 267.6, 312.2 }` (col edge offsets)
- `w ∈ { 40.6, 85.2, …, 330 }` (N cols + (N-1) gutters)
- `y` free in mm, 0.1 mm precision
- `h` free in mm, 0.1 mm precision

Hold **Alt** during drag/resize bypasses snap (operator override).

## 7. Editor canvas

- Viewport = live area scaled to fit (`scale = canvas_px / 330mm`)
- `moveable.js` wraps each block; `selecto` provides marquee + shift-click multi-select
- `snapGuidelines` = column edges + baseline lines; `snapThreshold: 4px`
- Rulers top + left in mm; current cursor position shown as moving tick
- Bottom-right: zoom slider (25–200%) + "Fit page" + "Fit width" buttons
- Visible elements:
  - **Live-area boundary**: 1px red rect at 330 × 520 mm
  - **Column guides**: 8 cyan vertical lines + dimmed gutters
  - **Baseline grid**: pink horizontal lines every 4.23 mm (toggleable, default off — too noisy)
  - **Bleed band**: dotted 3mm outside live area (jacket ads only)
- Free Y; column-locked X/W.

## 8. Master pages

New `EpaperMaster` table:

```prisma
model EpaperMaster {
  id            String   @id @default(cuid())
  slug          String   @unique
  name          String
  geometryOverride Json?
  layout        Json     // { blocks: Block[] } with isMaster:true
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@map("epaper_masters")
}
```

- `EpaperTemplate.masterSlug?: String` — template inherits master.
- `EpaperPage.layout` shape gains `masterSlug?` so per-page override is possible.
- Editor renders master blocks first, dimmed + non-interactive.
- **Detach from master** action: copies master block to page layout, removes master ref → block becomes editable.
- Master editor at `/epaper-templates/masters/[slug]` (separate route, reuses Canvas).
- Seeded masters: `front-master` (masthead 4-row + cities band), `district-master` (section-band 2-row), `section-master` (section-band).

## 9. Preflight panel

Side panel (toggle P). Replaces every `alert()`/`confirm()` block.

```ts
type Issue = {
  pageNumber: number;
  blockId?: string;
  kind: "overflow" | "image-unlicensed" | "telugu-typo" | "english-blob"
      | "missing-glyph" | "empty-story" | "block-overflow";
  severity: "blocking" | "warn" | "info";
  detail: string;
};
```

- Each row: severity color dot + page#/block + 1-line detail + click → focus that block in canvas
- Top-bar chip: `⚠ 12 issues (3 blocking)` — click opens panel
- **Workflow gate**: APPROVED → PUBLISHED transition refuses when any blocking issue exists; operator can downgrade per-issue severity (audit-logged)
- Default severity table:
  - `overflow` (block past trim) → blocking
  - `image-unlicensed` → blocking
  - `block-overflow` (text exceeds capacity) → warn
  - `telugu-typo` / `english-blob` / `missing-glyph` → warn
  - `empty-story` → warn (info if intentional)

`apps/admin/src/lib/epaper/preflight.ts` consolidates `quality.ts` + new bounds checker.

## 10. Migration (legacy `grid-v1` → `mm-v2`)

```ts
function migrateLegacyLayout(blocks: GridBlock[]): MmBlock[] {
  return blocks.map(b => {
    const x_mm = (b.x / 12) * 330;
    const w_mm = (b.w / 12) * 330;
    const y_mm = (b.y / 30) * 520;
    const h_mm = (b.h / 30) * 520;
    return { ...b, ...snapColumn(x_mm, w_mm), y: y_mm, h: h_mm };
  });
}
```

- Runs on editor load if `layout.coordSystem !== "mm-v2"`
- Result persisted on first save (writes `coordSystem: "mm-v2"`)
- Render-time branch: legacy layouts use old CSS-Grid renderer; new layouts use abs-positioned renderer
- Both paths supported indefinitely so the published archive keeps rendering

## 11. Render pipeline

`render-layout.ts` branches on `layout.coordSystem`:

- **`grid-v1`** → existing CSS-Grid path (unchanged, back-compat)
- **`mm-v2`** → new path:
  ```html
  <div class="page" style="width:330mm;height:520mm;position:relative">
    <!-- master blocks first -->
    <div class="block masthead" style="position:absolute;left:0;top:0;width:330mm;height:84.6mm">…</div>
    <!-- page blocks on top -->
    <div class="block lead" style="position:absolute;left:0;top:88.83mm;width:223.0mm;height:243.2mm">…</div>
  </div>
  ```
- Playwright `page.pdf({ width:"381mm", height:"578mm", margin:0 })` renders full trim sheet; live area centered via outer padding

## 12. New / changed files

**New:**
- `apps/admin/src/lib/epaper/geometry.ts` — PageGeometry, snap helpers, `migrateLegacyLayout`
- `apps/admin/src/lib/epaper/preflight.ts` — issue collector + severity
- `apps/admin/src/components/epaper/canvas.tsx` — moveable + selecto wrapper
- `apps/admin/src/components/epaper/ruler.tsx` — top + left mm rulers
- `apps/admin/src/components/epaper/preflight-panel.tsx`
- `apps/admin/src/components/epaper/master-overlay.tsx`
- `apps/admin/src/app/(dashboard)/epaper-templates/masters/[slug]/page.tsx`
- `apps/admin/src/app/api/epaper/masters/route.ts` + `[slug]/route.ts`
- Prisma migration: `EpaperMaster`, `EpaperTemplate.masterSlug`, `EpaperEdition.pageGeometry`, `EpaperPage.layout` shape

**Changed:**
- `apps/admin/src/app/(dashboard)/epaper/page.tsx` — strip `DraggableBlockGrid`; mount Canvas + Preflight + Ruler; toolbar adapted
- `apps/admin/src/lib/epaper/render-layout.ts` — branch on `coordSystem`
- `packages/db/scripts/seed-epaper-templates.ts` — link templates to masters; drop masthead/section-band blocks from page layouts
- `apps/admin/src/lib/epaper/quality.ts` — feeds `preflight.ts`

**Removed (after Phase 5):**
- `react-grid-layout` dep
- `DraggableBlockGrid` component
- `MAX_ROWS = 30` hard-block alert

## 13. Delivery phases (each shippable)

| Phase | Scope | Risk | Deliverable |
|---|---|---|---|
| 1 | Schema + geometry lib + migrateLegacyLayout + render branch | Low — additive | Backend ready, no UI change |
| 2 | New Canvas behind `?editor=v2` flag | Low — opt-in | Side-by-side test against v1 |
| 3 | Preflight panel + master overlay | Medium | v2 reaches v1 parity |
| 4 | Master pages CRUD + propagation | Medium | New v2-only feature |
| 5 | Flip default to v2; remove RGL after 7 days stable | Medium — cutover | Old editor gone |

Each phase = independent PR. Estimated 2–3 weeks total dev.

## 14. Open questions

None — all 6 scope questions answered during brainstorming. Implementation plan to be drafted next via `writing-plans` skill.
