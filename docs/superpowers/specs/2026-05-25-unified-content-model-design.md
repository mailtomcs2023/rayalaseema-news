# Spec #1 — Unified Content Model

**Date:** 2026-05-25
**Status:** Approved by user (sections 1–3); section 4 pending review
**Decomposition:** Part 1 of 3 (Unified Content → Page Builder → Menu Builder)

## Goal

Collapse the 7 separate content tables (`Article`, `Video`, `Reel`, `WebStory`, `PhotoGallery`, `Cartoon`, `BreakingNews`) into a single `Content` table with a `type` enum and a JSON `payload` column for type-specific fields. Replace the 7 sidebar menus, 7 admin pages, and 7 API namespaces with a single `Content` workspace. Preserve the existing editorial workflow and all type-prefixed public URLs.

## Why

- Confusing UX: homepage looks like "one article feed" but pulls from 7 tables; admin has 7 menus for what users perceive as one job.
- Hardcoded MVP shape: adding a new content type today means a new table, new admin page, new API route, new sidebar item. Want to ship "+ Podcast" or "+ Live Blog" in one PR.
- Foundation for Spec #2 (Page Builder): a drag-drop section editor needs ONE addressable content set, not seven.

## Decisions locked (10)

| # | Decision | Choice |
|---|---|---|
| 1 | Sub-project order | Sequential 1 → 2 → 3 |
| 2 | Unify scope | All 7 tables collapse |
| 3 | Schema for type-specific fields | JSON `payload` column |
| 4 | Migration of existing rows | Truncate + drop old tables (no data preserved) |
| 5 | Admin sidebar exposure | Single "Content" menu + filter chips |
| 6 | Editor entry flow | Type-picker modal → morphing form |
| 7 | Public URL structure | Type-prefixed (`/article/[slug]`, `/video/[slug]`, …) |
| 8 | Status/workflow | Full editorial flow (Draft → Submitted → InReview → Approved → Published → Rejected → Archived) for all types |
| 9 | Frontend rendering | Existing section components stay; repoint queries to `Content` with type filter |
| 10 | BreakingNews | type=BREAKING_NEWS, no slug/URL, payload = `{priority, expiresAt}` |

## Data Model

### Prisma additions

```prisma
enum ContentType {
  ARTICLE
  VIDEO
  REEL
  WEB_STORY
  PHOTO_GALLERY
  CARTOON
  BREAKING_NEWS
}

model Content {
  id              String        @id @default(cuid())
  type            ContentType
  title           String
  slug            String?       @unique          // null for BREAKING_NEWS
  summary         String?
  body            String?                        // HTML (ARTICLE only); null otherwise
  featuredImage   String?
  payload         Json?                          // type-specific blob; Zod-validated in app layer

  categoryId      String?
  category        Category?     @relation(fields: [categoryId], references: [id])
  authorId        String
  author          User          @relation(fields: [authorId], references: [id])
  deskId          String?
  desk            Desk?         @relation(fields: [deskId], references: [id])
  constituencyId  String?
  constituency    Constituency? @relation(fields: [constituencyId], references: [id])

  status          ArticleStatus @default(DRAFT)  // reuse existing enum
  featured        Boolean       @default(false)
  language        Language      @default(TELUGU)
  viewCount       Int           @default(0)

  publishedAt     DateTime?
  scheduledAt     DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  // PIB gate (preserved from Article)
  needsPibApproval    Boolean       @default(false)
  pibApprovedAt       DateTime?
  pibReferenceNumber  String?

  // Ingestion dedup (preserved from Article)
  sourceUrl       String?       @unique

  tags            ContentTag[]
  revisions       ContentRevision[]
  comments        Comment[]
  payments        ContentPayment[]

  @@index([type, status, publishedAt])
  @@index([categoryId, status, publishedAt])
  @@index([status, publishedAt])
}

model ContentTag {
  contentId  String
  tagId      String
  content    Content @relation(fields: [contentId], references: [id], onDelete: Cascade)
  tag        Tag     @relation(fields: [tagId], references: [id], onDelete: Cascade)
  @@id([contentId, tagId])
}

model ContentRevision {
  id              String   @id @default(cuid())
  contentId       String
  content         Content  @relation(fields: [contentId], references: [id], onDelete: Cascade)
  title           String
  slug            String?
  summary         String?
  body            String?
  featuredImage   String?
  categoryId      String?
  payload         Json?
  status          ArticleStatus
  editedById      String
  editedBy        User     @relation(fields: [editedById], references: [id])
  editNote        String?
  bodyLength      Int      @default(0)
  createdAt       DateTime @default(now())
}
```

