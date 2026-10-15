# Press ID Cards v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff download their own press ID card PDF from their profile (web + mobile); admins/editors issue, renew, revoke and download any card; the public verify page shows a "former staff" state once a last working date passes.

**Architecture:** `PressCard` rows link to `User`; a pure status function in `packages/db` derives ACTIVE / EXPIRED / REVOKED / SEPARATED. The admin app renders the card PDF on demand from one HTML template (ported from the Python generator) through the Playwright Chromium it already uses for the e-paper. Admin UI is a dialog off the existing `/users` row menu; reporter web gets a profile tile + page; the mobile app opens a short-lived signed download link in the browser. The web app's `/verify/[token]` page gains the SEPARATED state.

**Tech Stack:** Next.js 16 app router (apps/admin, apps/web), Prisma 6 + Postgres (`prisma db push` on deploy, no migrations), bun:test, Playwright (`playwright` already in apps/admin), `qrcode` npm (new), Expo Router (apps/reporter).

**Spec:** `docs/superpowers/specs/2026-10-15-press-id-cards-v2-design.md`

## Global Constraints

- Validity default: one year, `validTill = validFrom + 1 year − 1 day` (spec §11.1).
- ADMIN and EDITOR may issue / renew / revoke; REPORTER may only download their own card (spec §6, §11.2).
- Renew rotates the token: new row, old row `REVOKED` with `revokeNote = "renewed"` (spec §11.3).
- Status precedence: REVOKED > SEPARATED > EXPIRED > ACTIVE (spec §3.3).
- Card number format `RSN/<year>/<NNN>`; token = 12 chars from `abcdefghjkmnpqrstuvwxyz23456789` (v1 convention, `packages/db/src/press-card.ts`).
- Issue/download require `ReporterProfile.kycStatus = VERIFIED` and a `photoUrl` (spec §5.1).
- Verify page stays `noindex` and shows no phone / address / DOB (spec §5.4).
- English only on the card (v1 owner decision).
- Public repo: never commit photos or rendered cards; logos are fine.
- Deploy = push to main; schema applied by `prisma db push --accept-data-loss` in `.github/workflows/deploy.yml`.
- Two Claude sessions may share the working tree: `git add` explicit paths only, never `git add -A`.

## Review Focus

1. **Reporter requests another user's card PDF** (`/api/press-card/<other-id>/pdf`): must be 403, never the PDF. Test in Task 6.
2. **Last working date set to a future date**: holder stays ACTIVE until that day passes; verify page must not flip early. Test in Task 1.
3. **Renew clicked twice quickly**: second call must 409, not mint two ACTIVE cards and burn two numbers. Test in Task 5.
4. **Photo URL unreachable at render time**: PDF endpoint must return 503 "try again", not a card with a broken image box. Test in Task 4.
5. **Year rollover**: first card issued in January must be `RSN/2027/001`, not `RSN/2027/006`. Test in Task 1.

---

### Task 1: Status precedence, SEPARATED, card numbering, token minting (packages/db)

**Files:**
- Modify: `packages/db/src/press-card.ts`
- Modify: `packages/db/prisma/schema.prisma` (PressCard + User fields)
- Modify: `packages/db/src/index.ts` (no change needed; `export * from "./press-card"` exists)
- Test: `packages/db/__tests__/press-card.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `type PressCardLiveStatus = "ACTIVE" | "EXPIRED" | "REVOKED" | "SEPARATED"`
  - `computePressCardStatus(card: PressCardStatusInput, now?: Date, user?: { lastWorkingDate?: Date | null }): PressCardLiveStatus`
  - `nextCardNo(existing: string[], year: number): string`
  - `mintPressCardToken(random?: () => number): string`
  - `defaultValidTill(validFrom: Date): Date`
  - Prisma: `PressCard.userId String? @index`, `PressCard.issuedById String?`, `PressCard.renewedFromId String?`, `User.joinedAt DateTime?`, `User.lastWorkingDate DateTime?`

- [ ] **Step 1: Add failing tests**

Append to `packages/db/__tests__/press-card.test.ts`:

```ts
import { nextCardNo, mintPressCardToken, defaultValidTill } from "../src/press-card";

describe("computePressCardStatus - SEPARATED", () => {
  test("lastWorkingDate in the past -> SEPARATED even inside validity", () => {
    expect(
      computePressCardStatus(base, new Date("2027-01-10T00:00:00Z"), { lastWorkingDate: new Date("2027-01-01T00:00:00Z") }),
    ).toBe("SEPARATED");
  });
  test("lastWorkingDate today (same calendar day) -> still ACTIVE until the day ends", () => {
    expect(
      computePressCardStatus(base, new Date("2027-01-01T15:00:00Z"), { lastWorkingDate: new Date("2027-01-01T00:00:00Z") }),
    ).toBe("ACTIVE");
  });
  test("lastWorkingDate in the future -> ACTIVE", () => {
    expect(
      computePressCardStatus(base, new Date("2027-01-01T00:00:00Z"), { lastWorkingDate: new Date("2027-06-30T00:00:00Z") }),
    ).toBe("ACTIVE");
  });
  test("REVOKED beats SEPARATED", () => {
    expect(
      computePressCardStatus({ ...base, status: "REVOKED" }, new Date("2027-02-01T00:00:00Z"), { lastWorkingDate: new Date("2027-01-01T00:00:00Z") }),
    ).toBe("REVOKED");
  });
  test("SEPARATED beats EXPIRED", () => {
    expect(
      computePressCardStatus(base, new Date("2028-02-01T00:00:00Z"), { lastWorkingDate: new Date("2027-01-01T00:00:00Z") }),
    ).toBe("SEPARATED");
  });
});

describe("nextCardNo", () => {
  test("first card of a year is 001", () => {
    expect(nextCardNo([], 2027)).toBe("RSN/2027/001");
  });
  test("continues from the highest number of that year only", () => {
    expect(nextCardNo(["RSN/2026/001", "RSN/2026/005", "RSN/2026/003"], 2026)).toBe("RSN/2026/006");
  });
  test("year rollover ignores previous years", () => {
    expect(nextCardNo(["RSN/2026/005"], 2027)).toBe("RSN/2027/001");
  });
  test("ignores malformed numbers", () => {
    expect(nextCardNo(["junk", "RSN/2026/0X1", "RSN/2026/002"], 2026)).toBe("RSN/2026/003");
  });
});

describe("mintPressCardToken", () => {
  test("12 chars from the unambiguous alphabet and passes isValidPressCardToken", () => {
    const t = mintPressCardToken();
    expect(t).toHaveLength(12);
    expect(/^[abcdefghjkmnpqrstuvwxyz23456789]{12}$/.test(t)).toBe(true);
    expect(isValidPressCardToken(t)).toBe(true);
  });
  test("deterministic with injected random", () => {
    expect(mintPressCardToken(() => 0)).toBe("aaaaaaaaaaaa");
  });
});

