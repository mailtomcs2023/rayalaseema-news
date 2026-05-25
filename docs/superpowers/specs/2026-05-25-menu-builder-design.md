# Spec #3 — Menu Builder

**Date:** 2026-05-25
**Status:** Approved by user
**Decomposition:** Part 3 of 3 (Unified Content → Page Builder → **Menu Builder**)
**Depends on:** Spec #1 (Unified Content Model) — menu items can target Content rows.
**Also benefits from:** Spec #2 (Page Builder) — menu items often point at URLs whose layouts are template-driven, but Menu Builder doesn't require Spec #2 to ship first.

## Goal

Replace hardcoded category/link arrays in `apps/web/src/components/header.tsx`, `footer.tsx`, and `mobile-menu.tsx` with admin-editable menu trees stored in DB. Admin manages 3 named menus (HEADER / FOOTER / MOBILE) via a WordPress-style drag-drop tree editor. Each item targets a Category / Internal URL / External URL / Content row. Draft + Published + version history.

## Why

- Today, changing a top-bar item or footer link requires a code deploy.
- Newsroom wants to add festival sections, breaking-event links, sponsored partner URLs without engineering.
- Mobile menu and footer drift from header because all are maintained separately in code.

## Decisions locked (6)

| # | Decision | Choice |
|---|---|---|
| 1 | Menu scope | Header + Footer + Mobile (3 named menus) |
| 2 | Item target types | Category / Internal URL / External URL / Content (4 types) |
| 3 | Nesting depth | 2 levels (top + dropdown children) |
| 4 | Editor UX | Drag-drop tree (WordPress Menu style) |
| 5 | Versioning | Draft + Published + revision history |
| 6 | Permissions | ADMIN + CHIEF_SUB_EDITOR |

## Data Model

```prisma
enum MenuLocation {
  HEADER
  FOOTER
  MOBILE
}

enum MenuItemTargetType {
  CATEGORY
  INTERNAL_URL
  EXTERNAL_URL
  CONTENT
}

model Menu {
  id              String       @id @default(cuid())
  location        MenuLocation @unique           // one menu per location
  name            String
  items           Json                            // published tree
  draftItems      Json?                           // in-progress edits
  isPublished     Boolean      @default(false)
  publishedAt     DateTime?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
  versions        MenuVersion[]
}

model MenuVersion {
  id          String   @id @default(cuid())
  menuId      String
  menu        Menu     @relation(fields: [menuId], references: [id], onDelete: Cascade)
  items       Json
  editedById  String
  editedBy    User     @relation(fields: [editedById], references: [id])
  editNote    String?
  createdAt   DateTime @default(now())
  @@index([menuId, createdAt])
}
```

### `items` JSON shape (2-level recursive tree)

```json
[
  {
    "id": "itm_1",
    "label": "కర్నూలు",
    "icon": null,
    "target": { "type": "CATEGORY", "categorySlug": "kurnool" },
    "mobileVariant": "show",
    "openInNewTab": false,
    "children": []
  },
  {
    "id": "itm_2",
    "label": "మరిన్ని",
    "target": { "type": "INTERNAL_URL", "url": "#" },
    "mobileVariant": "show",
    "children": [
      {
        "id": "itm_3",
        "label": "ఆంధ్రప్రదేశ్",
        "target": { "type": "CATEGORY", "categorySlug": "andhra-pradesh" },
        "mobileVariant": "show",
        "children": []
      },
      {
        "id": "itm_4",
        "label": "Election Live Blog",
        "target": { "type": "CONTENT", "contentId": "cln_xyz" },
        "openInNewTab": false,
        "mobileVariant": "hide",
        "children": []
      }
    ]
  }
]
```

`mobileVariant` ∈ `{ "show", "hide" }`. Max depth = 2 (enforced by Zod; deeper trees rejected).

### Target shapes (Zod discriminated union on `type`)

| `type` | Required fields |
|---|---|
| `CATEGORY` | `categorySlug` (must exist in Category table) |
| `INTERNAL_URL` | `url` (must start with `/`) |
| `EXTERNAL_URL` | `url` (must be absolute http/https), `openInNewTab` defaults true |
| `CONTENT` | `contentId` (must exist in Content table) |

## Admin UI

### Sidebar addition

```
Menu Builder
  ├ Header
  ├ Footer
  └ Mobile
```

Each child opens the same editor component scoped to that menu's location.

### Pages

| Route | Purpose |
|---|---|
| `/menu-builder/[location]` | Tree editor for the menu (location = `header` / `footer` / `mobile`). |
| `/menu-builder/[location]/versions` | Version history list. View / restore any snapshot. |

### Editor layout (3-pane)