### `payload` schema per type (Zod, in `packages/db/src/payload-schemas.ts`)

| Type | payload shape |
|---|---|
| `ARTICLE` | `{ rating?: number; reviewerName?: string; }` (sourceUrl already promoted to column) |
| `VIDEO` | `{ videoUrl: string; duration: number; thumbnailUrl?: string; }` |
| `REEL` | `{ clipUrl: string; duration: number; }` |
| `WEB_STORY` | `{ slides: Array<{ image: string; caption?: string; }> }` |
| `PHOTO_GALLERY` | `{ photos: Array<{ url: string; caption?: string; }> }` |
| `CARTOON` | `{ caption?: string; date: string; }` (ISO date) |
| `BREAKING_NEWS` | `{ priority: number; expiresAt?: string; }` (ISO datetime) |

### Tables dropped

`Article`, `Video`, `Reel`, `WebStory`, `PhotoGallery`, `Photo` (gallery child), `Cartoon`, `BreakingNews`, `ArticleTag`, `ArticleRevision`.

### FK renames

- `Comment.articleId` → `Comment.contentId`
- `ArticlePayment.articleId` → `ContentPayment.contentId` (model also renamed)

## Admin UI

### Sidebar (after)

```
Dashboard
Content              ← new (single menu)
Review Queue
Categories
Desks
Page Builder         ← Spec #2 placeholder (not implemented here)
Menu Builder         ← Spec #3 placeholder
Journalists
Profile Requests
Payments
Users
Audit Log
Settings
ePaper / ePaper Templates / ePaper Ads / ePaper Images / ePaper Analytics  (unchanged)
```

Removed: Articles, Videos, Reels, Web Stories, Photo Gallery, Cartoons, Breaking News, News Feed (folded into Content list with type filter).

### Pages

| Route | Purpose |
|---|---|
| `/content` | List. Type-filter chips (All / Article / Video / Reel / Story / Photo / Cartoon / Breaking). Status filter. Search. Bulk select + bulk delete + bulk status change. Pagination 15/page. |
| `/content/new` | Type-picker modal (6 large tiles + Breaking). Pick → POST to `/api/content` creating a DRAFT row → redirect to `/content/[id]`. |
| `/content/[id]` | Edit page. Header with type badge + status. Common-fields section + type-specific subform driven by the row's `type`. |

### Type-picker modal

| Tile | Icon | Description |
|---|---|---|
| Article | 📝 | Long-form text with rich editor |
| Video | 📹 | YouTube / hosted video URL |
| Reel | 🎬 | Short vertical clip |
| Web Story | 📖 | Swipeable image cards |
| Photo Gallery | 📷 | Multi-photo collection |
| Cartoon | 🎨 | Single image + caption |
| Breaking News | ⚡ | Ticker headline (no body) |

### Morphing form

Common fields (always present, top of form):
- Title, Slug, Summary, Category, Desk, Constituency, Featured image, Tags, Featured?, Language, Status.

Type-specific subform (driven by `type`):

| Type | Subform fields |
|---|---|
| ARTICLE | Body (full RichEditor), Rating (stars 0-5, optional), Reviewer name (optional), Source URL (optional) |
| VIDEO | Video URL, Duration (seconds), Thumbnail upload |
| REEL | Clip upload, Duration |
| WEB_STORY | Slide builder: add/remove cards, per-slide image + caption |
| PHOTO_GALLERY | Multi-image upload (drag-drop), per-photo caption |
| CARTOON | Single image upload, Caption, Date picker |
| BREAKING_NEWS | Priority (1-10 dropdown), Expiry datetime. No body. No image. Slug auto-generated as `breaking-<timestamp>` and never exposed publicly. |

### RichEditor extensions (ARTICLE editor)

