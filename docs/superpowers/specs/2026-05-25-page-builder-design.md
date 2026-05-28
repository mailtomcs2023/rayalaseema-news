# Spec #2 - Page Builder

**Date:** 2026-05-25
**Status:** Approved by user (sections 1–4)
**Decomposition:** Part 2 of 3 (Unified Content → **Page Builder** → Menu Builder)
**Depends on:** Spec #1 (Unified Content Model) shipped, so blocks can query the unified `Content` table.

## Goal

Replace hardcoded layouts in `apps/web/src/app/page.tsx` and `apps/web/src/app/category/[slug]/page.tsx` with an admin-editable, WordPress/Oxygen-style template system. Each public URL resolves to a named `Template` via priority-ordered URL-pattern `TemplateAssignment` rules. Admin composes templates by drag-dropping blocks on a live WYSIWYG canvas. Admin can group blocks into reusable `CompositeBlock`s. Templates support draft/publish + version history.

## Why

- Current homepage and category pages are hardcoded JSX. Adding a section ("Election Day Hero") requires a code deploy.
- Newsroom wants to swap layouts for big events (elections, festivals, breaking stories) without engineering involvement.
- Foundation for Spec #3 (Menu Builder) - menu entries can point to layouts the same way.

## Decisions locked (13)

| # | Decision | Choice |
|---|---|---|
| 1 | Page scope | Homepage + all `/category/[slug]` pages |
| 2 | Architecture | Template + Assignment (WordPress / Oxygen style) |
| 3 | Assignment model | URL pattern + priority |
| 4 | Block vocabulary | 1:1 with current ~11 components |
| 5 | Editor UX | Visual drag-drop canvas |
| 6 | Block creation | Composite blocks (group existing into reusable units) |
| 7 | Data binding | Explicit per-block config (data source, filter, sort, limit) |
| 8 | Responsive | Single template + per-block `mobileVariant` flag |
| 9 | Versioning | Draft + Published + revision history |
| 10 | Canvas mode | Live WYSIWYG, real DB data |
| 11 | Layout grid | Single column, stacked full-width blocks |
| 12 | Permissions | ADMIN + CHIEF_SUB_EDITOR |
| 13 | Migration | Seed script creates current homepage + standard category as initial templates |

## Data Model

