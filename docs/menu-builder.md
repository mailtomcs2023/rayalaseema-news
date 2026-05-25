# Menu Builder (Spec #3)

Admin-editable navigation for header / footer / mobile bottom sheet, with
versioned drafts and one-click publish. Replaces the hardcoded `mainNavItems`
arrays that lived in `apps/web/src/components/header.tsx`, `footer.tsx`, and
`mobile-menu.tsx` pre-Spec-3.

Editor lives at `/menu-builder/<location>` in the admin app. Three locations
ship: `header`, `footer`, `mobile`.

---

## Data model

```prisma
enum MenuLocation { HEADER FOOTER MOBILE }
enum MenuItemTargetType { CATEGORY INTERNAL_URL EXTERNAL_URL CONTENT }

model Menu {
  id           String        @id @default(cuid())
  location     MenuLocation  @unique  // one row per location
  name         String
  items        Json          // currently-published items
  draftItems   Json?         // in-progress draft (null after publish)
  isPublished  Boolean       @default(false)
  publishedAt  DateTime?
  versions     MenuVersion[]
}

model MenuVersion {
  id          String   @id @default(cuid())
  menuId      String
  items       Json     // snapshot of what `Menu.items` was BEFORE this publish
  editedById  String?
  editNote    String?
  createdAt   DateTime @default(now())
}
```

Each `items` blob is an array of `MenuItem` (Zod-validated by
`menuItemsSchema` in `packages/db/src/menu-schemas.ts`). Versions are
snapshots of the outgoing published state, not the incoming one — restoring
a version copies its items into `draftItems`, the admin then publishes
manually.

---

## The 4 target types

A `MenuItem.target` is a discriminated union on `target.type`:

| Type             | Shape                                                                                    | Resolved href                  |
|------------------|------------------------------------------------------------------------------------------|--------------------------------|
| `CATEGORY`       | `{ type, categorySlug }`                                                                 | `/category/<slug>`             |
| `INTERNAL_URL`   | `{ type, url }` — `url` must start with `/`                                              | `<url>` passthrough            |
| `EXTERNAL_URL`   | `{ type, url }` — full `https://…`                                                       | `<url>` passthrough            |
| `CONTENT`        | `{ type, contentId, contentTypeCache?, contentSlugCache? }` (caches set at save time)    | `/<typePath>/<slug>` (see below) |

`CONTENT` items cache the content's type + slug at save time so the public
renderer doesn't pay a DB hit per item just to derive the URL. The cache
goes stale only if the linked row is renamed/unpublished — see "broken
link detection" below.

Content-type → URL prefix mapping (in `resolveItemHref`):

```
ARTICLE        → /article
VIDEO          → /video
REEL           → /reel
WEB_STORY      → /story
PHOTO_GALLERY  → /gallery
CARTOON        → /cartoon
BREAKING_NEWS  → null (no public detail page; renderer drops the link)
```

---

## Depth rules

Exactly **2 levels**: top-level items, plus one tier of children.

Enforced structurally in the Zod schema — `childItemSchema` doesn't have a
`children` field, so a 3rd-level grandchild can't be expressed in valid JSON.
This is intentional: deeper trees made the mobile slide-out menu unusable
in early prototypes.

| Limit                       | Cap |
|----------------------------|-----|
| Top-level items per menu   | 30  |
| Children per top-level     | 40  |
| Label length               | 80  |

The editor surfaces a soft warning at 10+ top-level items for `HEADER`
(overflow risk on narrow screens), but allows up to 30 so admins can stage
larger menus for future width tweaks.

---

## Link resolution & cache

Public site fetch path:

```
apps/web/src/lib/menu.ts
  → getMenuItems(location)
    → unstable_cache(prisma.menu.findUnique, ['menu', location], { tags: ['menu'], revalidate: 60 })
```

So each location's menu is cached for 60s on the web side, tagged `menu`.
Publishing invalidates instantly via `revalidateTag('menu', 'global')` in
`apps/admin/src/app/api/menu-builder/menus/[location]/publish/route.ts`.

