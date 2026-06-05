# Page Builder (Spec #2)

Admin-editable layouts for the public homepage and every `/category/<slug>` page.
Replaces the pre-Spec-#2 hardcoded JSX with a `Template` + `Assignment` model
inspired by WordPress / Oxygen.

Spec doc: [`docs/superpowers/specs/2026-05-25-page-builder-design.md`](./superpowers/specs/2026-05-25-page-builder-design.md)

## TL;DR

- A **Template** is a named ordered list of **Block**s (`{ version: 1, blocks: [...] }`).
- A **TemplateAssignment** binds a URL pattern (`/`, `/category/*`, `/category/movie-reviews`,
  `/category/**`) to a Template at a given priority.
- For each public request, `TemplateRenderer` resolves the winning Template (priority DESC
  → pattern-length DESC) and renders its blocks via `BlockRenderer`.
- Blocks are React components from `apps/web/src/components/*`. The block-type registry
  in `apps/web/src/components/blocks/registry.tsx` maps `block.type → { component, fetcher }`.
- Admins edit templates on a 3-pane visual canvas at `/page-builder/templates/[id]`
  (palette ↔ outline + iframe preview ↔ config). Drafts auto-save every 5 s.
- `CompositeBlock`s are reusable named groups of blocks; layout entries reference them
  as `{ type: "Composite", compositeId }`. Cycles are detected at render time.

## Architecture

```
        Browser request                                 Admin editor
            │                                                │
            ▼                                                ▼
   apps/web/src/app/                          apps/admin/src/app/(dashboard)/
   page.tsx | category/[slug]/page.tsx        page-builder/
            │                                  ├ templates/[id]/      ← 3-pane editor
            ▼                                  ├ assignments/         ← URL rules + Test URL
   <TemplateRenderer urlPath=… />              └ composites/          ← reusable groups
            │
            ▼
   resolveAssignment ⟶ Template
            │
            ▼
   <BlockRenderer block ctx composites />
            │
            ├──→ registry → fetcher → React component
            └──→ Composite: expand inline + cycle-check
```

### Data model (`packages/db/prisma/schema.prisma`)

| Model | Purpose |
|---|---|
| `Template` | Named layout. Stores `layout` (published) + optional `draftLayout` (in-progress). |
| `TemplateVersion` | Immutable snapshot taken on every publish; used by the History page. |
| `TemplateAssignment` | `pattern + priority + active` rule binding a template to a URL. |
| `CompositeBlock` | Reusable group of blocks; addressed by `compositeId` from any layout. |

### Layout JSON shape

```jsonc
{
  "version": 1,
  "blocks": [
    { "id": "blk_abc", "type": "AdHeaderLeaderboard", "config": { "position": "HEADER_LEADERBOARD" }, "mobileVariant": "show" },
    {
      "id": "blk_def",
      "type": "SectionBand",
      "config": {
        "brand": "Politics",
        "brandHref": "/category/politics",
        "categorySlug": "politics",
        "tabs": [{ "label": "AP", "href": "/category/politics" }],
        "leadCount": 1, "gridCount": 4, "trendingCount": 6,
        "showCartoon": true, "showScores": false
      },
      "mobileVariant": "show"
    },
    { "id": "blk_xyz", "type": "Composite", "compositeId": "cmp_election", "mobileVariant": "hide" }
  ]
}
```

`mobileVariant` ∈ `{ "show", "hide", "stack-below", "compact" }`. Every shape is
Zod-validated by `layoutSchema` in `packages/db/src/page-builder-schemas.ts` on both write
(API endpoints) and read (TemplateRenderer).

## Block types

11 built-in types + the synthetic `Composite`:

| `type` | Component | Configurable props |
|---|---|---|
| `AdHeaderLeaderboard` | `<AdHeaderLeaderboard>` | `position` |
| `AboveFold` | `<AboveFold>` | `districtCount`, `latestCount`, `excludeCategories[]` |
| `AdBannerMid` | `<AdBannerMid>` | `position` |
| `SectionBand` | `<SectionBand>` | `brand?`, `brandHref?`, `categorySlug?`, `tabs[]`, `leadCount`, `gridCount`, `trendingCount`, `showCartoon`, `showScores` |
| `CinemaBand` | `<CinemaBand>` | `leadCount`, `gridCount`, `reviewsCount`, `includeMovieReviews` |
| `VideoSection` | `<VideoSection>` | `count`, `featuredOnly` |
| `CategoryPair` | `<CategoryPair>` of `<CategoryColumn>` | `columns: [{title, slug, leadCount, itemsCount}, …]` |
| `WebStories` | `<WebStories>` | `count` |
| `PhotoGallery` | `<PhotoGallery>` | `count` |
| `AdLeaderboard` / `AdInFeedBanner` | ad slots | `position` |
| `Composite` | (inlined) | `compositeId` |

