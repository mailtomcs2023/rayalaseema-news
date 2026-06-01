# ePaper Editor v2 - Operator Runbook

Day-to-day operations for the new pro-grade ePaper editor (#108).

---

## 1. Open the editor

- Admin → ePaper → date picker
- Default editor is **v2 (mm-coord)**. Fallback chip top-right: click `editor: v2 BETA` to flip to legacy v1 if v2 misbehaves.

## 2. Canvas controls

| Action | Mouse | Keyboard |
|---|---|---|
| Select block | Click | - |
| Multi-select | Shift+click / marquee drag | - |
| Drag block | Drag inside | - |
| Resize block | Drag corner handle | - |
| Bypass column-snap | Hold **Alt** during drag/resize | - |
| Zoom in / out | Ctrl+wheel | `+` / `-` |
| 100% zoom | - | `0` |
| Pan canvas | Space + drag | - |
| Fit page / Fit width | Bottom-right buttons | - |
| Open preflight panel | Click `⚠ N issues` chip | `P` |

Column-snap behavior:
- **X + W** lock to 8-column grid (40.6 mm columns + 4 mm gutters).
- **Y + H** free in mm (0.1 mm precision).
- Alt-held = manual override; commits raw mm coords.

## 3. Master pages

Repeating elements (masthead, folio, cities band) live in **master pages**. Editing a master propagates to every page that inherits it.

**Edit a master:**
1. Admin → ePaper Templates → Masters
2. Click `Edit` next to `front-master` / `district-master` / `section-master`
3. Drag/resize blocks. Click **Save + propagate** (confirms because it affects every edition).

**Detach a master block on one page only:**
- Right-click the dimmed master block in the page canvas → confirm Detach.
- The block copies into the page layer with `isOverride: true`. Edit freely; the master stays unchanged.
- To re-attach: delete the override block. The master block reappears automatically.

## 4. Masthead ad slots

Front-master masthead has two slots: `ad-left` and `ad-right`.

**Per-edition selection:**
1. Open today's edition in the editor.
2. Click an ad slot inside the masthead (placeholder appears as "ad-left" / "ad-right").
3. Picker modal opens: search + thumbnail grid of active `EpaperAdAsset` rows.
4. Pick one → **Save for this edition** writes to `EpaperEdition.mastheadAds`.

**Auto fallback:** if a slot is empty for an edition, the renderer picks the top 2 active ad assets by `validFrom` desc. Always-have-an-ad behavior; no zero-config blank slots.

**Upload a new ad asset:** Admin → ePaper Ads → +Upload.

## 5. Preflight panel

Replaces every `alert()` from v1. Lists every issue that could block publish.

**Severity tiers:**
- 🔴 **Blocking** - refuses APPROVED → PUBLISHED transition until resolved (or downgraded with audit-logged override).
  - `overflow` (block past trim)
  - `image-unlicensed` (asset has no `licenseType` or expired)
- 🟡 **Warn** - visible but doesn't block publish.
  - `block-overflow` (story text exceeds block capacity)
  - `telugu-typo`, `english-blob`, `missing-glyph`
  - `empty-story` (story block has no article)

**Workflow:**
1. Click chip → panel opens.
2. Click any row → canvas jumps to that page + selects the block.
3. Fix the issue or downgrade severity if intentional.
4. After Render PDF, chip + panel auto-refresh.

**Override blocking issues (CHIEF only):**
- Body must include `override: true` on the transition POST. Audit-logged.

## 6. Page geometry

Eenadu-equivalent broadsheet:
- Trim sheet: **381 × 578 mm**
- Live print area: **330 × 520 mm** (where text/blocks live)
- 8 columns × 40.6 mm + 4 mm gutter
- 4.23 mm baseline grid

Per-edition override: set `EpaperEdition.pageGeometry` JSON in the DB to run a Sunday tabloid pull-out or similar.

## 7. Migration from legacy v1

Existing pages with the old 12-col × 30-row grid layout (`coordSystem: 'grid-v1'` or missing) are **auto-migrated** to mm-v2 on first load in v2. Scaled proportionally, X+W column-snapped to the new 8-col grid.

The legacy renderer is kept alive - published archive pages render identically. Only new edits write `coordSystem: 'mm-v2'`.

## 8. Render pipeline

| Endpoint | Action |
|---|---|
| **Preview PDF** | Loads `/api/epaper/page/[id]/preview` in iframe - instant, uses same render path as PDF |
| **Render PDF** | POST `/api/epaper/render-v2` - Playwright builds vector PDF per page, merges via pdf-lib |
| `?grid=1` on preview | Overlays 4.23 mm baseline grid (debugging only) |
| Imposed PDF (#71) | POST `/api/epaper/imposed-pdf { foldType: "2up"\|"4up" }` for press signatures |
| CMYK convert (#101) | POST `/api/epaper/cmyk { editionId }` - needs `GHOSTSCRIPT_BIN` env |

## 9. Publish

Workflow: `DRAFT → SUB_REVIEW → CHIEF_REVIEW → APPROVED → PUBLISHED`.

Publish step dispatches (when env keys configured):
- WhatsApp blast via Twilio (`TWILIO_*`)
- OneSignal push (`ONESIGNAL_*`)
- X tweet (`X_BEARER_TOKEN`)
- Kill switch: PUBLISHED → KILLED with reason; surfaces on `/epaper/corrections` reader page.

## 10. Common troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Block drag does nothing | Block is from master (dimmed purple) | Right-click → Detach to edit on this page |
| Block X locks to col edge | Column-snap working as designed | Hold Alt to bypass |
| Preview shows old layout | Page on legacy `grid-v1` not yet migrated | Open in v2, drag one block, save → auto-migrates |
| Masthead missing ads | No EpaperAdAsset rows active OR `mastheadAds` empty + no fallback | Upload 2 ads via `/epaper-ads` |
| Publish refused 412 | Blocking preflight issue | Open preflight panel, resolve or override |

## 11. Where things live

| File / route | Purpose |
|---|---|
| `apps/admin/src/lib/epaper/geometry.ts` | mm/col math + snap helpers |
| `apps/admin/src/lib/epaper/migrate-layout.ts` | grid-v1 → mm-v2 converter |
| `apps/admin/src/lib/epaper/preflight.ts` | unified issue collector |
| `apps/admin/src/lib/epaper/render-layout.ts` | HTML render (mm-v2 + grid-v1 branches) |
| `apps/admin/src/components/epaper/canvas.tsx` | moveable+selecto canvas |
| `apps/admin/src/components/epaper/editor-v2.tsx` | Canvas + Rulers + ZoomBar composite |
| `apps/admin/src/components/epaper/preflight-panel.tsx` | Side panel + chip |
| `apps/admin/src/components/epaper/ad-slot-picker.tsx` | Masthead ad picker modal |
| `apps/admin/src/app/api/epaper/masters/*` | Master CRUD |
| `apps/admin/src/app/(dashboard)/epaper-templates/masters/*` | Master editor UI |
| `packages/db/scripts/seed-epaper-masters.ts` | Seed front/district/section masters |

## 12. Reverting to v1

If v2 breaks during a critical edition prep:
1. Add `?editor=v1` to the URL → legacy DraggableBlockGrid loads.
2. Layout JSON is forward-compatible; save in v1 stays readable by v2.
3. File a bug with the reproduction.

Don't panic. Both editors share the same database.