Consumers (`header.tsx`, `footer.tsx`, `mobile-menu.tsx`) fetch their
location's items via `/api/menu/<location>` on the web app and fall back to
the legacy hardcoded list if the menu is empty / unpublished, so a fresh
deploy with no seed data still renders something.

---

## Editor workflow

1. **Edit** — change items in the tree. Editor auto-saves the draft to
   `Menu.draftItems` 5s after the last edit (debounced).
2. **Publish** — copies `draftItems → items`, snapshots the outgoing
   `items` into `MenuVersion`, clears `draftItems`, sets `isPublished`,
   bumps `publishedAt`, fires `revalidateTag('menu')`.
3. **Version history** — `GET /api/menu-builder/menus/<location>/versions`
   lists prior snapshots; `POST .../versions/<id>/restore` copies that
   snapshot's items back into `draftItems` (does not auto-publish).

### Polish features (F1 #185)

- **Broken-link banner** — every `CATEGORY` / `CONTENT` target is checked
  against the DB on each editor render. Items pointing at a deleted /
  unpublished row get a `⚠` marker + are listed in a yellow banner at top.
- **Presence banner** — `POST /api/menu-builder/menus/<location>/presence`
  is a 10s heartbeat. `GET` returns other active editors on the same
  location (30s TTL). Shown as "👥 Also editing now: …" — last writer
  wins, no soft locking.
- **Overflow warning** — header menus with >10 top-level items get a
  yellow caution under the title.

---

## Adding a 4th menu location

Two surgical edits:

1. **Schema** — add a value to the `MenuLocation` enum:
   ```prisma
   enum MenuLocation {
     HEADER
     FOOTER
     MOBILE
     SIDEBAR   // ← new
   }
   ```
   Run `prisma db push` (deploy.yml does this automatically).

2. **Seed** — add a row to `packages/db/scripts/seed-menus.ts`:
   ```ts
   const SIDEBAR_ITEMS = [ /* … */ ];
   await seed(MenuLocation.SIDEBAR, "Sidebar nav", SIDEBAR_ITEMS);
   ```

The editor route at `/menu-builder/<slug>` is location-agnostic — it
upserts the `Menu` row on load, so the new location is editable
immediately. The web app consumer (a new sidebar component, say) calls
`getMenuItems("SIDEBAR")` the same way `header.tsx` calls it.

The admin sidebar itself stays **code-controlled** — it lists routes to
admin pages, not public navigation, so it has no business in the menu
table.

---

## Test suite

- `packages/db/__tests__/menu-schemas.test.ts` — 24 Zod + resolver tests
  (each target shape, depth-3 rejection, all 7 content-type URL prefixes).
  Run with `bun test packages/db`.

---

## Files

| Path                                                                  | Purpose                                  |
|-----------------------------------------------------------------------|------------------------------------------|
| `packages/db/src/menu-schemas.ts`                                     | Zod schema + `resolveItemHref` + `getMenu` |
| `packages/db/scripts/seed-menus.ts`                                   | Idempotent seed (header/footer/mobile)   |
| `apps/admin/src/app/(dashboard)/menu-builder/[location]/page.tsx`     | Server entry; loads draft + validity sets |
| `apps/admin/src/components/menu-tree-editor.tsx`                      | 3-pane drag-drop editor (client)          |
| `apps/admin/src/app/api/menu-builder/menus/[location]/draft/route.ts` | `PUT draft`                              |
| `…/publish/route.ts`                                                  | `POST publish` + `revalidateTag('menu')` |
| `…/versions/route.ts`                                                 | `GET versions`                            |
| `…/versions/[versionId]/restore/route.ts`                             | `POST restore` → copy into draft         |
| `…/presence/route.ts`                                                 | `POST/GET presence` (10s heartbeat)      |
| `apps/web/src/lib/menu.ts`                                            | `getMenuItems(location)` (60s tag cache) |
| `apps/web/src/app/api/menu/[location]/route.ts`                       | Public read endpoint                      |