describe("defaultValidTill", () => {
  test("one year minus one day, UTC calendar", () => {
    expect(defaultValidTill(new Date("2026-10-06T00:00:00Z")).toISOString()).toBe("2027-10-05T00:00:00.000Z");
  });
  test("leap-day issue date lands on 28 Feb next year", () => {
    expect(defaultValidTill(new Date("2028-02-29T00:00:00Z")).toISOString()).toBe("2029-02-28T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

Run: `cd "D:/Rayalaseema express" && bun test packages/db/__tests__/press-card.test.ts`
Expected: FAIL — `nextCardNo`, `mintPressCardToken`, `defaultValidTill` not exported; SEPARATED tests fail with "ACTIVE".

- [ ] **Step 3: Implement in `packages/db/src/press-card.ts`**

Replace the file body (keep the header comment, extend it):

```ts
export type PressCardLiveStatus = "ACTIVE" | "EXPIRED" | "REVOKED" | "SEPARATED";

export interface PressCardStatusInput {
  status: "ACTIVE" | "REVOKED";
  revokedAt?: Date | null;
  validFrom: Date;
  validTill: Date;
}

export interface PressCardHolderInput {
  lastWorkingDate?: Date | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const endOfDay = (d: Date) => Math.floor(d.getTime() / DAY_MS) * DAY_MS + DAY_MS;

// Precedence: REVOKED > SEPARATED > EXPIRED > ACTIVE.
// lastWorkingDate is a calendar day: the holder is still staff on that day.
export function computePressCardStatus(
  card: PressCardStatusInput,
  now: Date = new Date(),
  holder?: PressCardHolderInput,
): PressCardLiveStatus {
  if (card.status === "REVOKED" || card.revokedAt) return "REVOKED";
  const t = now.getTime();
  if (holder?.lastWorkingDate && t >= endOfDay(holder.lastWorkingDate)) return "SEPARATED";
  if (t < card.validFrom.getTime() || t >= endOfDay(card.validTill)) return "EXPIRED";
  return "ACTIVE";
}

const TOKEN_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const TOKEN_RE = /^[a-z0-9]{12}$/;
export function isValidPressCardToken(token: string): boolean {
  return TOKEN_RE.test(token);
}

// `random` defaults to Math.random; callers that need CSPRNG pass
// () => crypto.randomInt(0, 1e9) / 1e9. Tests inject a constant.
export function mintPressCardToken(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 12; i++) out += TOKEN_ALPHABET[Math.floor(random() * TOKEN_ALPHABET.length) % TOKEN_ALPHABET.length];
  return out;
}

const CARD_RE = /^RSN\/(\d{4})\/(\d{3})$/;
export function nextCardNo(existing: string[], year: number): string {
  let max = 0;
  for (const c of existing) {
    const m = CARD_RE.exec(c);
    if (m && Number(m[1]) === year) max = Math.max(max, Number(m[2]));
  }
  return `RSN/${year}/${String(max + 1).padStart(3, "0")}`;
}

// One year of validity, inclusive: 06-10-2026 -> 05-10-2027. UTC calendar days.
export function defaultValidTill(validFrom: Date): Date {
  const d = new Date(Date.UTC(validFrom.getUTCFullYear() + 1, validFrom.getUTCMonth(), validFrom.getUTCDate()));
  // Feb 29 + 1y overflows to Mar 1; pull back to Feb 28 before subtracting.
  if (d.getUTCMonth() !== validFrom.getUTCMonth()) d.setUTCDate(0);
  return new Date(d.getTime() - DAY_MS);
}
```

- [ ] **Step 4: Run tests, confirm green**

Run: `bun test packages/db/__tests__/press-card.test.ts`
Expected: all pass (v1 tests + new).

- [ ] **Step 5: Extend the Prisma schema**

In `packages/db/prisma/schema.prisma`, inside `model PressCard { ... }` replace the `userId` line and add fields so the model reads:

```prisma
model PressCard {
  id           String          @id @default(cuid())
  cardNo       String          @unique
  token        String          @unique
  name         String
  designation  String
  photoUrl     String
  validFrom    DateTime
  validTill    DateTime
  status       PressCardStatus @default(ACTIVE)
  revokedAt    DateTime?
  revokeNote   String?
  // Holder. Nullable only so the v1 JSON-seeded rows can be linked after
  // deploy. Not unique: renewals keep the old (REVOKED) row for history;
  // "one ACTIVE card per user" is enforced in the issue/renew transaction.
  userId       String?
  user         User?           @relation(fields: [userId], references: [id], onDelete: SetNull)
  issuedById   String?
  renewedFromId String?
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt

  @@index([userId])
  @@map("press_cards")
}
```

In `model User { ... }` add, after `yearsExperience   Int?`:

```prisma
  // Employment dates. joinedAt backfilled from createdAt by
  // scripts/backfill-user-joined-at.ts; lastWorkingDate set by admin when
  // someone leaves and drives the SEPARATED press-card state.
  joinedAt        DateTime?
  lastWorkingDate DateTime?
  pressCards      PressCard[]
```

- [ ] **Step 6: Validate + generate + push locally**

Run: `cd "D:/Rayalaseema express/packages/db" && bunx prisma validate && bunx prisma generate && bunx prisma db push --skip-generate`
Expected: "valid", client generated, "database is now in sync".

- [ ] **Step 7: Add the joinedAt backfill script (idempotent)**

Create `packages/db/scripts/backfill-user-joined-at.ts`:

```ts
// Sets User.joinedAt = createdAt for rows that have no joinedAt. Idempotent;
// wired into deploy.yml after `prisma db push`.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const rows = await prisma.user.findMany({ where: { joinedAt: null }, select: { id: true, createdAt: true } });
  for (const r of rows) await prisma.user.update({ where: { id: r.id }, data: { joinedAt: r.createdAt } });
  console.log(`joinedAt backfilled for ${rows.length} users`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

Run locally: `cd packages/db && bunx tsx scripts/backfill-user-joined-at.ts` → prints a count.

- [ ] **Step 8: Wire into deploy.yml**

In `.github/workflows/deploy.yml`, directly after the existing block

```
            echo "=== Seed / refresh press ID cards (idempotent upsert by cardNo) ==="
            ...
            bunx tsx scripts/seed-press-cards.ts
```

add:

```
            echo "=== Backfill User.joinedAt from createdAt (idempotent) ==="
            bunx tsx scripts/backfill-user-joined-at.ts
```

- [ ] **Step 9: Commit**

```bash
git add packages/db/src/press-card.ts packages/db/__tests__/press-card.test.ts packages/db/prisma/schema.prisma packages/db/scripts/backfill-user-joined-at.ts .github/workflows/deploy.yml
git commit -m "feat(press): SEPARATED status, card numbering, token minting, holder link on PressCard"
```

---

### Task 2: Admin can set joinedAt / lastWorkingDate on a user

**Files:**
- Modify: `packages/db/src/user-input-schemas.ts` (`userUpdateSchema`)
- Modify: `apps/admin/src/app/api/users/[id]/route.ts` (PUT handler, the `for (const key of [...])` loop)
- Modify: `apps/admin/src/app/(dashboard)/users/page.tsx` (Edit User dialog form: two date inputs)
- Test: `packages/db/__tests__/payload-schemas.test.ts` (append)

**Interfaces:**
- Consumes: Task 1 schema fields.
- Produces: `PUT /api/users/[id]` accepts `{ joinedAt?: "YYYY-MM-DD" | null, lastWorkingDate?: "YYYY-MM-DD" | null }`.

- [ ] **Step 1: Failing schema test**

Append to `packages/db/__tests__/payload-schemas.test.ts`:

```ts
import { userUpdateSchema } from "../src/user-input-schemas";
describe("userUpdateSchema employment dates", () => {
  test("accepts ISO dates and null", () => {
    expect(userUpdateSchema.safeParse({ joinedAt: "2026-07-20", lastWorkingDate: null }).success).toBe(true);
  });
  test("rejects non-date strings", () => {
    expect(userUpdateSchema.safeParse({ lastWorkingDate: "next week" }).success).toBe(false);
  });
});
```

Run: `bun test packages/db/__tests__/payload-schemas.test.ts` → FAIL (strict schema rejects unknown keys).

- [ ] **Step 2: Extend the schema**

In `userUpdateSchema` add before `regenerateCode`:

```ts
  joinedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  lastWorkingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
```

Run the test → PASS.

- [ ] **Step 3: Accept the fields in the PUT handler**

In `apps/admin/src/app/api/users/[id]/route.ts`, after the `for (const key of ["name", "role", "active", "bio", "phone"] as const)` loop add:

```ts
    // Employment dates (ADMIN only, this route is ADMIN-gated). Stored as
    // UTC midnight; null clears. lastWorkingDate drives the press-card
    // SEPARATED state on the public verify page.
    for (const key of ["joinedAt", "lastWorkingDate"] as const) {
      if (b[key] === undefined) continue;
      data[key] = b[key] ? new Date(`${b[key]}T00:00:00.000Z`) : null;
    }
```

- [ ] **Step 4: Add the inputs to the Edit User dialog**

In `apps/admin/src/app/(dashboard)/users/page.tsx` locate the edit form's `phone` field (search `name="phone"` or the `Label htmlFor="phone"` block inside the user form dialog). Immediately after that field add:

```tsx
<div className="grid grid-cols-2 gap-3">
  <div className="space-y-1">
    <Label htmlFor="joinedAt">Date of joining</Label>
    <Input id="joinedAt" type="date" value={form.joinedAt ?? ""} onChange={(e) => setForm({ ...form, joinedAt: e.target.value || null })} />
  </div>
  <div className="space-y-1">
    <Label htmlFor="lastWorkingDate">Last working date</Label>
    <Input id="lastWorkingDate" type="date" value={form.lastWorkingDate ?? ""} onChange={(e) => setForm({ ...form, lastWorkingDate: e.target.value || null })} />
    <p className="text-[11px] text-muted-foreground">Once this day passes, the public press-card page shows "Former staff" and self-service download stops.</p>
  </div>
</div>
```

Add `joinedAt?: string | null; lastWorkingDate?: string | null;` to the form state type and to the `User` interface (line ~118) as `joinedAt: string | null; lastWorkingDate: string | null;`. When seeding the edit form from a `User`, map `u.joinedAt?.slice(0, 10) ?? null` and the same for `lastWorkingDate`. Include both keys in the PUT body the form already builds (same place `phone` is sent).

In `apps/admin/src/app/api/users/route.ts` list `select`, add `joinedAt: true, lastWorkingDate: true,` next to `createdAt`.

- [ ] **Step 5: Manual check**

Run: `cd apps/admin && bun run dev -- -p 3101`; log in as admin; Users → Edit a reporter → set Last working date → Save → reopen: value persists. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/user-input-schemas.ts packages/db/__tests__/payload-schemas.test.ts "apps/admin/src/app/api/users/[id]/route.ts" apps/admin/src/app/api/users/route.ts "apps/admin/src/app/(dashboard)/users/page.tsx"
git commit -m "feat(users): admin can set date of joining and last working date"
```

---

### Task 3: Card HTML template + QR (admin lib, no browser yet)

**Files:**
- Create: `apps/admin/src/lib/press-card/template.ts`
- Create: `apps/admin/public/press-card/lockup.png` (copy of `d:\tmp\rayalaseema-letterhead\lockup-new.png`, 1850×502)
- Create: `apps/admin/public/press-card/main-logo.png` (copy of `D:\Downloads\RSN-NEW-LOGOS\RSN\MAIN LOGO\01.1.png`)
- Test: `apps/admin/__tests__/press-card-template.test.ts`
- Modify: `apps/admin/package.json` (add `qrcode`)

**Interfaces:**
- Produces:
  - `type CardData = { cardNo: string; token: string; name: string; designation: string; photoUrl: string; validFrom: Date; validTill: Date }`
  - `renderCardHtml(side: "front" | "back", card: CardData, assets: { lockupDataUri: string; mainLogoDataUri: string; qrDataUri: string }): string`
  - `verifyUrlFor(token: string): string` → `https://rayalaseemanews.com/verify/<token>`
  - `fmtDay(d: Date): string` → `DD-MM-YYYY`

- [ ] **Step 1: Install qrcode**

Run: `cd "D:/Rayalaseema express/apps/admin" && bun add qrcode && bun add -d @types/qrcode`

- [ ] **Step 2: Copy logo assets**

Run (PowerShell):
```powershell
New-Item -ItemType Directory -Force "D:\Rayalaseema express\apps\admin\public\press-card" | Out-Null
Copy-Item "d:\tmp\rayalaseema-letterhead\lockup-new.png" "D:\Rayalaseema express\apps\admin\public\press-card\lockup.png"
Copy-Item "D:\Downloads\RSN-NEW-LOGOS\RSN\MAIN LOGO\01.1.png" "D:\Rayalaseema express\apps\admin\public\press-card\main-logo.png"
```

- [ ] **Step 3: Failing test**

Create `apps/admin/__tests__/press-card-template.test.ts`:

```ts
import { describe, test, expect } from "bun:test";
import { renderCardHtml, verifyUrlFor, fmtDay } from "../src/lib/press-card/template";

const card = {
  cardNo: "RSN/2026/001", token: "a3dmykc2k3q7", name: "G. Srinivas Reddy", designation: "Chief Editor",
  photoUrl: "https://example.com/p.jpg", validFrom: new Date("2026-10-06T00:00:00Z"), validTill: new Date("2027-10-05T00:00:00Z"),
};
const assets = { lockupDataUri: "data:image/png;base64,AAA", mainLogoDataUri: "data:image/png;base64,BBB", qrDataUri: "data:image/png;base64,CCC" };

describe("press-card template", () => {
  test("verify url", () => {
    expect(verifyUrlFor("a3dmykc2k3q7")).toBe("https://rayalaseemanews.com/verify/a3dmykc2k3q7");
  });
  test("fmtDay is DD-MM-YYYY in UTC", () => {
    expect(fmtDay(new Date("2027-10-05T00:00:00Z"))).toBe("05-10-2027");
  });
  test("front contains name, designation, card no, dates, photo, PRESS band, no Telugu", () => {
    const html = renderCardHtml("front", card, assets);
    for (const s of ["G. Srinivas Reddy", "Chief Editor", "RSN/2026/001", "06-10-2026", "05-10-2027", "https://example.com/p.jpg", ">PRESS<", "@page { size: 60mm 91.6mm"]) expect(html).toContain(s);
    expect(/[\u0C00-\u0C7F]/.test(html)).toBe(false);
  });
  test("back contains CIN, QR, card no, company phone, no personal phone", () => {
    const html = renderCardHtml("back", card, assets);
    for (const s of ["U58130AP2026PTC127049", "data:image/png;base64,CCC", "RSN/2026/001", "9390375460", "Scan to verify"]) expect(html).toContain(s);
    expect(html).not.toContain("8884575460");
  });
  test("escapes HTML in user-controlled fields", () => {
    const html = renderCardHtml("front", { ...card, name: "<img src=x onerror=alert(1)>" }, assets);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });
});
```

Run: `cd "D:/Rayalaseema express" && bun test apps/admin/__tests__/press-card-template.test.ts` → FAIL (module missing).

- [ ] **Step 4: Implement the template**

Create `apps/admin/src/lib/press-card/template.ts`. This is a line-for-line port of `docs/press-cards/build-cards.py` (CSS identical; Python f-string braces become template literals):

```ts
// Press ID card HTML - single source of truth for the printed card.
// Ported from docs/press-cards/build-cards.py (keep both in sync until the
// Python generator is retired). CR80 portrait 54 x 85.6 mm + 3 mm bleed
// = 60 x 91.6 mm page. English only. Rendered to PDF by render.ts.

export type CardData = {
  cardNo: string; token: string; name: string; designation: string; photoUrl: string;
  validFrom: Date; validTill: Date;
};
export type CardAssets = { lockupDataUri: string; mainLogoDataUri: string; qrDataUri: string };

const RED = "#D50000";
const COMPANY_PHONE = "9390375460";
const CIN = "U58130AP2026PTC127049";
export const VERIFY_BASE = "https://rayalaseemanews.com/verify/";
export const verifyUrlFor = (token: string) => `${VERIFY_BASE}${token}`;

export function fmtDay(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getUTCFullYear()}`;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CSS = `
@page { size: 60mm 91.6mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 60mm; height: 91.6mm; }
body { font-family: "Arial", sans-serif; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.card { position: relative; width: 60mm; height: 91.6mm; background: #fff; overflow: hidden; }
.front .logo-band { position: absolute; left: 0; top: 0; width: 60mm; height: 20.5mm; background: #fff; }
.front .logo-band img { position: absolute; left: 6mm; top: 5mm; width: 48mm; }
.front .press { position: absolute; left: 0; top: 20.5mm; width: 60mm; height: 11mm; background: ${RED}; color: #fff; display: flex; align-items: center; justify-content: center; }
.front .press span { font-weight: 900; font-size: 23pt; letter-spacing: 2.6mm; padding-left: 2.6mm; line-height: 1; }
.front .photo { position: absolute; left: 17mm; top: 34mm; width: 26mm; height: 34.6mm; border: 0.5mm solid ${RED}; border-radius: 1.2mm; overflow: hidden; background: #eee; }
.front .photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.front .name { position: absolute; left: 3mm; right: 3mm; top: 70.6mm; text-align: center; font-size: 11.5pt; font-weight: 900; line-height: 1.05; letter-spacing: .1mm; }
.front .name.long { font-size: 10pt; }
.front .desig { position: absolute; left: 3mm; right: 3mm; top: 75.9mm; text-align: center; color: ${RED}; font-weight: 800; font-size: 8pt; letter-spacing: .2mm; text-transform: uppercase; line-height: 1; white-space: nowrap; }
.front .meta { position: absolute; left: 5mm; right: 5mm; top: 80mm; display: grid; grid-template-columns: 1.15fr 1fr 1fr; column-gap: 1.5mm; font-size: 6.1pt; line-height: 1.15; }
.front .meta div { white-space: nowrap; }
.front .meta b { color: #666; font-weight: 700; text-transform: uppercase; font-size: 5pt; letter-spacing: .2mm; display: block; }
.front .foot { position: absolute; left: 0; bottom: 0; width: 60mm; height: 3.8mm; background: ${RED}; }
.front .foot span { position: absolute; left: 0; right: 0; bottom: 0.9mm; text-align: center; color: #fff; font-size: 5pt; letter-spacing: .3mm; font-weight: 700; }
.back .head { position: absolute; left: 0; top: 0; width: 60mm; height: 16mm; background: ${RED}; color: #fff; }
.back .head img { position: absolute; left: 5.5mm; top: 4.6mm; width: 8mm; height: 8mm; border-radius: 1mm; border: .35mm solid #fff; }
.back .head .co { position: absolute; left: 15.5mm; top: 5mm; right: 3mm; }
.back .head .co .n { font-weight: 900; font-size: 7.4pt; line-height: 1.05; white-space: nowrap; }
.back .head .co .s { font-size: 5pt; opacity: .92; margin-top: .8mm; line-height: 1.3; white-space: nowrap; }
.back .block { position: absolute; left: 5.5mm; right: 5.5mm; }
.back h4 { font-size: 5.4pt; letter-spacing: .35mm; color: ${RED}; text-transform: uppercase; margin-bottom: .8mm; font-weight: 900; }
.back p { font-size: 5.8pt; line-height: 1.32; color: #222; }
.back .terms { top: 20mm; }
.back .terms ol { padding-left: 2.8mm; font-size: 5.7pt; line-height: 1.32; color: #222; }
.back .terms li { margin-bottom: .7mm; }
.back .addr { top: 49mm; }
.back .qr { position: absolute; right: 5.5mm; top: 64mm; width: 16mm; height: 16mm; }
.back .qr img { width: 100%; height: 100%; display: block; }
.back .qrtxt { position: absolute; right: 5.5mm; top: 80.3mm; width: 16mm; text-align: center; font-size: 4.3pt; color: #666; }
.back .sign { position: absolute; left: 5.5mm; top: 70mm; width: 30mm; }
.back .sign .line { border-top: .25mm solid #333; margin-top: 7mm; padding-top: .7mm; font-size: 5.2pt; color: #333; }
.back .sign .line b { display: block; font-size: 5.6pt; color: #111; }
.back .foot { position: absolute; left: 0; bottom: 0; width: 60mm; height: 5.2mm; background: #111; color: #fff; display: flex; align-items: center; justify-content: center; gap: 2.5mm; font-size: 5.2pt; letter-spacing: .25mm; }
.back .foot b { color: #ff6b6b; }
`;

function front(c: CardData, a: CardAssets): string {
  const long = c.name.length > 20 ? " long" : "";
  return `<div class="card front">
  <div class="logo-band"><img src="${a.lockupDataUri}" alt=""></div>
  <div class="press"><span>PRESS</span></div>
  <div class="photo"><img src="${esc(c.photoUrl)}" alt=""></div>
  <div class="name${long}">${esc(c.name)}</div>
  <div class="desig">${esc(c.designation)}</div>
  <div class="meta">
    <div><b>ID No</b>${esc(c.cardNo)}</div>
    <div><b>Valid From</b>${fmtDay(c.validFrom)}</div>
    <div><b>Valid Till</b>${fmtDay(c.validTill)}</div>
  </div>
  <div class="foot"><span>RAYALASEEMANEWS.COM</span></div>
</div>`;
}

function back(c: CardData, a: CardAssets): string {
  return `<div class="card back">
  <div class="head"><img src="${a.mainLogoDataUri}" alt="">
    <div class="co"><div class="n">Medha Publications Pvt Ltd</div><div class="s">Publisher of Rayalaseema News<br>CIN ${CIN}</div></div>
  </div>
  <div class="block terms"><h4>Terms of use</h4>
    <ol>
      <li>The holder is an accredited representative of <b>Rayalaseema News</b> and is authorised to gather news on its behalf.</li>
      <li>This card is the property of Medha Publications Pvt Ltd. It is non-transferable and must be surrendered on cessation of service.</li>
      <li>Misuse of this card for any purpose other than journalism will attract legal action.</li>
    </ol>
  </div>
  <div class="block addr"><h4>If found, please return to</h4>
    <p>Medha Publications Pvt Ltd<br>27, Adityaram Complex, Korrapadu Road, Proddatur,<br>YSR Kadapa District, Andhra Pradesh - 516360<br>Ph: ${COMPANY_PHONE} · social@rayalaseemanews.com</p>
  </div>
  <div class="sign"><div class="line"><b>Authorised Signatory</b>Medha Publications Pvt Ltd</div></div>
  <div class="qr"><img src="${a.qrDataUri}" alt=""></div>
  <div class="qrtxt">Scan to verify</div>
  <div class="foot"><span>Emergency</span><b>+91 ${COMPANY_PHONE}</b><span>·</span><span>${esc(c.cardNo)}</span></div>
</div>`;
}

export function renderCardHtml(side: "front" | "back", card: CardData, assets: CardAssets): string {
  const body = side === "front" ? front(card, assets) : back(card, assets);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`;
}
```

- [ ] **Step 5: Run tests → PASS**

Run: `bun test apps/admin/__tests__/press-card-template.test.ts`

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/lib/press-card/template.ts apps/admin/__tests__/press-card-template.test.ts apps/admin/public/press-card/lockup.png apps/admin/public/press-card/main-logo.png apps/admin/package.json bun.lock
git commit -m "feat(press): card HTML template ported to admin lib + qrcode dep"
```

---

### Task 4: PDF renderer with Playwright (admin lib)

**Files:**
- Create: `apps/admin/src/lib/press-card/render.ts`
- Test: `apps/admin/__tests__/press-card-render.test.ts` (integration; skipped unless `PRESS_CARD_RENDER_TEST=1`)

**Interfaces:**
- Consumes: Task 3 `renderCardHtml`, `verifyUrlFor`, `CardData`.
- Produces: `renderPressCardPdf(card: CardData): Promise<Buffer>` (2-page PDF: front, back). Throws `PressCardRenderError` with `code: "PHOTO_UNREACHABLE" | "RENDER_FAILED"`.

- [ ] **Step 1: Failing integration test**

Create `apps/admin/__tests__/press-card-render.test.ts`:

```ts
import { describe, test, expect } from "bun:test";
import { renderPressCardPdf, PressCardRenderError } from "../src/lib/press-card/render";

const RUN = process.env.PRESS_CARD_RENDER_TEST === "1";
const card = {
  cardNo: "RSN/2026/001", token: "a3dmykc2k3q7", name: "G. Srinivas Reddy", designation: "Chief Editor",
  photoUrl: "https://rayalaseemamedia.blob.core.windows.net/uploads/press-cards/RSN-2026-001.jpg",
  validFrom: new Date("2026-10-06T00:00:00Z"), validTill: new Date("2027-10-05T00:00:00Z"),
};

describe.skipIf(!RUN)("renderPressCardPdf (needs Chromium + network)", () => {
  test("produces a 2-page PDF", async () => {
    const pdf = await renderPressCardPdf(card);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect((pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length).toBe(2);
  }, 60_000);
  test("unreachable photo -> PHOTO_UNREACHABLE", async () => {
    await expect(renderPressCardPdf({ ...card, photoUrl: "https://rayalaseemamedia.blob.core.windows.net/uploads/press-cards/does-not-exist.jpg" }))
      .rejects.toBeInstanceOf(PressCardRenderError);
  }, 60_000);
});
```

Run: `PRESS_CARD_RENDER_TEST=1 bun test apps/admin/__tests__/press-card-render.test.ts` → FAIL (module missing).

- [ ] **Step 2: Implement `render.ts`**

```ts
// Renders a press card to a 2-page PDF (front, back) with the same
// Playwright Chromium the e-paper uses (see lib/epaper/render-edition.ts).
// Assets are inlined as data URIs so page.setContent needs no file access;
// the photo is fetched here first so a dead URL fails fast and loudly
// instead of printing an empty box.
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import QRCode from "qrcode";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderCardHtml, verifyUrlFor, type CardData } from "./template";

export class PressCardRenderError extends Error {
  constructor(public code: "PHOTO_UNREACHABLE" | "RENDER_FAILED", message: string) { super(message); }
}

const PUB = path.join(process.cwd(), "public", "press-card");
let assetCache: { lockup: string; main: string } | null = null;
async function logoAssets() {
  if (assetCache) return assetCache;
  const [l, m] = await Promise.all([readFile(path.join(PUB, "lockup.png")), readFile(path.join(PUB, "main-logo.png"))]);
  assetCache = { lockup: `data:image/png;base64,${l.toString("base64")}`, main: `data:image/png;base64,${m.toString("base64")}` };
  return assetCache;
}

async function fetchPhotoDataUri(url: string): Promise<string> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new PressCardRenderError("PHOTO_UNREACHABLE", `photo ${res.status}`);
    const ct = res.headers.get("content-type") || "image/jpeg";
    if (!ct.startsWith("image/")) throw new PressCardRenderError("PHOTO_UNREACHABLE", `photo content-type ${ct}`);
    return `data:${ct};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch (e) {
    if (e instanceof PressCardRenderError) throw e;
    throw new PressCardRenderError("PHOTO_UNREACHABLE", String(e));
  } finally { clearTimeout(t); }
}

export async function renderPressCardPdf(card: CardData): Promise<Buffer> {
  const [{ lockup, main }, photo, qr] = await Promise.all([
    logoAssets(),
    fetchPhotoDataUri(card.photoUrl),
    QRCode.toDataURL(verifyUrlFor(card.token), { errorCorrectionLevel: "M", margin: 1, scale: 12, color: { dark: "#111111", light: "#ffffff" } }),
  ]);
  const assets = { lockupDataUri: lockup, mainLogoDataUri: main, qrDataUri: qr };
  const browser = await chromium.launch();
  try {
    const out = await PDFDocument.create();
    for (const side of ["front", "back"] as const) {
      const page = await browser.newPage({ viewport: { width: 227, height: 347 }, deviceScaleFactor: 2 });
      try {
        await page.setContent(renderCardHtml(side, { ...card, photoUrl: photo }, assets), { waitUntil: "load" });
        const bytes = await page.pdf({ width: "60mm", height: "91.6mm", printBackground: true, preferCSSPageSize: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
        const src = await PDFDocument.load(bytes);
        const [p] = await out.copyPages(src, [0]);
        out.addPage(p);
      } finally { await page.close(); }
    }
    out.setTitle(`Press card ${card.cardNo} - ${card.name}`);
    out.setProducer("Rayalaseema News admin");
    return Buffer.from(await out.save());
  } catch (e) {
    if (e instanceof PressCardRenderError) throw e;
    throw new PressCardRenderError("RENDER_FAILED", String(e));
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 3: Run the integration test → PASS**

Run: `PRESS_CARD_RENDER_TEST=1 bun test apps/admin/__tests__/press-card-render.test.ts`

- [ ] **Step 4: Pixel check against v1**

Write the PDF to disk once and eyeball it:

```bash
cd "D:/Rayalaseema express/apps/admin" && bun -e 'import { renderPressCardPdf } from "./src/lib/press-card/render"; const b = await renderPressCardPdf({cardNo:"RSN/2026/001",token:"a3dmykc2k3q7",name:"G. Srinivas Reddy",designation:"Chief Editor",photoUrl:"https://rayalaseemamedia.blob.core.windows.net/uploads/press-cards/RSN-2026-001.jpg",validFrom:new Date("2026-10-06T00:00:00Z"),validTill:new Date("2027-10-05T00:00:00Z")}); await Bun.write("d:/tmp/rayalaseema-idcards/out/ts-render-001.pdf", b);'
```

Open `d:\tmp\rayalaseema-idcards\out\ts-render-001.pdf` next to `RSN-2026-001-front.pdf` / `-back.pdf` from the Python run. Layout must match; fix CSS drift in `template.ts` if not.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/lib/press-card/render.ts apps/admin/__tests__/press-card-render.test.ts
git commit -m "feat(press): Playwright PDF renderer for press cards"
```

---

### Task 5: Issue / renew / revoke service + API routes (admin)

**Files:**
- Create: `apps/admin/src/lib/press-card/service.ts`
- Create: `apps/admin/src/app/api/press-card/route.ts` (POST issue, GET by userId)
- Create: `apps/admin/src/app/api/press-card/[id]/renew/route.ts`
- Create: `apps/admin/src/app/api/press-card/[id]/revoke/route.ts`
- Test: `apps/admin/__tests__/press-card-service.test.ts` (pure parts) + manual curl matrix

**Interfaces:**
- Consumes: Task 1 (`nextCardNo`, `mintPressCardToken`, `defaultValidTill`, `computePressCardStatus`), `requireAuth` from `@/lib/api-utils`, `prisma` from `@rayalaseema/db`.
- Produces:
  - `issuePressCard(input: { userId: string; designation: string; validFrom?: Date; validTill?: Date; photoUrl?: string; issuedById: string }): Promise<PressCardDto>`
  - `renewPressCard(cardId: string, issuedById: string): Promise<PressCardDto>`
  - `revokePressCard(cardId: string, note: string): Promise<PressCardDto>`
  - `getUserPressCard(userId: string): Promise<PressCardDto | null>` (latest row, any status)
  - `assertIssuable(userId): Promise<{ name: string; photoUrl: string }>` throws `PressCardIssueError(code: "KYC_NOT_VERIFIED" | "NO_PHOTO" | "ALREADY_ACTIVE" | "NOT_FOUND")`
  - `type PressCardDto = { id; cardNo; token; name; designation; photoUrl; validFrom: string; validTill: string; status: "ACTIVE"|"REVOKED"; liveStatus: PressCardLiveStatus; revokedAt: string|null; revokeNote: string|null; userId: string|null; verifyUrl: string }`
  - HTTP: `POST /api/press-card` body `{ userId, designation, validFrom?, validTill?, photoUrl? }` → 201 dto | 409 `{ error, code }`; `GET /api/press-card?userId=` → `{ card: dto | null, issuable: { ok: boolean; reason?: string } }`; `POST /api/press-card/[id]/renew` → 201 dto; `POST /api/press-card/[id]/revoke` body `{ note }` → 200 dto.

- [ ] **Step 1: Failing unit tests for the pure helpers in service.ts**

Create `apps/admin/__tests__/press-card-service.test.ts`:

```ts
import { describe, test, expect } from "bun:test";
import { toDto, issuableReason } from "../src/lib/press-card/service";

const row = {
  id: "c1", cardNo: "RSN/2026/001", token: "a3dmykc2k3q7", name: "A", designation: "Reporter", photoUrl: "https://x/p.jpg",
  validFrom: new Date("2026-10-06T00:00:00Z"), validTill: new Date("2027-10-05T00:00:00Z"), status: "ACTIVE" as const,
  revokedAt: null, revokeNote: null, userId: "u1", user: { lastWorkingDate: null },
};

describe("toDto", () => {
  test("adds liveStatus + verifyUrl, ISO dates", () => {
    const d = toDto(row, new Date("2027-01-01T00:00:00Z"));
    expect(d.liveStatus).toBe("ACTIVE");
    expect(d.verifyUrl).toBe("https://rayalaseemanews.com/verify/a3dmykc2k3q7");
    expect(d.validFrom).toBe("2026-10-06");
  });
  test("SEPARATED from holder", () => {
    expect(toDto({ ...row, user: { lastWorkingDate: new Date("2026-12-01T00:00:00Z") } }, new Date("2027-01-01T00:00:00Z")).liveStatus).toBe("SEPARATED");
  });
});

describe("issuableReason", () => {
  test("verified + photo + no active card -> null", () => {
    expect(issuableReason({ kycStatus: "VERIFIED", photoUrl: "https://x/p.jpg" }, null)).toBeNull();
  });
  test("kyc not verified", () => {
    expect(issuableReason({ kycStatus: "SUBMITTED", photoUrl: "https://x/p.jpg" }, null)).toBe("KYC_NOT_VERIFIED");
  });
  test("no photo", () => {
    expect(issuableReason({ kycStatus: "VERIFIED", photoUrl: null }, null)).toBe("NO_PHOTO");
  });
  test("already has an ACTIVE card", () => {
    expect(issuableReason({ kycStatus: "VERIFIED", photoUrl: "https://x/p.jpg" }, { liveStatus: "ACTIVE" })).toBe("ALREADY_ACTIVE");
  });
  test("expired card does not block re-issue", () => {
    expect(issuableReason({ kycStatus: "VERIFIED", photoUrl: "https://x/p.jpg" }, { liveStatus: "EXPIRED" })).toBeNull();
  });
  test("no profile row at all", () => {
    expect(issuableReason(null, null)).toBe("KYC_NOT_VERIFIED");
  });
});
```

Run: `bun test apps/admin/__tests__/press-card-service.test.ts` → FAIL.

- [ ] **Step 2: Implement `service.ts`**

```ts
// Issue / renew / revoke press cards. All DB writes go through a
// transaction that (a) re-checks "no ACTIVE card for this user" and (b)
// derives the next card number inside the same transaction, so two admins
// clicking Issue at once get one card + one 409, never two cards.
import crypto from "node:crypto";
import { prisma, computePressCardStatus, nextCardNo, mintPressCardToken, defaultValidTill, type PressCardLiveStatus } from "@rayalaseema/db";
import { verifyUrlFor } from "./template";

export class PressCardIssueError extends Error {
  constructor(public code: "KYC_NOT_VERIFIED" | "NO_PHOTO" | "ALREADY_ACTIVE" | "NOT_FOUND" | "NOT_ACTIVE", message: string) { super(message); }
}

export type PressCardDto = {
  id: string; cardNo: string; token: string; name: string; designation: string; photoUrl: string;
  validFrom: string; validTill: string; status: "ACTIVE" | "REVOKED"; liveStatus: PressCardLiveStatus;
  revokedAt: string | null; revokeNote: string | null; userId: string | null; verifyUrl: string;
};

type Row = {
  id: string; cardNo: string; token: string; name: string; designation: string; photoUrl: string;
  validFrom: Date; validTill: Date; status: "ACTIVE" | "REVOKED"; revokedAt: Date | null; revokeNote: string | null;
  userId: string | null; user?: { lastWorkingDate: Date | null } | null;
};

const day = (d: Date) => d.toISOString().slice(0, 10);

export function toDto(r: Row, now: Date = new Date()): PressCardDto {
  return {
    id: r.id, cardNo: r.cardNo, token: r.token, name: r.name, designation: r.designation, photoUrl: r.photoUrl,
    validFrom: day(r.validFrom), validTill: day(r.validTill), status: r.status,
    liveStatus: computePressCardStatus(r, now, r.user ?? undefined),
    revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null, revokeNote: r.revokeNote, userId: r.userId,
    verifyUrl: verifyUrlFor(r.token),
  };
}

export function issuableReason(
  profile: { kycStatus: string; photoUrl: string | null } | null,
  current: { liveStatus: PressCardLiveStatus } | null,
): "KYC_NOT_VERIFIED" | "NO_PHOTO" | "ALREADY_ACTIVE" | null {
  if (!profile || profile.kycStatus !== "VERIFIED") return "KYC_NOT_VERIFIED";
  if (!profile.photoUrl) return "NO_PHOTO";
  if (current && current.liveStatus === "ACTIVE") return "ALREADY_ACTIVE";
  return null;
}

const SELECT = {
  id: true, cardNo: true, token: true, name: true, designation: true, photoUrl: true, validFrom: true, validTill: true,
  status: true, revokedAt: true, revokeNote: true, userId: true, user: { select: { lastWorkingDate: true } },
} as const;

export async function getUserPressCard(userId: string): Promise<PressCardDto | null> {
  const r = await prisma.pressCard.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: SELECT });
  return r ? toDto(r) : null;
}

export async function getPressCardById(id: string): Promise<PressCardDto | null> {
  const r = await prisma.pressCard.findUnique({ where: { id }, select: SELECT });
  return r ? toDto(r) : null;
}

const secureRandom = () => crypto.randomInt(0, 1_000_000_000) / 1_000_000_000;

export async function issuePressCard(input: {
  userId: string; designation: string; validFrom?: Date; validTill?: Date; photoUrl?: string; issuedById: string;
}): Promise<PressCardDto> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, name: true, active: true, reporterProfile: { select: { kycStatus: true, photoUrl: true } } },
  });
  if (!user || !user.active) throw new PressCardIssueError("NOT_FOUND", "User not found or inactive");
  const current = await getUserPressCard(user.id);
  const reason = issuableReason(user.reporterProfile, current);
  if (reason) throw new PressCardIssueError(reason, reason === "KYC_NOT_VERIFIED" ? "KYC must be VERIFIED before a card is issued" : reason === "NO_PHOTO" ? "A passport photo is required" : "User already has an active card");
  const validFrom = input.validFrom ?? new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const validTill = input.validTill ?? defaultValidTill(validFrom);
  const photoUrl = input.photoUrl || user.reporterProfile!.photoUrl!;

  const row = await prisma.$transaction(async (tx) => {
    const active = await tx.pressCard.findFirst({ where: { userId: user.id, status: "ACTIVE", validTill: { gte: new Date() } }, select: { id: true } });
    if (active) throw new PressCardIssueError("ALREADY_ACTIVE", "User already has an active card");
    const year = validFrom.getUTCFullYear();
    const nos = await tx.pressCard.findMany({ where: { cardNo: { startsWith: `RSN/${year}/` } }, select: { cardNo: true } });
    return tx.pressCard.create({
      data: {
        cardNo: nextCardNo(nos.map((n) => n.cardNo), year), token: mintPressCardToken(secureRandom),
        name: user.name, designation: input.designation.trim(), photoUrl, validFrom, validTill,
        userId: user.id, issuedById: input.issuedById,
      },
      select: SELECT,
    });
  });
  return toDto(row);
}

export async function revokePressCard(cardId: string, note: string): Promise<PressCardDto> {
  const r = await prisma.pressCard.findUnique({ where: { id: cardId }, select: { status: true } });
  if (!r) throw new PressCardIssueError("NOT_FOUND", "Card not found");
  if (r.status === "REVOKED") throw new PressCardIssueError("NOT_ACTIVE", "Card is already revoked");
  const row = await prisma.pressCard.update({ where: { id: cardId }, data: { status: "REVOKED", revokedAt: new Date(), revokeNote: note.trim() }, select: SELECT });
  return toDto(row);
}

export async function renewPressCard(cardId: string, issuedById: string): Promise<PressCardDto> {
  const old = await prisma.pressCard.findUnique({ where: { id: cardId }, select: { ...SELECT, issuedById: true } });
  if (!old || !old.userId) throw new PressCardIssueError("NOT_FOUND", "Card not found or not linked to a user");
  if (old.status === "REVOKED") throw new PressCardIssueError("NOT_ACTIVE", "Revoked cards cannot be renewed; issue a new card");
  const validFrom = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const row = await prisma.$transaction(async (tx) => {
    const fresh = await tx.pressCard.findUnique({ where: { id: cardId }, select: { status: true } });
    if (!fresh || fresh.status !== "ACTIVE") throw new PressCardIssueError("NOT_ACTIVE", "Card already renewed");
    await tx.pressCard.update({ where: { id: cardId }, data: { status: "REVOKED", revokedAt: new Date(), revokeNote: "renewed" } });
    const year = validFrom.getUTCFullYear();
    const nos = await tx.pressCard.findMany({ where: { cardNo: { startsWith: `RSN/${year}/` } }, select: { cardNo: true } });
    return tx.pressCard.create({
      data: {
        cardNo: nextCardNo(nos.map((n) => n.cardNo), year), token: mintPressCardToken(secureRandom),
        name: old.name, designation: old.designation, photoUrl: old.photoUrl, validFrom, validTill: defaultValidTill(validFrom),
        userId: old.userId, issuedById, renewedFromId: old.id,
      },
      select: SELECT,
    });
  });
  return toDto(row);
}
```

Run the unit test → PASS.

- [ ] **Step 3: Routes**

`apps/admin/src/app/api/press-card/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError, zodErrorResponse } from "@/lib/api-utils";
import { issuePressCard, getUserPressCard, issuableReason, PressCardIssueError } from "@/lib/press-card/service";

const ISSUERS = ["ADMIN", "EDITOR"] as const;
const dayRe = /^\d{4}-\d{2}-\d{2}$/;
const issueSchema = z.object({
  userId: z.string().min(1),
  designation: z.string().trim().min(2).max(60),
  validFrom: z.string().regex(dayRe).optional(),
  validTill: z.string().regex(dayRe).optional(),
  photoUrl: z.string().url().max(500).optional(),
}).strict();

export async function GET(req: NextRequest) {
  const session = await requireAuth([...ISSUERS]);
  if (isAuthError(session)) return session;
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  const [card, user] = await Promise.all([
    getUserPressCard(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { reporterProfile: { select: { kycStatus: true, photoUrl: true } } } }),
  ]);
  const reason = user ? issuableReason(user.reporterProfile, card) : "KYC_NOT_VERIFIED";
  return NextResponse.json({ card, issuable: { ok: !reason, reason: reason ?? undefined } });
}

export async function POST(req: NextRequest) {
  const session = await requireAuth([...ISSUERS]);
  if (isAuthError(session)) return session;
  const parsed = issueSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const b = parsed.data;
  try {
    const dto = await issuePressCard({
      userId: b.userId, designation: b.designation, photoUrl: b.photoUrl, issuedById: session.user.id,
      validFrom: b.validFrom ? new Date(`${b.validFrom}T00:00:00.000Z`) : undefined,
      validTill: b.validTill ? new Date(`${b.validTill}T00:00:00.000Z`) : undefined,
    });
    return NextResponse.json(dto, { status: 201 });
  } catch (e) {
    if (e instanceof PressCardIssueError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === "NOT_FOUND" ? 404 : 409 });
    return apiError(e);
  }
}
```

`apps/admin/src/app/api/press-card/[id]/renew/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { renewPressCard, PressCardIssueError } from "@/lib/press-card/service";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  const { id } = await params;
  try {
    return NextResponse.json(await renewPressCard(id, session.user.id), { status: 201 });
  } catch (e) {
    if (e instanceof PressCardIssueError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === "NOT_FOUND" ? 404 : 409 });
    return apiError(e);
  }
}
```

`apps/admin/src/app/api/press-card/[id]/revoke/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError, apiError, zodErrorResponse } from "@/lib/api-utils";
import { revokePressCard, PressCardIssueError } from "@/lib/press-card/service";

const schema = z.object({ note: z.string().trim().min(3).max(200) }).strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return zodErrorResponse(parsed.error);
  try {
    return NextResponse.json(await revokePressCard(id, parsed.data.note));
  } catch (e) {
    if (e instanceof PressCardIssueError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === "NOT_FOUND" ? 404 : 409 });
    return apiError(e);
  }
}
```

- [ ] **Step 4: Manual matrix (dev server on 3101, local DB)**

Log in as admin in a browser, copy the session cookie, then:

```bash
C="Cookie: <paste>"
curl -s -H "$C" "http://localhost:3101/api/press-card?userId=<reporter-with-verified-kyc>"      # -> card null, issuable ok
curl -s -H "$C" -H "content-type: application/json" -d '{"userId":"<id>","designation":"Reporter / Copy Writer"}' http://localhost:3101/api/press-card   # 201, cardNo RSN/2026/006
curl -s -H "$C" -H "content-type: application/json" -d '{"userId":"<id>","designation":"Reporter"}' http://localhost:3101/api/press-card   # 409 ALREADY_ACTIVE
curl -s -X POST -H "$C" http://localhost:3101/api/press-card/<cardId>/renew & curl -s -X POST -H "$C" http://localhost:3101/api/press-card/<cardId>/renew; wait   # one 201, one 409
curl -s -X POST -H "$C" -H "content-type: application/json" -d '{"note":"lost card"}' http://localhost:3101/api/press-card/<newCardId>/revoke   # 200 REVOKED
```

Also log in as a REPORTER and confirm `POST /api/press-card` → 403.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/lib/press-card/service.ts apps/admin/__tests__/press-card-service.test.ts apps/admin/src/app/api/press-card
git commit -m "feat(press): issue / renew / revoke service + admin API"
```

---

### Task 6: PDF download endpoint + short-lived download links (admin)

**Files:**
- Create: `apps/admin/src/lib/press-card/download-token.ts`
- Create: `apps/admin/src/app/api/press-card/[id]/pdf/route.ts`
- Create: `apps/admin/src/app/api/press-card/mine/route.ts` (GET own card + mint download link)
- Test: `apps/admin/__tests__/press-card-download-token.test.ts`

**Interfaces:**
- Consumes: Task 4 `renderPressCardPdf`, Task 5 `getPressCardById`, `getUserPressCard`; `getReporterId` from `@/lib/reporter-auth` (bearer or session); `requireAuth`.
- Produces:
  - `createDownloadToken(cardId: string, now?: number): string` / `verifyDownloadToken(token: string, now?: number): string | null` (10-minute HMAC, secret = `REPORTER_TOKEN_SECRET || NEXTAUTH_SECRET`)
  - `GET /api/press-card/[id]/pdf` — auth: `?t=<downloadToken>` for that card, OR reporter bearer/session owning the card, OR ADMIN/EDITOR session. Returns `application/pdf`, `Content-Disposition: attachment; filename="press-card-RSN-2026-001.pdf"`. 403 when the holder's liveStatus is SEPARATED or REVOKED (admins still allowed). 503 `{ error: "Card image could not be loaded, try again" }` on `PHOTO_UNREACHABLE` / `RENDER_FAILED` after one retry.
  - `GET /api/press-card/mine` — reporter bearer/session → `{ card: dto | null, issuable: {...}, downloadUrl: string | null }` where `downloadUrl = <origin>/api/press-card/<id>/pdf?t=<downloadToken>` only when liveStatus ACTIVE.

- [ ] **Step 1: Failing token test**

```ts
import { describe, test, expect } from "bun:test";
import { createDownloadToken, verifyDownloadToken } from "../src/lib/press-card/download-token";

describe("download token", () => {
  test("round-trips within 10 minutes", () => {
    const t0 = 1_800_000_000_000;
    const tok = createDownloadToken("card1", t0);
    expect(verifyDownloadToken(tok, t0 + 5 * 60_000)).toBe("card1");
  });
  test("expires after 10 minutes", () => {
    const t0 = 1_800_000_000_000;
    expect(verifyDownloadToken(createDownloadToken("card1", t0), t0 + 11 * 60_000)).toBeNull();
  });
  test("tamper -> null", () => {
    const tok = createDownloadToken("card1");
    expect(verifyDownloadToken(tok.slice(0, -2) + "zz")).toBeNull();
    expect(verifyDownloadToken("")).toBeNull();
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement `download-token.ts`**

```ts
// Short-lived (10 min) HMAC token so the mobile app can hand the PDF URL to
// the OS browser without putting the 30-day reporter token in a URL.
import crypto from "node:crypto";
const SECRET = process.env.REPORTER_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || "dev-insecure-reporter-secret";
const TTL_MS = 10 * 60 * 1000;
const sign = (body: string) => crypto.createHmac("sha256", SECRET).update(`pdf:${body}`).digest("base64url");

export function createDownloadToken(cardId: string, now: number = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ c: cardId, exp: now + TTL_MS })).toString("base64url");
  return `${body}.${sign(body)}`;
}
export function verifyDownloadToken(token: string, now: number = Date.now()): string | null {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const { c, exp } = JSON.parse(Buffer.from(body, "base64url").toString());
    return typeof c === "string" && typeof exp === "number" && exp > now ? c : null;
  } catch { return null; }
}
```

Run → PASS.

- [ ] **Step 3: PDF route**

`apps/admin/src/app/api/press-card/[id]/pdf/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getReporterId } from "@/lib/reporter-auth";
import { getPressCardById } from "@/lib/press-card/service";
import { renderPressCardPdf, PressCardRenderError } from "@/lib/press-card/render";
import { verifyDownloadToken } from "@/lib/press-card/download-token";

export const dynamic = "force-dynamic";

// Who may download: (1) a valid short-lived ?t= token for THIS card,
// (2) the holder (bearer token from the app or reporter web session),
// (3) an ADMIN / EDITOR session. Holders are blocked once SEPARATED or
// REVOKED; staff can still pull the PDF for records.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = await getPressCardById(id);
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let allowed = false; let isStaff = false;
  const t = req.nextUrl.searchParams.get("t");
  if (t && verifyDownloadToken(t) === id) allowed = true;
  if (!allowed) {
    const holder = await getReporterId(req);
    if (holder && holder === card.userId) allowed = true;
  }
  if (!allowed) {
    const session = await auth();
    const role = (session?.user as any)?.role as string | undefined;
    if (role === "ADMIN" || role === "EDITOR") { allowed = true; isStaff = true; }
  }
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isStaff && card.liveStatus !== "ACTIVE") {
    return NextResponse.json({ error: `Card is ${card.liveStatus.toLowerCase()}; download is disabled`, code: card.liveStatus }, { status: 403 });
  }

  const data = { ...card, validFrom: new Date(`${card.validFrom}T00:00:00.000Z`), validTill: new Date(`${card.validTill}T00:00:00.000Z`) };
  let pdf: Buffer | null = null; let lastErr: unknown;
  for (let attempt = 0; attempt < 2 && !pdf; attempt++) {
    try { pdf = await renderPressCardPdf(data); } catch (e) { lastErr = e; }
  }
  if (!pdf) {
    console.error("[press-card] render failed", id, lastErr);
    const msg = lastErr instanceof PressCardRenderError && lastErr.code === "PHOTO_UNREACHABLE" ? "Card photo could not be loaded, try again" : "Card could not be rendered, try again";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="press-card-${card.cardNo.replace(/\//g, "-")}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
```

- [ ] **Step 4: `mine` route**

`apps/admin/src/app/api/press-card/mine/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { getReporterId } from "@/lib/reporter-auth";
import { getUserPressCard, issuableReason } from "@/lib/press-card/service";
import { createDownloadToken } from "@/lib/press-card/download-token";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await getReporterId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [card, user] = await Promise.all([
    getUserPressCard(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { reporterProfile: { select: { kycStatus: true, photoUrl: true } } } }),
  ]);
  const reason = issuableReason(user?.reporterProfile ?? null, card);
  const origin = process.env.NEXTAUTH_URL || req.nextUrl.origin;
  const downloadUrl = card && card.liveStatus === "ACTIVE" ? `${origin}/api/press-card/${card.id}/pdf?t=${createDownloadToken(card.id)}` : null;
  return NextResponse.json({ card, issuable: { ok: !reason, reason: reason ?? undefined }, downloadUrl });
}
```

- [ ] **Step 5: Manual auth matrix**

With dev server on 3101:

```bash
# admin session -> 200 pdf
curl -s -o /tmp/a.pdf -w "%{http_code} %{content_type}\n" -H "$ADMIN_COOKIE" http://localhost:3101/api/press-card/<cardId>/pdf
# reporter session, own card -> 200 ; other card -> 403
curl -s -o /dev/null -w "%{http_code}\n" -H "$REPORTER_COOKIE" http://localhost:3101/api/press-card/<ownCardId>/pdf
curl -s -o /dev/null -w "%{http_code}\n" -H "$REPORTER_COOKIE" http://localhost:3101/api/press-card/<otherCardId>/pdf
# mine -> downloadUrl, then unauthenticated GET of that URL -> 200
curl -s -H "$REPORTER_COOKIE" http://localhost:3101/api/press-card/mine
curl -s -o /dev/null -w "%{http_code}\n" "<downloadUrl>"
# no auth at all -> 403
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3101/api/press-card/<cardId>/pdf
```

Then set lastWorkingDate = yesterday for that reporter (Task 2 UI) → own-card download 403 with code SEPARATED; admin still 200.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/lib/press-card/download-token.ts apps/admin/__tests__/press-card-download-token.test.ts "apps/admin/src/app/api/press-card/[id]/pdf/route.ts" apps/admin/src/app/api/press-card/mine/route.ts
git commit -m "feat(press): PDF download endpoint with holder/staff auth + short-lived links"
```

---

### Task 7: Admin UI — Press ID card dialog off the Users row menu

**Files:**
- Create: `apps/admin/src/components/users/press-card-dialog.tsx`
- Modify: `apps/admin/src/app/(dashboard)/users/page.tsx` (row menu item + dialog mount)

**Interfaces:**
- Consumes: Task 5/6 endpoints (`GET/POST /api/press-card`, `/renew`, `/revoke`, `/pdf`).
- Produces: `<PressCardDialog user={ { id, name, role } | null } onClose={() => void} />`.

- [ ] **Step 1: Component**

Create `apps/admin/src/components/users/press-card-dialog.tsx` (mirrors `kyc-review-dialog.tsx` conventions: self-contained, fetches on open, `sonner` toasts, shadcn Dialog/Button/Input/Label):

```tsx
"use client";
// Press ID card panel - opens from the /users row dropdown. Issues, renews,
// revokes and downloads a user's card. Self-contained: fetches
// /api/press-card?userId= on open.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Dto = {
  id: string; cardNo: string; designation: string; photoUrl: string; validFrom: string; validTill: string;
  liveStatus: "ACTIVE" | "EXPIRED" | "REVOKED" | "SEPARATED"; revokeNote: string | null; verifyUrl: string;
};
type Payload = { card: Dto | null; issuable: { ok: boolean; reason?: string } };

const REASON: Record<string, string> = {
  KYC_NOT_VERIFIED: "KYC must be verified first (Review & documents).",
  NO_PHOTO: "No passport photo on the profile yet.",
  ALREADY_ACTIVE: "User already has an active card.",
};
const CHIP: Record<Dto["liveStatus"], string> = {
  ACTIVE: "bg-green-100 text-green-700 border-green-200",
  EXPIRED: "bg-amber-100 text-amber-700 border-amber-200",
  REVOKED: "bg-red-100 text-red-700 border-red-200",
  SEPARATED: "bg-muted text-muted-foreground border-transparent",
};

export function PressCardDialog({ user, onClose }: { user: { id: string; name: string; role: string } | null; onClose: () => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [designation, setDesignation] = useState("");
  const [revokeNote, setRevokeNote] = useState("");

  const load = async () => {
    if (!user) return;
    const res = await fetch(`/api/press-card?userId=${user.id}`);
    if (!res.ok) { toast.error("Could not load press card"); return; }
    const p = (await res.json()) as Payload;
    setData(p);
    setDesignation(p.card?.designation ?? (user.role === "REPORTER" ? "Reporter / Copy Writer" : ""));
  };
  useEffect(() => { setData(null); setRevokeNote(""); if (user) void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  const call = async (url: string, body?: unknown, okMsg?: string) => {
    setBusy(true);
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(j.error || "Failed"); return; }
      if (okMsg) toast.success(okMsg);
      await load();
    } finally { setBusy(false); }
  };

  const card = data?.card ?? null;
  return (
    <Dialog open={!!user} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Press ID card · {user?.name}</DialogTitle>
          <DialogDescription>Issue, renew or revoke the card. Scanning the printed QR opens the verify page.</DialogDescription>
        </DialogHeader>
        {!data ? <p className="text-sm text-muted-foreground">Loading…</p> : (
          <div className="space-y-4">
            {card && (
              <div className="flex gap-4 rounded-md border p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={card.photoUrl} alt="" className="h-24 w-18 rounded object-cover border" />
                <div className="text-sm space-y-1">
                  <div className="flex items-center gap-2"><span className="font-semibold">{card.cardNo}</span><Badge className={CHIP[card.liveStatus]}>{card.liveStatus}</Badge></div>
                  <div>{card.designation}</div>
                  <div className="text-muted-foreground">Valid {card.validFrom} → {card.validTill}</div>
                  {card.revokeNote && <div className="text-red-700">Note: {card.revokeNote}</div>}
                  <a className="text-red-700 underline" href={card.verifyUrl} target="_blank" rel="noreferrer">{card.verifyUrl}</a>
                  <div className="flex gap-2 pt-1">
                    <Button asChild size="sm" variant="outline"><a href={`/api/press-card/${card.id}/pdf`}>Download PDF</a></Button>
                    {card.liveStatus === "ACTIVE" && (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => { if (confirm("Renew for one more year? The old QR stops working and the card must be reprinted.")) void call(`/api/press-card/${card.id}/renew`, undefined, "Card renewed"); }}>Renew</Button>
                    )}
                  </div>
                </div>
              </div>
            )}
            {card && card.liveStatus !== "REVOKED" && (
              <div className="space-y-2 rounded-md border border-red-200 p-3">
                <Label htmlFor="revokeNote">Revoke (reason, required)</Label>
                <Input id="revokeNote" value={revokeNote} onChange={(e) => setRevokeNote(e.target.value)} placeholder="Lost card / left organisation / misuse" />
                <Button size="sm" variant="destructive" disabled={busy || revokeNote.trim().length < 3} onClick={() => void call(`/api/press-card/${card.id}/revoke`, { note: revokeNote }, "Card revoked")}>Revoke card</Button>
              </div>
            )}
            {(!card || card.liveStatus !== "ACTIVE") && (
              <div className="space-y-2 rounded-md border p-3">
                <Label htmlFor="desig">Issue new card · designation</Label>
                <Input id="desig" value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Reporter / Copy Writer" />
                {!data.issuable.ok && <p className="text-xs text-amber-700">{REASON[data.issuable.reason ?? ""] ?? data.issuable.reason}</p>}
                <Button size="sm" disabled={busy || !data.issuable.ok || designation.trim().length < 2} onClick={() => void call("/api/press-card", { userId: user!.id, designation }, "Card issued")}>Issue card (1 year)</Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire into the users page**

In `apps/admin/src/app/(dashboard)/users/page.tsx`:
- Import: `import { PressCardDialog } from "@/components/users/press-card-dialog";`
- State next to `resettingUser`: `const [pressCardUser, setPressCardUser] = useState<{ id: string; name: string; role: string } | null>(null);`
- Row menu: after `<DropdownMenuItem onSelect={() => onResetPassword(row)}>Reset password</DropdownMenuItem>` add `<DropdownMenuItem onSelect={() => onPressCard(row)}>Press ID card</DropdownMenuItem>`; thread `onPressCard` through the row-actions component props exactly like `onResetPassword` is threaded (same signature `(row: UserRow) => void`), implemented as `setPressCardUser({ id: row.id, name: row.name, role: row.role })`.
- Mount after `<PasswordResetDialog …/>`: `<PressCardDialog user={pressCardUser} onClose={() => setPressCardUser(null)} />`.

- [ ] **Step 3: Manual check**

Dev server: Users → row menu → Press ID card → Issue → chip ACTIVE, verify link opens; Download PDF saves a 2-page PDF; Renew → new cardNo, old shows in history? (only latest shown, acceptable); Revoke → chip REVOKED.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/components/users/press-card-dialog.tsx "apps/admin/src/app/(dashboard)/users/page.tsx"
git commit -m "feat(press): admin Press ID card dialog on Users"
```

---

### Task 8: Reporter web — profile tiles + press-card page

**Files:**
- Modify: `apps/admin/src/app/(dashboard)/reporter/profile/page.tsx` (two tiles)
- Create: `apps/admin/src/app/(dashboard)/reporter/profile/press-card/page.tsx`

**Interfaces:**
- Consumes: Task 5 `getUserPressCard`, `issuableReason`; `auth()`; `ReporterShell`, `MenuGroup`, `MenuRow`, `Divider` from the profile page (they are local to that file — export them to `apps/admin/src/components/reporter/menu-rows.tsx` first, see Step 1).

- [ ] **Step 1: Extract MenuGroup / MenuRow / Divider**

Move the three local components at the bottom of `reporter/profile/page.tsx` into `apps/admin/src/components/reporter/menu-rows.tsx` with `export function MenuGroup`, `export function MenuRow`, `export function Divider` (bodies unchanged; add `"use client"` only if they use hooks — they do not, keep them server-safe). Import them back into the profile page. Run `bun run lint` in apps/admin to confirm no unused imports.

- [ ] **Step 2: Add the tiles**

In the profile page, after the Bank group add:

```tsx
<MenuGroup>
  <MenuRow
    href="/reporter/earnings"
    iconBg="#0ea5e914"
    iconColor="#0ea5e9"
    iconPath="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"
    label="Payouts"
    sub="Earnings and payment history"
  />
  <Divider />
  <MenuRow
    href="/reporter/profile/press-card"
    iconBg="#D5000014"
    iconColor="#D50000"
    iconPath="M3 5h18v14H3zM7 9h4v6H7zm7 0h4M14 12h4M14 15h3"
    label="Press ID card"
    sub={pressCardSub}
    last
  />
</MenuGroup>
```

and compute `pressCardSub` above the return:

```tsx
import { getUserPressCard } from "@/lib/press-card/service";
const pc = await getUserPressCard(userId);
const pressCardSub = pc ? `${pc.cardNo} · ${pc.liveStatus === "ACTIVE" ? `valid till ${pc.validTill}` : pc.liveStatus.toLowerCase()}` : "Not issued yet";
```

- [ ] **Step 3: Press-card page**

Create `apps/admin/src/app/(dashboard)/reporter/profile/press-card/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { ReporterShell } from "@/components/reporter/reporter-shell";
import { getUserPressCard, issuableReason } from "@/lib/press-card/service";

const CHIP: Record<string, { bg: string; fg: string; label: string }> = {
  ACTIVE: { bg: "#dcfce7", fg: "#166534", label: "Active" },
  EXPIRED: { bg: "#fef3c7", fg: "#92400e", label: "Expired" },
  REVOKED: { bg: "#fef2f2", fg: "#dc2626", label: "Revoked" },
  SEPARATED: { bg: "#f1f5f9", fg: "#475569", label: "Former staff" },
};
const REASON: Record<string, string> = {
  KYC_NOT_VERIFIED: "Complete KYC and wait for verification. Your card is issued after that.",
  NO_PHOTO: "Upload your passport photo in KYC documents. Your card is issued after that.",
};

export default async function ReporterPressCardPage() {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;
  if (!userId) redirect("/login");
  if (role && role !== "REPORTER") redirect("/");
  const [card, user] = await Promise.all([
    getUserPressCard(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { reporterProfile: { select: { kycStatus: true, photoUrl: true } } } }),
  ]);
  const reason = issuableReason(user?.reporterProfile ?? null, card);

  return (
    <ReporterShell title="Press ID card" back="/reporter/profile">
      <div style={{ padding: 16, display: "grid", gap: 14 }}>
        {card ? (
          <>
            <div style={{ display: "flex", gap: 14, background: "#fff", border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={card.photoUrl} alt="" style={{ width: 84, height: 112, objectFit: "cover", borderRadius: 8, border: "2px solid #D50000" }} />
              <div style={{ fontSize: 14 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{card.name}</div>
                <div style={{ color: "#D50000", fontWeight: 700 }}>{card.designation}</div>
                <div style={{ marginTop: 6 }}>{card.cardNo}</div>
                <div style={{ color: "#666" }}>Valid {card.validFrom} → {card.validTill}</div>
                <span style={{ display: "inline-block", marginTop: 8, padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800, background: CHIP[card.liveStatus].bg, color: CHIP[card.liveStatus].fg }}>{CHIP[card.liveStatus].label}</span>
              </div>
            </div>
            {card.liveStatus === "ACTIVE" ? (
              <a href={`/api/press-card/${card.id}/pdf`} style={{ display: "block", textAlign: "center", background: "#D50000", color: "#fff", fontWeight: 800, padding: 14, borderRadius: 10, textDecoration: "none" }}>Download card (PDF)</a>
            ) : (
              <p style={{ fontSize: 13, color: "#666" }}>
                {card.liveStatus === "EXPIRED" && "Your card has expired. Ask the editor to renew it."}
                {card.liveStatus === "REVOKED" && `This card was revoked${card.revokeNote ? ` (${card.revokeNote})` : ""}. Ask the editor for a new one.`}
                {card.liveStatus === "SEPARATED" && "Your employment has ended, so the card is no longer valid."}
              </p>
            )}
            <a href={card.verifyUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "#D50000" }}>Open public verify page</a>
          </>
        ) : (
          <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 12, padding: 16, fontSize: 14 }}>
            <p style={{ fontWeight: 800, marginBottom: 6 }}>Your card has not been issued yet</p>
            <p style={{ color: "#666" }}>{REASON[reason ?? ""] ?? "The editor will issue your card shortly."}</p>
            {reason === "KYC_NOT_VERIFIED" || reason === "NO_PHOTO" ? <Link href="/reporter/profile/kyc" style={{ color: "#D50000", fontWeight: 700 }}>Go to KYC documents →</Link> : null}
          </div>
        )}
      </div>
    </ReporterShell>
  );
}
```

Check the `ReporterShell` props by reading `apps/admin/src/components/reporter/reporter-shell.tsx` — if it takes different prop names than `title` / `back`, use its actual ones.

- [ ] **Step 4: Manual check**

Log in as a reporter with an issued card → profile shows both tiles → Press ID card page → Download works → open verify page link.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/components/reporter/menu-rows.tsx "apps/admin/src/app/(dashboard)/reporter/profile/page.tsx" "apps/admin/src/app/(dashboard)/reporter/profile/press-card/page.tsx"
git commit -m "feat(press): reporter web profile tiles + press card page"
```

---

### Task 9: Mobile reporter app — Payouts + Press ID card rows

**Files:**
- Modify: `apps/reporter/src/screens/ProfileScreen.tsx`
- Modify: `apps/reporter/src/i18n/translations.ts` (en + te `profile` blocks)

**Interfaces:**
- Consumes: `GET /api/press-card/mine` (bearer) → `{ card, downloadUrl }`; `api()` from `../api/client`; `Linking` from `expo-linking`.

- [ ] **Step 1: i18n keys**

In both language `profile: { ... }` blocks add:

```ts
payouts: "Payouts",            // te: "చెల్లింపులు"
payoutsSub: "Earnings and payment history",   // te: "ఆదాయం మరియు చెల్లింపుల చరిత్ర"
pressCard: "Press ID card",    // te: "ప్రెస్ ఐడీ కార్డ్"
pressCardNotIssued: "Not issued yet",   // te: "ఇంకా జారీ కాలేదు"
pressCardValidTill: "Valid till",       // te: "చెల్లుబాటు"
pressCardDownloadFail: "Could not open the card. Try again.",  // te: "కార్డు తెరవలేకపోయాం. మళ్లీ ప్రయత్నించండి."
```

- [ ] **Step 2: Rows**

In `ProfileScreen.tsx`:

```tsx
import * as Linking from "expo-linking";
// state
const [pressCard, setPressCard] = useState<{ card: { cardNo: string; validTill: string; liveStatus: string } | null; downloadUrl: string | null } | null>(null);
// in the existing load/refresh effect, alongside the profile fetch:
api("/api/press-card/mine").then(setPressCard).catch(() => setPressCard(null));
```

Insert before the "Pending requests" row:

```tsx
<MenuRow
  icon="cash-outline"
  label={t("profile.payouts")}
  sub={t("profile.payoutsSub")}
  onPress={() => router.push("/(tabs)/earnings")}
/>
<MenuRow
  icon="card-outline"
  label={t("profile.pressCard")}
  sub={pressCard?.card ? `${pressCard.card.cardNo} · ${pressCard.card.liveStatus === "ACTIVE" ? `${t("profile.pressCardValidTill")} ${pressCard.card.validTill}` : pressCard.card.liveStatus.toLowerCase()}` : t("profile.pressCardNotIssued")}
  onPress={async () => {
    Haptics.selectionAsync();
    try {
      const fresh = await api("/api/press-card/mine");   // links expire in 10 min - always mint fresh
      if (!fresh?.downloadUrl) { Alert.alert(t("profile.pressCard"), t("profile.pressCardNotIssued")); return; }
      await Linking.openURL(fresh.downloadUrl);
    } catch { Alert.alert(t("profile.pressCard"), t("profile.pressCardDownloadFail")); }
  }}
/>
```

(`api()` already attaches the bearer token and returns parsed JSON; confirm its return shape in `apps/reporter/src/api/client.ts` lines 76-125 and adapt `.then(setPressCard)` if it returns `{ data }`.)

- [ ] **Step 3: Manual check on device / Expo Go**

Profile → Press ID card → browser opens PDF → share/save works. Reporter without a card sees "Not issued yet".

- [ ] **Step 4: Commit**

```bash
git add apps/reporter/src/screens/ProfileScreen.tsx apps/reporter/src/i18n/translations.ts
git commit -m "feat(reporter-app): payouts + press ID card rows on profile"
```

---

### Task 10: Public verify page — SEPARATED state

**Files:**
- Modify: `apps/web/src/app/verify/[token]/page.tsx`

- [ ] **Step 1: Select holder dates and pass to the status function**

In `fetchCard` add to `select`: `user: { select: { joinedAt: true, lastWorkingDate: true } }`.
Change `const live = computePressCardStatus(card);` to `const live = computePressCardStatus(card, new Date(), card.user ?? undefined);`.

- [ ] **Step 2: Add the state to the UI map**

```ts
const STATUS_UI: Record<PressCardLiveStatus, { label: string; sub: string; bg: string; fg: string }> = {
  ACTIVE:    { label: "VERIFIED · ACTIVE", sub: "This press card is genuine and currently valid.", bg: "#0f9d58", fg: "#fff" },
  EXPIRED:   { label: "EXPIRED",           sub: "This card's validity period has ended. Treat as not valid.", bg: "#c62828", fg: "#fff" },
  REVOKED:   { label: "REVOKED",           sub: "This card has been cancelled by the publisher. Not valid.", bg: "#b71c1c", fg: "#fff" },
  SEPARATED: { label: "FORMER STAFF",      sub: "The holder is no longer with Rayalaseema News. This card is not valid.", bg: "#546e7a", fg: "#fff" },
};
```

Under the chip, after the `revokedAt` line, add:

```tsx
{live === "SEPARATED" && card.user?.lastWorkingDate && (
  <div style={{ fontSize: 12, opacity: 0.9, marginTop: 6 }}>
    Worked with Rayalaseema News {card.user.joinedAt ? `from ${fmt(card.user.joinedAt)} ` : ""}until {fmt(card.user.lastWorkingDate)}.
  </div>
)}
```

- [ ] **Step 3: Local check**

`cd apps/web && bun run dev -- -p 3100`; set a reporter's lastWorkingDate to yesterday (Task 2 UI on the admin dev server, same local DB); curl `http://localhost:3100/verify/<token>` → contains `FORMER STAFF`. Clear the date → `VERIFIED · ACTIVE`.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/verify/[token]/page.tsx"
git commit -m "feat(press): verify page shows FORMER STAFF with service dates"
```

---

### Task 11: Link the five v1 cards to users; retire the JSON seed

**Files:**
- Create: `packages/db/scripts/link-press-cards-to-users.ts`
- Modify: `.github/workflows/deploy.yml` (add link step after the seed step)
- Later (follow-up commit after prod confirms 5/5 linked): remove seed step, delete `packages/db/prisma/press-cards.json`, delete `packages/db/scripts/seed-press-cards.ts`.

- [ ] **Step 1: Script (idempotent, exact-name match only)**

```ts
// Links v1 JSON-seeded PressCard rows (userId null) to the User with the
// exact same name. Prints what it could not match; those get linked by an
// admin from the Users → Press ID card dialog (an unlinked card with the
// same name is offered there). Safe to run on every deploy.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const cards = await prisma.pressCard.findMany({ where: { userId: null }, select: { id: true, cardNo: true, name: true } });
  let linked = 0;
  for (const c of cards) {
    const users = await prisma.user.findMany({ where: { name: c.name, active: true }, select: { id: true } });
    if (users.length === 1) { await prisma.pressCard.update({ where: { id: c.id }, data: { userId: users[0].id } }); linked++; console.log(`linked ${c.cardNo} -> ${users[0].id}`); }
    else console.log(`UNMATCHED ${c.cardNo} "${c.name}" (${users.length} candidates)`);
  }
  console.log(`press cards linked: ${linked}, still unlinked: ${cards.length - linked}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

- [ ] **Step 2: deploy.yml**

After `bunx tsx scripts/seed-press-cards.ts` add:

```
            echo "=== Link v1 press cards to user accounts by exact name (idempotent) ==="
            bunx tsx scripts/link-press-cards-to-users.ts
```

- [ ] **Step 3: Admin fallback for unmatched**

In `press-card-dialog.tsx` (Task 7) the `GET /api/press-card?userId=` response should also return `unlinked: { id, cardNo }[]` — cards with `userId: null` whose `name` equals the user's name — and the dialog shows a "Link card RSN/2026/00N to this user" button calling `POST /api/press-card/[id]/link` with `{ userId }`. Add that route:

```ts
// apps/admin/src/app/api/press-card/[id]/link/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, zodErrorResponse } from "@/lib/api-utils";
const schema = z.object({ userId: z.string().min(1) }).strict();
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const card = await prisma.pressCard.findUnique({ where: { id }, select: { userId: true } });
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (card.userId) return NextResponse.json({ error: "Card already linked" }, { status: 409 });
  await prisma.pressCard.update({ where: { id }, data: { userId: parsed.data.userId } });
  return NextResponse.json({ ok: true });
}
```

and in the GET handler of `api/press-card/route.ts` add `unlinked: await prisma.pressCard.findMany({ where: { userId: null, name: user.name }, select: { id: true, cardNo: true } })` (select `name: true` on the user query).

- [ ] **Step 4: Commit**

```bash
git add packages/db/scripts/link-press-cards-to-users.ts .github/workflows/deploy.yml "apps/admin/src/app/api/press-card/[id]/link/route.ts" apps/admin/src/app/api/press-card/route.ts apps/admin/src/components/users/press-card-dialog.tsx
git commit -m "feat(press): link v1 cards to user accounts on deploy + admin fallback"
```

- [ ] **Step 5 (after prod deploy shows "still unlinked: 0"): retire the JSON seed**

Remove the `seed-press-cards.ts` step and the link step from `deploy.yml`, delete `packages/db/prisma/press-cards.json`, `packages/db/scripts/seed-press-cards.ts`, `packages/db/scripts/link-press-cards-to-users.ts`. Mark `docs/press-cards/build-cards.py` header with "LEGACY — the admin app renders cards; keep only for offline print-shop sheets". Commit:

```bash
git add -u .github/workflows/deploy.yml packages/db/prisma/press-cards.json packages/db/scripts/seed-press-cards.ts packages/db/scripts/link-press-cards-to-users.ts docs/press-cards/build-cards.py
git commit -m "chore(press): retire JSON seed now that cards live in the DB"
```

---

### Task 12: Deploy, verify on production, record

- [ ] **Step 1: Full test run**

Run: `cd "D:/Rayalaseema express" && bun test packages/db apps/admin`
Expected: all pass (render test skipped unless env set).

- [ ] **Step 2: Push + watch**

```bash
git push origin main
gh run watch "$(gh run list --workflow deploy.yml --branch main --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status --interval 30
```

Expected: success. If the run fails, read `gh run view <id> --log` for the runtime line, fix, push again.

- [ ] **Step 3: Production checks**

```bash
for t in a3dmykc2k3q7 u8c34aqk6aer nhu6c6h5g3y8 af2w6xset4sx xqa6fypq3s98; do curl -s -o /dev/null -w "$t %{http_code}\n" https://rayalaseemanews.com/verify/$t; done   # all 200
```

In the admin UI on production: Users → G. Srinivas Reddy → Press ID card → card shows (linked), Download PDF works. Log in as one reporter on the mobile app → Profile → Press ID card → PDF opens.

- [ ] **Step 4: Memory**

Update `C:\Users\reddygs\.claude\projects\d--Rayalaseema-express\memory\project_press_id_cards.md`: v2 shipped date, where issue/renew/revoke live, that JSON seed is retired, the SEPARATED behaviour, and the Python generator's legacy status.
