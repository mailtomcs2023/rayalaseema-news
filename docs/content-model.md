# Unified Content Model

**Spec**: [docs/superpowers/specs/2026-05-25-unified-content-model-design.md](superpowers/specs/2026-05-25-unified-content-model-design.md)
**Epic**: [#104](https://github.com/mailtomcs2023/rayalaseema-news/issues/104)

## What it replaces

Until Spec #1, the platform shipped seven separate content tables (`Article`, `Video`, `Reel`, `WebStory`, `PhotoGallery`, `Cartoon`, `BreakingNews`), seven sidebar menu items, seven admin pages, seven API namespaces, and seven query helpers in `apps/web/src/lib/db-queries.ts`. Adding an eighth content type required touching all seven layers. Editors saw "Content" as one concept but had to remember which sidebar item to click for each variant.

The unified `Content` model collapses all of that into a single table with a `type` enum and a JSON `payload` column for type-specific fields.

## Data model (Prisma)

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
  slug            String?       @unique          // null only for BREAKING_NEWS
  summary         String?
  body            String?                        // HTML - ARTICLE only
  featuredImage   String?
  payload         Json?                          // type-specific blob
  categoryId      String?
  authorId        String
  deskId          String?
  constituencyId  String?
  status          ArticleStatus @default(DRAFT)
  featured        Boolean       @default(false)
  language        Language      @default(TELUGU)
  viewCount       Int           @default(0)
  publishedAt     DateTime?
  scheduledAt     DateTime?
  sourceUrl       String?       @unique
  needsPibApproval    Boolean   @default(false)
  pibApprovedAt       DateTime?
  pibReferenceNumber  String?
}
```

Related models: `ContentTag`, `ContentRevision`, `ContentPayment`. They mirror the old `ArticleTag` / `ArticleRevision` / `ArticlePayment` shapes but link to `Content` via `contentId`.

### `payload` shape per type

Validated server-side via Zod schemas in [`packages/db/src/payload-schemas.ts`](../packages/db/src/payload-schemas.ts):

| Type            | payload shape                                                          |
|-----------------|------------------------------------------------------------------------|
| `ARTICLE`       | `{ rating?: 0-5, reviewerName?: string }`                              |
| `VIDEO`         | `{ videoUrl: string, duration: int ≥ 0, thumbnailUrl?: string }`       |
| `REEL`          | `{ clipUrl: string, duration: int ≥ 0 }`                               |
| `WEB_STORY`     | `{ slides: 1-20 × { image: string, caption?: string } }`               |
| `PHOTO_GALLERY` | `{ photos: 1-100 × { url: string, caption?: string } }`                |
| `CARTOON`       | `{ caption?: string ≤ 500, date: ISO datetime }`                       |
| `BREAKING_NEWS` | `{ priority: 1-10, expiresAt?: ISO datetime }`                         |

Each schema is `.strict()` - unknown payload keys reject on save.

## Where it lives in code

| Layer | Path |
|---|---|
| Schema | `packages/db/prisma/schema.prisma` (look for `model Content`) |
| Zod validation | `packages/db/src/payload-schemas.ts` |
| Admin API | `apps/admin/src/app/api/content/route.ts` (list/create) + `apps/admin/src/app/api/content/[id]/route.ts` (get/put/delete) + `apps/admin/src/app/api/content/[id]/pib-approve/route.ts` |
| Admin list page | `apps/admin/src/app/(dashboard)/content/page.tsx` |
| Admin type picker | `apps/admin/src/app/(dashboard)/content/new/page.tsx` |
| Admin morphing editor | `apps/admin/src/app/(dashboard)/content/[id]/page.tsx` + `apps/admin/src/components/content-payload-editor.tsx` |
| Web data layer | `apps/web/src/lib/db-queries.ts` |
| Web public routes | `apps/web/src/app/article/[slug]/`, `/video/[slug]/`, `/reel/[slug]/`, `/story/[slug]/`, `/gallery/[slug]/`, `/cartoon/[slug]/` |
| Cron auto-publish | `apps/admin/src/app/api/cron/publish-scheduled/route.ts` (flips SCHEDULED → PUBLISHED for any Content type) |
| Ingestion | `apps/admin/src/app/api/auto-publish/route.ts`, `apps/admin/src/app/api/auto-fetch/route.ts`, `apps/admin/src/app/api/fetch-news/route.ts` (write `Content` with `type: "ARTICLE"`) |

## Public URL structure

| Path | Content type | Notes |
|---|---|---|
| `/article/[slug]` | ARTICLE | Preserved from pre-Spec-1 site - no redirects needed |
| `/video/[slug]` | VIDEO | YouTube / Vimeo / hosted player |
| `/reel/[slug]` | REEL | Vertical 9:16 player |
| `/story/[slug]` | WEB_STORY | CSS scroll-snap card carousel |
| `/gallery/[slug]` | PHOTO_GALLERY | CSS columns masonry |
| `/cartoon/[slug]` | CARTOON | Single image + caption + date |
| (no URL) | BREAKING_NEWS | Renders only in the ticker - no detail page |

## Adding an 8th content type

This is the payoff of Spec #1. Adding "Podcast" (for example) takes roughly:

1. **Schema** - add `PODCAST` to the `ContentType` enum in `schema.prisma`. Run `bunx prisma db push`.
2. **Zod** - add `podcastPayloadSchema` to `packages/db/src/payload-schemas.ts` and slot it into `PAYLOAD_SCHEMAS`. The `_Exhaustive` sentinel will fail at compile time if you forget.
3. **Admin editor subform** - add a branch in `apps/admin/src/components/content-payload-editor.tsx` rendering the fields you need (`audioUrl`, `duration`, etc.).
4. **Admin type picker tile** - append an entry to `TYPES` in `apps/admin/src/app/(dashboard)/content/new/page.tsx`.
5. **Admin list page badge** - add the new type to `TYPE_COLORS` + `TYPE_ORDER` in `apps/admin/src/app/(dashboard)/content/page.tsx`.
6. **Web data layer** - add a `projectPodcast` helper and a `getPodcasts` / `getPodcastBySlug` helper in `apps/web/src/lib/db-queries.ts`.
7. **Web public route** - `apps/web/src/app/podcast/[slug]/page.tsx`.

No new DB tables, no new admin pages, no new sidebar menus, no new API namespaces.

## Editorial workflow

Same eight-state `ArticleStatus` enum as before. Applies to **every** ContentType:

```
DRAFT → SUBMITTED → IN_REVIEW → APPROVED → PUBLISHED
                                        ↘ SCHEDULED → (cron) → PUBLISHED
                                        ↘ REJECTED → DRAFT
                                        ↘ ARCHIVED