Current editor is TipTap with: Bold, Italic, Underline, Highlight, H2, H3, Image, Link, Lists, TextAlign, Placeholder.

Add to reach industry-standard parity:

| Capability | TipTap extension / lib |
|---|---|
| Headings H1, H4, H5, H6 | StarterKit (already loaded, just expose more levels) |
| Text color picker | `@tiptap/extension-color` + `@tiptap/extension-text-style` |
| Strikethrough | `@tiptap/extension-strike` (in StarterKit) |
| Blockquote | StarterKit |
| Code (inline + block) with syntax highlight | `@tiptap/extension-code-block-lowlight` + `lowlight` |
| Task list (checkboxes) | `@tiptap/extension-task-list` + `task-item` |
| Table (rows, cols, header, cell) | `@tiptap/extension-table` + `table-row` + `table-cell` + `table-header` |
| Superscript / Subscript | `@tiptap/extension-superscript` + `subscript` |
| YouTube embed | `@tiptap/extension-youtube` |
| Horizontal rule | StarterKit |
| Indent / Outdent | Custom command on Paragraph + List |
| Source HTML toggle | Custom mode switch (textarea ↔ EditorContent) |
| Clear formatting | `editor.chain().focus().clearNodes().unsetAllMarks().run()` |
| Image crop + resize + alt + align | `react-image-crop` modal, opens on insert and on click of existing image. Resize via drag handles using a custom node view. |
| Emoji | `@tiptap/extension-emoji` or static picker |