```prisma
model Template {
  id              String   @id @default(cuid())
  name            String                                // "Default Homepage", "Movie Category", "Election Day"
  slug            String   @unique                       // url-safe identifier
  description     String?
  layout          Json                                   // published layout (block tree)
  draftLayout     Json?                                  // in-progress edits; promoted on publish
  isPublished     Boolean  @default(false)
  publishedAt     DateTime?
  createdById     String
  createdBy       User     @relation("TemplateCreator", fields: [createdById], references: [id])
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  assignments     TemplateAssignment[]
  versions        TemplateVersion[]

  @@index([slug])
}

model TemplateVersion {
  id          String   @id @default(cuid())
  templateId  String
  template    Template @relation(fields: [templateId], references: [id], onDelete: Cascade)
  layout      Json
  editedById  String
  editedBy    User     @relation(fields: [editedById], references: [id])
  editNote    String?
  createdAt   DateTime @default(now())

  @@index([templateId, createdAt])
}

model TemplateAssignment {
  id          String   @id @default(cuid())
  templateId  String
  template    Template @relation(fields: [templateId], references: [id], onDelete: Cascade)
  pattern     String                                     // "/" or "/category/movie-reviews" or "/category/*"
  priority    Int      @default(10)
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())

  @@index([active, priority])
  @@unique([pattern, templateId])
}

model CompositeBlock {
  id            String   @id @default(cuid())
  name          String                                   // "Election Day Hero", "Cinema + Ad Combo"
  slug          String   @unique
  description   String?
  blocks        Json                                     // array of block configs
  createdById   String
  createdBy     User     @relation("CompositeCreator", fields: [createdById], references: [id])
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

### `layout` JSON shape

```json
{
  "version": 1,
  "blocks": [
    {
      "id": "blk_abc",
      "type": "AdHeaderLeaderboard",
      "config": { "position": "HEADER_LEADERBOARD" },
      "mobileVariant": "show"
    },
    {
      "id": "blk_def",
      "type": "SectionBand",
      "config": {
        "brand": "రాజకీయం",
        "brandHref": "/category/politics",
        "categorySlug": "politics",
        "tabs": [
          { "label": "ఆంధ్రప్రదేశ్", "href": "/category/politics" },
          { "label": "జాతీయం", "href": "/category/national" }
        ],
        "leadCount": 1,
        "gridCount": 4,
        "trendingCount": 6,
        "showCartoon": true
      },
      "mobileVariant": "show"
    },
    {
      "id": "blk_xyz",
      "type": "Composite",
      "compositeId": "comp_election_hero",
      "mobileVariant": "hide"
    }
  ]
}
```

`mobileVariant` ∈ `{ "show", "hide", "stack-below", "compact" }`.

### Block types

11 built-in types, each 1:1 with an existing React component in `apps/web/src/components/*`:

| `type` | Component | Configurable props |
|---|---|---|
| `ReturnVisitBanner` | `<ReturnVisitBanner>` | - |
| `AdHeaderLeaderboard` | `<AdHeaderLeaderboard>` | `position` |
| `AboveFold` | `<AboveFold>` | `districtCount`, `latestCount`, `excludeCategories[]` |
| `AdBannerMid` | `<AdBannerMid>` | `position` |
| `SectionBand` | `<SectionBand>` | `brand`, `brandHref`, `categorySlug`, `tabs[]`, `leadCount`, `gridCount`, `trendingCount`, `showCartoon`, `showScores` |
| `CinemaBand` | `<CinemaBand>` | `leadCount`, `gridCount`, `reviewsCount`, `includeMovieReviews` |
| `VideoSection` | `<VideoSection>` | `count`, `featuredOnly` |
| `CategoryPair` | wraps 2× `<CategoryColumn>` | `columns: [{title, slug, leadCount, itemsCount}, …]` |
| `WebStories` | `<WebStories>` | `count` |
| `PhotoGallery` | `<PhotoGallery>` | `count` |
| `AdLeaderboard` / `AdInFeedBanner` | ad slots | `position` |

Plus one synthetic type `Composite` (`{ type: "Composite", compositeId }`) that inlines a `CompositeBlock.blocks` array at render time.

## Admin UI + Editor

### Sidebar (additions)

```
Page Builder
  ├ Templates
  ├ Assignments
  └ Composite Blocks
```

### Pages

| Route | Purpose |
|---|---|
| `/page-builder/templates` | List. Cols: Name, Slug, Status, Assigned URLs, Last edit. Edit / Clone / Delete / Versions. + New. |
| `/page-builder/templates/new` | Modal: name + slug + (optional) clone from existing. |
| `/page-builder/templates/[id]` | Visual drag-drop editor (3-pane). |
| `/page-builder/templates/[id]/versions` | Version history. View / restore any snapshot. |
| `/page-builder/assignments` | Rules table. + New Assignment. "Test URL" tool. |
| `/page-builder/composites` | List composite blocks. CRUD. |

### Editor layout (3-pane)

```
┌─────────────────────────────────────────────────────────────────┐
│ Header: [← Back] [Template Name ▾] Draft | Published [Publish▾] │
│         [Mobile | Desktop preview]   [Save Draft] [History]      │
├──────────┬──────────────────────────────────────────┬───────────┤
│ Palette  │  Canvas (iframe, live WYSIWYG, real DB) │ Config    │
│ ─ Hero   │                                          │ panel     │
│ ─ Above  │  ┌────────────────────────────────┐     │           │
│   Fold   │  │ [Block 1 - live render]       │     │ Selected: │
│ ─ News   │  ├────────────────────────────────┤     │ <type>    │
│   Band   │  │ [Block 2]                  ◄── │ ◄── │ <props>   │
│ ─ Cinema │  ├────────────────────────────────┤     │           │
│ ─ Video  │  │ [+ Insert Block]              │     │ Mobile:   │
│ ─ Pair   │  └────────────────────────────────┘     │ show/hide │
│ ─ Stories│                                          │ [Delete]  │
│ ─ Photos │                                          │           │
│ ─ Ads    │                                          │           │
│ Composite│                                          │           │
└──────────┴──────────────────────────────────────────┴───────────┘
```

### Editor interactions

- Drag block from palette → blue insertion line in canvas → drops there.
- Click block in canvas → highlights + config panel opens.
- Drag block within canvas → reorder.
- Block hover toolbar: Duplicate / Delete / Wrap-as-Composite / Move up-down.
- Multi-select (cmd+click) → "Group into Composite" → opens create-composite modal (name + slug).
- Per-block `mobileVariant` selector in config panel.
- Undo / Redo (cmd+Z / cmd+shift+Z) backed by a local action log.
- Publish dropdown: Publish Now / Schedule / Discard Draft.

### Save behavior

- Auto-save draft every 5s of inactivity (PUT `/api/page-builder/templates/[id]/draft`).
- Manual "Save Draft" button (same endpoint).
- "Publish" copies `draftLayout` → `layout`, sets `isPublished=true`, snapshots `TemplateVersion`.
- "Discard Draft" clears `draftLayout` (revert to published).

### Live WYSIWYG implementation

- Canvas is an `<iframe>` pointing to `/page-builder/preview/[id]?draft=1`.
- Iframe server-renders blocks with real DB queries (per-block fetchers from registry).
- Each rendered block has `data-block-id` attribute.
- Editor-side React communicates with iframe via `postMessage`:
  - `insert(blockType, position)`
  - `reorder(blockId, newPosition)`
  - `delete(blockId)`
  - `select(blockId)` (visual outline only)
- Iframe-side helper script draws insertion lines and selection outlines.

### Assignments page

- Table sorted by priority desc.
- + New Assignment: pick template (dropdown) + pattern (text, supports `*` / `**` glob) + priority (number) + active (toggle).
- "Test URL" input → shows which template wins for that path.

### Composites page

- CRUD list like Templates, no assignment column, no canvas (preview happens inside the template editor when dropped in).

## Frontend (apps/web)

### Public route changes

| File | Before | After |
|---|---|---|
| `apps/web/src/app/page.tsx` | Hardcoded JSX layout | `<TemplateRenderer urlPath="/" />` |
| `apps/web/src/app/category/[slug]/page.tsx` | Hardcoded category layout | `<TemplateRenderer urlPath={\`/category/\${slug}\`} />` |

### `TemplateRenderer` component

```tsx
async function resolveTemplate(urlPath: string) {
  const assignments = await prisma.templateAssignment.findMany({
    where: { active: true, template: { isPublished: true } },
    include: { template: true },
    orderBy: { priority: "desc" },
  });
  // Highest priority wins; tie-break = longer pattern (more specific)
  const sorted = [...assignments].sort((a, b) =>
    b.priority - a.priority || b.pattern.length - a.pattern.length
  );
  for (const a of sorted) if (matchPattern(a.pattern, urlPath)) return a.template;
  return null;
}

export async function TemplateRenderer({ urlPath }: { urlPath: string }) {
  const template = await resolveTemplate(urlPath);
  if (!template) return <EmptyTemplate />;
  const layout = template.layout as Layout;
  return (
    <>
      {layout.blocks.map((block) => (
        <BlockRenderer key={block.id} block={block} pageContext={{ urlPath }} />
      ))}
    </>
  );
}
```

### Block registry (`apps/web/src/components/blocks/registry.ts`)

Each entry maps `type → { component, fetcher }`. Fetcher takes `(config, pageContext)` and returns the data props the component expects. Existing per-component query functions in `lib/db-queries.ts` are reused.

### Pattern matcher

- Exact: `/category/movie-reviews` only matches that URL
- Glob `*`: `/category/*` matches `/category/anything` (no `/`)
- Recursive `**`: `/category/**` matches `/category/x/y`
- Root: `/` matches only homepage
- Tie-break on equal priority: longer pattern wins (more specific)

### Empty / missing template fallback

- No matching assignment OR template empty → render `<EmptyTemplate>` ("Layout coming soon…" centered placeholder)

## Migration

### Seed script (`packages/db/scripts/seed-templates.ts`)

Idempotent (skips templates whose `slug` already exists). Creates:

1. **Default Homepage** - blocks identical to current `apps/web/src/app/page.tsx`:
   - ReturnVisitBanner, AdHeaderLeaderboard, AboveFold, AdBannerMid, SectionBand(politics), CinemaBand, VideoSection, SectionBand(sports), CategoryPair × 4 (national+business, crime+technology, agriculture+international, education+health), AdLeaderboard, WebStories, PhotoGallery, AdInFeedBanner

2. **Standard Category** - blocks identical to current `apps/web/src/app/category/[slug]/page.tsx`:
   - Branded header (resolves from page context), lead + 4-grid + rest list, TrendingSidebar rail, optional CricketScores (sports only), optional Cartoon (politics only), footer ads

3. **Movie Reviews Category** - clone of Standard with `CinemaBand` block instead of plain news rail (demonstrates customisation).

### Seeded assignments

| Pattern | Template | Priority |
|---|---|---|
| `/` | Default Homepage | 100 |
| `/category/movie-reviews` | Movie Reviews Category | 100 |
| `/category/*` | Standard Category | 10 |

After this script, public routes look identical to pre-Spec #2; layouts now editable from admin.

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/page-builder/templates` | session | List |
| POST | `/api/page-builder/templates` | ADMIN, CHIEF_SUB_EDITOR | Create |
| GET | `/api/page-builder/templates/[id]` | session | Fetch (with assignments + version count) |
| PUT | `/api/page-builder/templates/[id]` | ADMIN, CHIEF_SUB_EDITOR | Update name / description |
| PUT | `/api/page-builder/templates/[id]/draft` | ADMIN, CHIEF_SUB_EDITOR | Save draft layout (Zod-validated) |
| POST | `/api/page-builder/templates/[id]/publish` | ADMIN, CHIEF_SUB_EDITOR | Publish draft + snapshot version |
| POST | `/api/page-builder/templates/[id]/discard-draft` | ADMIN, CHIEF_SUB_EDITOR | Clear `draftLayout` |
| POST | `/api/page-builder/templates/[id]/restore/[versionId]` | ADMIN | Copy version layout into draft |
| DELETE | `/api/page-builder/templates/[id]` | ADMIN | Delete template + assignments + versions (cascade) |
| GET | `/api/page-builder/templates/[id]/versions` | session | List version history |
| GET / POST / PUT / DELETE | `/api/page-builder/assignments` | ADMIN, CHIEF_SUB_EDITOR | CRUD assignment rules |
| GET | `/api/page-builder/assignments/test?url=<path>` | session | Returns which template wins for a path |
| GET / POST / PUT / DELETE | `/api/page-builder/composites` | ADMIN, CHIEF_SUB_EDITOR | CRUD composite blocks |

## Rollout phases

- **A** Schema + Zod + pattern matcher
- **B** TemplateRenderer + BlockRenderer + registry
- **C** Repoint `page.tsx` + `category/[slug]/page.tsx` + seed script
- **D** Admin shell: templates + assignments + composites lists + Test URL
- **E** Visual drag-drop editor (canvas iframe + palette + config + postMessage protocol)
- **F** Composite create-from-selection + cycle detection
- **G** Version history + restore
- **H** Polish: auto-save, undo/redo, mobile preview toggle, presence banner
- **I** Tests
- **J** Docs

## Risks

| Risk | Mitigation |
|---|---|
| Live WYSIWYG canvas slow on big templates | Per-block server render via React Suspense; LRU cache (60s) of fetcher results during edit session |
| Pattern matching ambiguity (equal priority match) | Tie-break by longer pattern; Test URL tool surfaces conflicts |
| Block component changes break stored configs | Block registry includes `version` per type; renderer warns on mismatch + falls back to safe defaults |
| Editor drag-drop corrupts `draftLayout` JSON | Zod validation on every save; bad JSON rejected + toast + revert to last good draft |
| Composite block infinite recursion | Cycle detection in renderer; throws + renders error block |
| Re-running seed script overwrites manual edits | Idempotent by `slug`; skips existing |
| Assignment active but template not published | Resolver requires both; orphans skipped + admin warning banner |
| Every visit hits DB | `unstable_cache` on `resolveTemplate`; per-fetcher cache (60s); invalidate on publish |
| Two editors collide on same draft | Last-write-wins; presence banner shows other editor; undo covers slips |
| Public layout flicker during migration deploy | Single PR ships seed + renderer + repointed pages atomically |

## Testing

- **Unit**: pattern matcher (exact / glob / recursive / priority tie-break), block registry lookup, layout Zod, composite cycle detection
- **Integration**: TemplateRenderer end-to-end with seeded templates + DB; mock DB for fetchers
- **E2E (Playwright)**: drag block from palette → place on canvas → save draft → publish → public reflects change; create composite from selection → reuse in another template
- **Manual**: live WYSIWYG with real Telugu DB content; auto-save + recovery; version history restore; mobile preview toggle; pattern conflict surfacing

## Out of scope (future)

- District pages (`/district/[slug]`) - add later by extending assignment patterns
- Article detail page (`/article/[slug]`) - stays code-driven
- Special pages (ePaper, search, gallery detail, video detail) - code-driven
- Multi-author real-time collaboration (Yjs / Liveblocks)
- A/B testing two templates against same URL with traffic split
- Theme system (per-template colors / fonts)
- Reusable "Saved Sections" beyond composites (template parts library)
- Mobile-only template variant (decision #8 = single template + flag instead)
- Custom block authoring with code
- Free 12-column grid layout (decision #11 = single column)
- Localization of template names (English UI only)

## Success criteria

- [ ] All 11 block types render in canvas and in production
- [ ] Drag-drop reorder + insert + delete work
- [ ] Save Draft + Publish round-trip works; published layout visible on public site
- [ ] Version history shows snapshots and restores cleanly
- [ ] Composite create-from-selection → reuse in another template → edits propagate
- [ ] Glob pattern (`/category/*`) resolves for arbitrary slug
- [ ] Higher-priority assignment wins; equal-priority tie broken by longer pattern
- [ ] After seed, current site renders identically
- [ ] ADMIN + CHIEF_SUB_EDITOR can edit; SUB_EDITOR cannot
- [ ] `mobileVariant: hide` hides block on mobile breakpoint
- [ ] Auto-save fires every 5s of inactivity
- [ ] Test URL tool reports winning template for a given path
- [ ] Empty template → public page shows placeholder, not 500

## Implementation plan (GitHub issues)

23 issues across 10 phases. Live status in epic.

| Phase | Issue | Title |
|---|---|---|
| A | A1 | Prisma schema: Template + TemplateVersion + TemplateAssignment + CompositeBlock |
| A | A2 | Zod layout schema + per-block-type schemas |
| A | A3 | Pattern matcher utility (exact / glob / recursive / priority + tie-break) |
| B | B1 | TemplateRenderer + resolveTemplate |
| B | B2 | BlockRenderer + block registry + per-block fetchers |
| C | C1 | Repoint `apps/web/src/app/page.tsx` to TemplateRenderer |
| C | C2 | Repoint `apps/web/src/app/category/[slug]/page.tsx` to TemplateRenderer |
| C | C3 | `seed-templates.ts` script (3 initial templates + assignments) |
| D | D1 | Sidebar additions + `/page-builder` shell |
| D | D2 | `/page-builder/templates` list + create modal + clone |
| D | D3 | `/page-builder/assignments` list + CRUD + Test URL tool |
| D | D4 | `/page-builder/composites` list + CRUD |
| E | E1 | Visual editor shell (3-pane layout) + iframe preview route |
| E | E2 | Palette drag source + drop targets in canvas |
| E | E3 | Canvas iframe + postMessage protocol (insert/reorder/delete/select) |
| E | E4 | Config panel per block type (driven by block.type registry) |
| E | E5 | mobileVariant selector + auto-save (debounced) |
| F | F1 | Composite create-from-selection (multi-select + Group modal) |
| F | F2 | Composite renderer + cycle detection |
| G | G1 | Version snapshot on publish + history page + restore |
| H | H1 | Polish: undo/redo + presence banner + mobile preview toggle |
| I | I1 | Test suite: unit + integration + Playwright E2E |
| J | J1 | Docs: page-builder.md developer guide + README update |