```

`BREAKING_NEWS` is the only type whose create endpoint defaults to `SUBMITTED` instead of `DRAFT` (one-line ticker content doesn't benefit from a Draft phase).

The PIB approval gate ([#99](https://github.com/mailtomcs2023/rayalaseema-news/issues/99)) is preserved on `Content` - when `needsPibApproval=true`, publishing is blocked until an ADMIN POSTs `/api/content/[id]/pib-approve` with a `pibReferenceNumber`.

## Migration strategy

Spec #1 used a non-destructive additive rollout:

- **Phase A1 ([#105](https://github.com/mailtomcs2023/rayalaseema-news/issues/105))** - added `Content` + `ContentTag` + `ContentRevision` + `ContentPayment` tables. Legacy tables untouched.
- **Phase B ([#109](https://github.com/mailtomcs2023/rayalaseema-news/issues/109))** - switched ingestion (auto-publish, auto-fetch, fetch-news, cron) to write `Content`.
- **Phase C ([#110](https://github.com/mailtomcs2023/rayalaseema-news/issues/110))** - repointed `apps/web/src/lib/db-queries.ts` to read from `Content`.
- **Phase D ([#111](https://github.com/mailtomcs2023/rayalaseema-news/issues/111), [#112](https://github.com/mailtomcs2023/rayalaseema-news/issues/112))** - new `/video`, `/reel`, `/story`, `/gallery`, `/cartoon` routes + repointed `/article/[slug]`.
- **Phases E-G ([#113](https://github.com/mailtomcs2023/rayalaseema-news/issues/113)-[#129](https://github.com/mailtomcs2023/rayalaseema-news/issues/129))** - admin shell, morphing editor, RichEditor upgrades.
- **Phase I ([#134](https://github.com/mailtomcs2023/rayalaseema-news/issues/134))** - `pg_dump` step landed in `deploy.yml` so any future destructive step has a backup.

Remaining work (tracked in epic [#104](https://github.com/mailtomcs2023/rayalaseema-news/issues/104)):
- [#188](https://github.com/mailtomcs2023/rayalaseema-news/issues/188) (A1B) - rename FK columns from `articleId` to `contentId` on `Comment`, `SocialPost`, `HeadlineTest`, `ArticleReview` (where appropriate)
- [#189](https://github.com/mailtomcs2023/rayalaseema-news/issues/189) (A1C) - drop the legacy `Article` / `Video` / `Reel` / `WebStory` / `PhotoGallery` / `Photo` / `Cartoon` / `BreakingNews` tables. Pre-requisite: `pg_dump` (#134) running on prod
- [#133](https://github.com/mailtomcs2023/rayalaseema-news/issues/133) (H2) - delete `/api/articles`, `/api/videos`, etc. once internal callers (ePaper editor, web header ticker) migrate to `/api/content`
- [#129](https://github.com/mailtomcs2023/rayalaseema-news/issues/129) (G2) - image crop + resize modal (`react-image-crop`)
- [#136](https://github.com/mailtomcs2023/rayalaseema-news/issues/136) (J1) - Zod schema unit tests + `/api/content` smoke tests

## Operational notes

- The cron runs at 1-minute intervals and POSTs `/api/cron/publish-scheduled` with a `Bearer $CRON_SECRET` header. After Spec #1, it publishes scheduled content of **any** type (not just articles).
- Backup files land in `/home/azureuser/db-backups/pre-deploy-<utc-ts>.sql.gz` on the Azure VM. Keep last 14 - older ones are pruned automatically by the deploy workflow.
- `Content.sourceUrl` is unique. Wire-story ingestion uses this for dedup; the same URL cannot be ingested twice regardless of which API path inserted it.

## Next specs

Spec [#2](superpowers/specs/2026-05-25-page-builder-design.md) (Page Builder, epic [#150](https://github.com/mailtomcs2023/rayalaseema-news/issues/150)) and Spec [#3](superpowers/specs/2026-05-25-menu-builder-design.md) (Menu Builder, epic [#174](https://github.com/mailtomcs2023/rayalaseema-news/issues/174)) build on top of this. Both reference `Content` for their data targets.