Toolbar layout (top sticky bar):
```
[H▾] [B] [I] [U] [S] [A▾color] [≡highlight] | [• list] [1. list] [☐ task] | [" quote] [</> code] [— rule] |
[⟵] [→] [center] [justify] | [Link] [Image] [▶ YouTube] [Table] | [↶ undo] [↷ redo] [⌫ clear] | [<> source]
```

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/content` | session | List. Query params: `type`, `status`, `category`, `search`, `page`, `limit`. |
| POST | `/api/content` | ADMIN, CHIEF_SUB_EDITOR, SUB_EDITOR, REPORTER | Create. Body validated by common-Zod + per-type payload-Zod. |
| GET | `/api/content/[id]` | session | Fetch single with relations (category, author, desk, tags). |
| PUT | `/api/content/[id]` | author or higher role | Update. Re-runs payload-Zod if `payload` touched. Writes ContentRevision snapshot. |
| DELETE | `/api/content/[id]` | ADMIN | Hard delete. |
| POST | `/api/content/[id]/pib-approve` | ADMIN | PIB gate (reuses existing logic from `/api/articles/[id]/pib-approve`). |

Deleted: `/api/articles`, `/api/videos`, `/api/reels`, `/api/stories`, `/api/galleries`, `/api/cartoons`, `/api/breaking-news` (all sub-routes too).

## Frontend (apps/web)

### Data layer (`apps/web/src/lib/db-queries.ts`)

Repoint without changing function signatures (so React components stay unchanged):

| Function | New query |
|---|---|
| `getFeaturedArticles` | `where: { type: "ARTICLE", status: "PUBLISHED", featured: true }` |
| `getLatestArticles` | `where: { type: "ARTICLE", status: "PUBLISHED" }` |
| `getArticlesByCategory` | `where: { type: "ARTICLE", category: {slug}, status: "PUBLISHED" }` |
| `getHomepageData` → `articlesByCategory` | Same shape, single query with `type: "ARTICLE"` |
| `getVideos` | `where: { type: "VIDEO", status: "PUBLISHED" }`, projects payload into existing Video shape |
| `getReels` | `where: { type: "REEL", status: "PUBLISHED" }` |
| `getWebStories` | `where: { type: "WEB_STORY", status: "PUBLISHED" }` |
| `getPhotoGalleries` | `where: { type: "PHOTO_GALLERY", status: "PUBLISHED" }` |
| `getCartoons` | `where: { type: "CARTOON", status: "PUBLISHED" }` |
| `getBreakingNews` (new) | `where: { type: "BREAKING_NEWS", status: "PUBLISHED", OR: [{payload.path("expiresAt"): null}, {payload.path("expiresAt"): { gt: now }}] }` |

### Public routes

| Existing | New |
|---|---|
| `/article/[slug]` (preserve) | Same path, reads Content where `type=ARTICLE` |
| — | `/video/[slug]` (renders video player + payload) |
| — | `/reel/[slug]` (vertical clip player) |
| — | `/story/[slug]` (swipeable card viewer for WEB_STORY) |
| — | `/gallery/[slug]` (PHOTO_GALLERY lightbox) |
| — | `/cartoon/[slug]` (single-image page with caption) |

BREAKING_NEWS has no public detail page; only renders in the ticker.

### Homepage components

No changes to `apps/web/src/app/page.tsx` rendering. `getFullHomepageData` returns the same shape; only its internal Prisma queries change.

## Migration + Rollout

### Step 1 — DB migration

Single squashed migration file: `packages/db/prisma/migrations/<ts>_unified_content_model/migration.sql`.

Migration script does:
1. `CREATE TYPE "ContentType" AS ENUM (...)`
2. `CREATE TABLE "Content" (...)` with indexes
3. `CREATE TABLE "ContentTag" (...)`
4. `CREATE TABLE "ContentRevision" (...)`
5. `ALTER TABLE "Comment" RENAME COLUMN "articleId" TO "contentId"` (data preserved, FK redirected)
6. `CREATE TABLE "ContentPayment" (...)` copying from `ArticlePayment` shape with `contentId` FK
7. `DROP TABLE` (cascade): `Photo`, `PhotoGallery`, `WebStory`, `Cartoon`, `Video`, `Reel`, `BreakingNews`, `ArticleTag`, `ArticleRevision`, `ArticlePayment`, `Article` (in dependency order)

### Step 2 — Backend swap

- New `/api/content` route + Zod schemas.
- Delete 7 old API namespaces.
- Update `/api/auto-publish`, `/api/auto-fetch`, `/api/cron/publish-scheduled` to write `Content` rows.
- Update `apps/web/src/lib/db-queries.ts` per the table above.

### Step 3 — Admin shell

- Build `/content` list page (modeled on `/articles`).
- Build type-picker modal.
- Build `/content/[id]` editor with morphing form.
- Replace sidebar.
- Delete dead admin pages and route files.

### Step 4 — Public routes

- New page files for `/video`, `/reel`, `/story`, `/gallery`, `/cartoon`.
- Update `/article/[slug]` data source.

### Step 5 — Deploy

- Single PR, single deploy.
- **Destructive**: drops ~10 tables on prod. User already wiped Articles; the ~20 seed rows in Stories/Videos/Galleries/Cartoons/BreakingNews are dev-seed artifacts (`fill-content.ts`).
- Add `pg_dump` step to `.github/workflows/deploy.yml` immediately before `prisma migrate deploy`.
- Backup stored in `/home/azureuser/db-backups/pre-content-unify-<ts>.sql`.

### Step 6 — Cleanup

- Delete dead admin pages, API routes, components (e.g., old `crud-table.tsx` use sites if obsolete).
- Update `packages/db/scripts/fill-content.ts` to insert into `Content` (or delete the script if no longer needed).

## Risks

| Risk | Mitigation |
|---|---|
| Drop 10 tables on prod = data loss | `pg_dump` backup step in deploy.yml. ~20 known seed rows acceptable loss. |
| Single-PR migration breaks if any step fails | Each Phase A–J shipped as its own PR; foundational schema migration in Phase A is the only destructive step. |
| `payload` JSON drift over time | Zod schema per type; validated on POST/PUT; ad-hoc audit script in `packages/db/scripts/validate-payloads.ts` |
| FK rename on `Comment` breaks existing comments | Rename preserves data; covered by integration test |
| URL break for `/article/[slug]` deep links | None — route preserved |
| TipTap color + text-style order matters | text-style loaded before color; documented in inline comment |
| Editorial flow on BREAKING_NEWS feels heavy | Type-picker modal sets initial status to SUBMITTED for breaking (skips Draft step). Per-type default in `/api/content` POST handler. |
| Image crop UX with Telugu titles | `react-image-crop` is layout-agnostic; smoke-test with Telugu alt text in QA |
| Auto-publish writes wrong type during transition | Auto-publish always sets `type=ARTICLE`; behavior preserved exactly |

## Testing

- **Unit**: Zod payload schemas per type (`packages/db/payload-schemas.test.ts`).
- **Integration**: `/api/content` CRUD smoke per type (7 round-trips). PIB approval gate. Workflow transitions.
- **Frontend**: homepage renders each section reading from Content with seeded fixtures (1 row per type).
- **Manual**: Telugu title + body in ARTICLE editor; image crop with Telugu alt; breaking ticker priority sort; empty-DB homepage still renders placeholder.

## Out of scope (other specs / future)

- Drag-drop Page Builder for homepage and category pages → **Spec #2**
- Menu Builder for header nav + sidebar → **Spec #3**
- New content types beyond the 7 (Podcast, Live Blog) — handled by enum extension later
- Per-type custom editorial flows (single flow for now)
- Bulk RSS / NewsData import beyond current auto-publish
- AMP / Web Stories AMP variant

## Success criteria

- [ ] 1 sidebar item "Content" replaces 7 menus
- [ ] All 7 types created + edited via single morphing form
- [ ] Editor toolbar matches industry standard (H1–H6, color, blockquote, table, code, task list, sub/sup, image crop, etc.)
- [ ] Homepage renders each section reading from `Content` with type filter (no shape change)
- [ ] `/article/[slug]` URLs continue to resolve (no redirects needed)
- [ ] New `/video`, `/reel`, `/story`, `/gallery`, `/cartoon` routes resolve
- [ ] Empty `Content` table does not 500 the homepage (placeholder visible)
- [ ] Editorial workflow (Draft → Published) works for all 7 types
- [ ] PIB gate works on Content same as it did on Article
- [ ] `pg_dump` backup runs in deploy.yml before destructive migration

## Implementation plan (GitHub issues)

Broken into 10 phases / 25 issues. See epic #104 for live status.

**Note:** Original A1 (#105) was split into A1 (additive only — add Content tables) + A1B (#188, rename FKs on Comment/SocialPost/HeadlineTest/ArticleReview) + A1C (#189, drop old tables) after the implementation discovery that Article is referenced by ~6 FKs across the codebase, not just Comment as the original issue described. A1B + A1C run at the END of the epic (after all other code repointing is complete) to keep blast radius small and let intermediate phases ship safely.

| Phase | Issue | Title |
|---|---|---|
| A. Foundation | 1 | Prisma migration: add Content + drop 10 old tables |
| A. Foundation | 2 | Zod payload schemas per ContentType |
| A. Foundation | 3 | `/api/content` CRUD + PIB approve |
| B. Cron flows | 4 | Update auto-publish + auto-fetch + cron to use Content |
| C. Web data layer | 5 | Repoint `apps/web/src/lib/db-queries.ts` to Content |
| D. Public routes | 6 | Add `/video`, `/reel`, `/story`, `/gallery`, `/cartoon` pages |
| D. Public routes | 7 | Repoint `/article/[slug]` to Content |
| E. Admin shell | 8 | Sidebar consolidation (7 → 1 "Content") |
| E. Admin shell | 9 | `/content` list page (chips, search, bulk) |
| E. Admin shell | 10 | `/content/new` type-picker modal |
| F. Editor | 11 | Morphing form: common fields + ARTICLE subform |
| F. Editor | 12 | Morphing form: VIDEO + REEL subforms |
| F. Editor | 13 | Morphing form: WEB_STORY slide builder |
| F. Editor | 14 | Morphing form: PHOTO_GALLERY multi-upload |
| F. Editor | 15 | Morphing form: CARTOON subform |
| F. Editor | 16 | Morphing form: BREAKING_NEWS subform |
| G. RichEditor | 17 | TipTap extensions: color, task-list, table, sub/sup, code-block-lowlight, YouTube, H1+H4-H6 |
| G. RichEditor | 18 | Image crop + resize modal (react-image-crop) |
| H. Cleanup | 19 | Delete dead admin pages (`/articles`, `/videos`, etc.) |
| H. Cleanup | 20 | Delete dead API routes |
| I. Deploy safety | 21 | `pg_dump` step in `.github/workflows/deploy.yml` |
| J. Tests + docs | 22 | Zod + API smoke tests |
| J. Tests + docs | 23 | README / docs update |