```
┌─────────────────────────────────────────────────────────────────┐
│ Header: [Menu Name] Draft|Published [Save Draft] [Publish ▾]    │
├──────────┬──────────────────────────────────────┬───────────────┤
│ Palette  │  Tree (drag-drop, max depth 2)      │ Item Config   │
│          │                                      │               │
│ + Category│  ▼ కర్నూలు            [⋮]          │ Label:        │
│   [pick▾]│  ▼ నంద్యాల           [⋮]          │ [మరిన్ని]    │
│ + URL    │  ▼ మరిన్ని            [⋮]          │               │
│ + External│    └ ఆంధ్రప్రదేశ్    [⋮]          │ Target:       │
│ + Content │    └ Election Live   [⋮]          │ ● Category ▾  │
│  [pick▾] │  ▼ సినిమా             [⋮]          │ ○ URL         │
│          │                                      │ ○ External    │
│          │  + Add menu item                    │ ○ Content     │
│          │                                      │               │
│          │                                      │ Mobile: ●show │
│          │                                      │ New tab: ☐   │
│          │                                      │ [Delete]      │
└──────────┴──────────────────────────────────────┴───────────────┘
```

### Interactions

- Drag from palette → drops as new top-level item.
- Drag tree item rightward (over a sibling that's already top-level) → makes it a child of that sibling.
- Drag tree item leftward → unnests to top level.
- Drag up/down → reorder within current level.
- Editor blocks drag that would exceed depth 2 (visual rejection cue).
- Click item → opens config panel.
- Auto-save draft every 5s of inactivity.
- Header `Publish` dropdown: Publish Now / Discard Draft.

### Header overflow warning

If HEADER menu has > 10 top-level items, editor surfaces a yellow banner: "More than 10 top-level items may overflow on narrow desktops — consider moving items under a dropdown."

### Broken-link banner

On load, editor validates every CATEGORY / CONTENT target against current DB. Items pointing at deleted rows show ⚠ icon + listed in a top-of-page banner: "3 items reference deleted content."

## Frontend

| Component | Change |
|---|---|
| `apps/web/src/components/header.tsx` | Replace hardcoded `CATEGORIES` array with `await getMenu('HEADER')` |
| `apps/web/src/components/footer.tsx` | Replace hardcoded link list with `await getMenu('FOOTER')` |
| `apps/web/src/components/mobile-menu.tsx` | Replace hardcoded sections with `await getMenu('MOBILE')` |

New helper `apps/web/src/lib/menu.ts`:

```tsx
import { unstable_cache } from "next/cache";

export const getMenu = unstable_cache(
  async (location: MenuLocation): Promise<MenuItem[]> => {
    const menu = await prisma.menu.findUnique({ where: { location } });
    if (!menu || !menu.isPublished) return [];
    return menu.items as MenuItem[];
  },
  ["menu"],
  { revalidate: 60, tags: ["menu"] },
);
```

Cache invalidated via `revalidateTag('menu')` after publish.

### Link resolver (`apps/web/src/lib/menu.ts`)

```tsx
export function resolveItemHref(item: MenuItem): string {
  switch (item.target.type) {
    case "CATEGORY":     return `/category/${item.target.categorySlug}`;
    case "INTERNAL_URL": return item.target.url;
    case "EXTERNAL_URL": return item.target.url;
    case "CONTENT":      return contentTypeToPath(item.target.contentTypeCache, item.target.contentSlugCache);
  }
}
```

For CONTENT type, `contentTypeCache` and `contentSlugCache` are denormalised onto the item at save time (lookup via Content row) so frontend render doesn't need an extra DB hit per item.

`contentTypeToPath`: ARTICLE → `/article/[slug]`, VIDEO → `/video/[slug]`, etc.

### Broken-target rendering on frontend

- CATEGORY where slug doesn't exist → render label as plain `<span>` (no link), still visible.
- CONTENT where ID doesn't exist → render label as plain `<span>`.
- INTERNAL_URL / EXTERNAL_URL → always render (no validation).

## Migration

`packages/db/scripts/seed-menus.ts` (idempotent):

1. **HEADER** menu — items copied from current `header.tsx` CATEGORIES array:
   - Districts: కర్నూలు, నంద్యాల, అనంతపురం, శ్రీ సత్యసాయి, వై.యస్.ఆర్, తిరుపతి, అన్నమయ్య, చిత్తూరు
   - Sections: క్రీడలు, సినిమా, రాశి ఫలాలు
   - "మరిన్ని" with children: ఆంధ్రప్రదేశ్, తెలంగాణ, జాతీయం, అంతర్జాతీయం, బిజినెస్, టెక్నాలజీ, సినిమా రివ్యూలు, పరీక్షా ఫలితాలు, ఉద్యోగాలు, వ్యవసాయం, విద్య, ఆరోగ్యం, భక్తి, నేరాలు, నవ్యసీమ, NRI వార్తలు, వాతావరణం, రియల్ ఎస్టేట్, ఫీచర్ పేజీలు, సంపాదకీయం, పాఠకుల లేఖలు, రాయలసీమ రుచులు, ఎట్టెట, పజిల్స్
2. **FOOTER** menu — items copied from current footer link groups
3. **MOBILE** menu — items copied from current mobile bottom-sheet content

Each menu set to `isPublished=true`. After seed, public site renders identically; menus now editable.

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/menu-builder/menus` | session | List all 3 menus |
| GET | `/api/menu-builder/menus/[location]` | session | Fetch one menu |
| PUT | `/api/menu-builder/menus/[location]/draft` | ADMIN, CHIEF_SUB_EDITOR | Save draft (Zod-validated, depth ≤ 2) |
| POST | `/api/menu-builder/menus/[location]/publish` | ADMIN, CHIEF_SUB_EDITOR | Promote draft → items, snapshot version, revalidate cache tag |
| POST | `/api/menu-builder/menus/[location]/discard-draft` | ADMIN, CHIEF_SUB_EDITOR | Clear `draftItems` |
| GET | `/api/menu-builder/menus/[location]/versions` | session | List version history |
| POST | `/api/menu-builder/menus/[location]/restore/[versionId]` | ADMIN | Copy version into draft |

## Rollout phases

- **A** Schema + Zod (max depth 2) + getMenu helper + link resolver
- **B** Admin shell: sidebar + `/menu-builder/[location]` routes
- **C** Drag-drop tree editor (palette + tree + config panel + depth enforcement)
- **D** Auto-save + publish + version history + restore
- **E** Repoint header / footer / mobile components + seed script
- **F** Polish (broken-link warnings, presence banner, overflow warning)
- **G** Tests
- **H** Docs

## Risks

| Risk | Mitigation |
|---|---|
| Edits create cycles via shared IDs | IDs are flat per item, no cross-references; no cycles possible |
| Deep tree via direct JSON edit | Zod `.max(2)` depth enforcement on POST/PUT |
| Item targets deleted entity | Resolver falls back to plain span; admin banner surfaces broken items |
| Header > 10 items break layout | Editor warning banner + responsive overflow → CSS handles gracefully |
| Cache stale after publish | `revalidateTag('menu')` triggered in publish endpoint |
| Two editors collide on same menu | Last-write-wins + presence banner (10s poll, same as Spec #2) |
| Seed re-run overwrites manual edits | Idempotent by `location` unique constraint; skips existing |
| Telugu label sort/display | Items render in stored order; no sorting; Telugu unicode preserved |

## Testing

- **Unit**: Zod schema (good + bad shapes, depth 3 rejected, all 4 target types), link resolver, getMenu cache
- **Integration**: PUT draft → POST publish → GET as anonymous → verify items live
- **E2E (Playwright)**: drag Category item from palette → publish → reload public page → assert link rendered correctly
- **Manual**: Telugu labels render; broken-link banner appears for deleted category; mobile menu reflects MOBILE menu content; presence banner shows when two sessions edit same menu

## Out of scope

- Admin sidebar (stays code-controlled for security)
- Multi-language menus (single Telugu set)
- Mega-menu with image panels
- Conditional visibility (logged-in / role-based)
- Per-page menu overrides
- Touch-drag on mobile editor (admin desktop-only for now)

## Success criteria

- [ ] Three menus (HEADER / FOOTER / MOBILE) editable from admin
- [ ] Drag-drop tree works: reorder, nest, unnest, depth limit enforced
- [ ] All 4 target types creatable and resolve correctly on public site
- [ ] Draft + Publish round-trip works; published menu reflects on public site within cache window
- [ ] Version history shows snapshots; restore puts version into draft
- [ ] After seed, public header/footer/mobile render identically to pre-Spec #3 site
- [ ] ADMIN + CHIEF_SUB_EDITOR can edit; SUB_EDITOR + REPORTER cannot
- [ ] `mobileVariant: hide` hides item on mobile breakpoint
- [ ] Broken-link banner surfaces in admin when items reference deleted entities
- [ ] Auto-save fires every 5s of inactivity
- [ ] Empty menu → public component renders nothing (no 500)

## Implementation plan (GitHub issues)

13 issues across 8 phases.

| Phase | Issue | Title |
|---|---|---|
| A | A1 | Prisma schema: Menu + MenuVersion + enums |
| A | A2 | Zod schema (max depth 2, all 4 target types) + getMenu helper + link resolver |
| B | B1 | Sidebar additions + `/menu-builder/[location]` route shell |
| C | C1 | Tree editor 3-pane shell + palette (4 pickers) |
| C | C2 | Drag-drop tree (depth enforcement, reorder, nest/unnest) |
| C | C3 | Item config panel (label + target form + mobileVariant + openInNewTab) |
| D | D1 | Auto-save draft (debounced) + Publish + revalidateTag cache invalidation |
| D | D2 | Version history page + restore endpoint |
| E | E1 | Repoint header.tsx + footer.tsx + mobile-menu.tsx to getMenu |
| E | E2 | seed-menus.ts script (3 initial menus matching current site) |
| F | F1 | Polish — broken-link banner + presence + overflow warning |
| G | G1 | Test suite — Zod + resolver + Playwright E2E |
| H | H1 | docs/menu-builder.md + README update |