When `SectionBand`'s `brand` / `brandHref` / `categorySlug` are omitted, the fetcher
reads them from `PageContext` (set by the public route - `/category/sports` ⇒ slug =
`sports`). That's what lets one **Standard Category** template serve every category URL.

## Pattern matcher

| Pattern | Matches |
|---|---|
| `/` | root only |
| `/category/movie-reviews` | exact |
| `/category/*` | one segment after `/category/` (no further `/`) |
| `/category/**` | any number of segments |

Tie-break on equal priority: longer pattern wins (more specific). Implementation:
`packages/db/src/page-builder-pattern.ts`.

## API

All endpoints live under `/api/page-builder/` in `apps/admin`.

| Method | Path | Auth |
|---|---|---|
| `GET` | `/templates` | session |
| `POST` | `/templates` | ADMIN, EDITOR |
| `GET` | `/templates/[id]` | session |
| `PUT` | `/templates/[id]` | ADMIN, EDITOR - rename/redesc |
| `DELETE` | `/templates/[id]` | ADMIN - cascade to assignments + versions |
| `PUT` | `/templates/[id]/draft` | ADMIN, EDITOR - Zod-validated |
| `POST` | `/templates/[id]/publish` | ADMIN, EDITOR - snapshot + flip |
| `POST` | `/templates/[id]/discard-draft` | ADMIN, EDITOR |
| `GET` | `/templates/[id]/versions` | session |
| `POST` | `/templates/[id]/restore/[versionId]` | ADMIN - into `draftLayout` |
| `GET`/`POST`/`PUT`/`DELETE` | `/assignments[/…]` | ADMIN, EDITOR |
| `GET` | `/assignments/test?url=…` | session - resolver dry-run |
| `GET`/`POST`/`PUT`/`DELETE` | `/composites[/…]` | ADMIN, EDITOR |

## Editor

Route: `apps/admin/src/app/(dashboard)/page-builder/templates/[id]`.

- **Palette** - drag-source list of built-in block types + composites
- **Canvas** - outline list (drag-reorder + Move ▲/▼ + Delete) sitting above an
  iframe pointing at `apps/web/.../page-builder/preview/[id]?draft=1`
- **Config** - per-type form generated from the block registry (numbers, text,
  selects, checkboxes; arrays fall back to a JSON textarea)

### Editor ↔ preview message protocol

```
preview → editor
  page-builder:ready                      preview booted
  page-builder:select { blockId }         block clicked inside iframe
  page-builder:blocks { ids[] }           full block-id manifest

editor → preview
  page-builder:highlight { blockId|null } draw / clear outline
  page-builder:scroll-to { blockId }      scroll + outline
```

Mutations (insert / reorder / delete) flow through the outline state, then a full
iframe reload picks them up - surgical DOM mutations are a future-work item.

### Keyboard

- **Cmd/Ctrl + Z** undo
- **Cmd/Ctrl + Shift + Z** or **Cmd/Ctrl + Y** redo
- **Cmd/Ctrl + click** in outline toggles multi-select for "Group into composite"

### Auto-save + presence

- 5 s of layout inactivity triggers a PUT to `/draft`. `lastSavedJson` keeps re-saves
  idempotent. A `beforeunload` prompt blocks navigation with unsaved edits.
- Every 15 s the editor polls the template endpoint; if `updatedAt` has moved past
  the local "opened at" timestamp, a yellow banner warns the operator. Save/publish
  refresh the local timestamp to dismiss false positives.

## Seed

`packages/db/scripts/seed-templates.ts` creates three templates + their assignments
on first run (idempotent - keyed by `Template.slug`):

| Slug | Pattern | Priority |
|---|---|---|
| `default-homepage` | `/` | 100 |
| `movie-reviews-category` | `/category/movie-reviews` | 100 |
| `standard-category` | `/category/*` | 10 |

The production deploy workflow (`.github/workflows/deploy.yml`) runs the seed after
`prisma db push` so the public site is never caught between the page repoint and the
templates landing in DB.

## Adding a new built-in block type

1. Build the React component under `apps/web/src/components/` (or reuse an existing one).
2. Add the Zod config schema + discriminated-union variant in
   `packages/db/src/page-builder-schemas.ts`. Add the type to `BUILTIN_BLOCK_TYPES`.
3. Add a fetcher in `apps/web/src/components/blocks/fetchers.ts`.
4. Register `type → { component, fetcher }` in `apps/web/src/components/blocks/registry.tsx`.
5. (Optional) Drop a default-config entry into `DEFAULT_CONFIG` in
   `apps/admin/src/app/(dashboard)/page-builder/templates/[id]/editor-shell.tsx`
   so click-to-add from the palette works.
6. (Optional) Extend `BlockConfigForm` with a per-type form; falling back to the
   JSON textarea works fine until then.

## Tests

`bun test packages/db` - unit tests for the pattern matcher, resolver tie-break,
layout Zod, and composite block validation. See `packages/db/__tests__/page-builder.test.ts`.
