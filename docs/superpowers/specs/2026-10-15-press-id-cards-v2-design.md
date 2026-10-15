# Press ID Cards v2 — admin issue, self-service download, separation state

**Date:** 2026-10-15
**Status:** Draft for owner review
**Builds on:** v1 shipped 2026-10-06 (`PressCard` model, `/verify/<token>` page, JSON seed, Python card generator in `docs/press-cards/`).

## 1. Goal

Every staff member with a login gets a press ID card they can download themselves, the same way a citizen downloads an Aadhaar e-card: the organisation issues it, the holder downloads it. Admin issues, renews and revokes cards and can download any card. The public verify page keeps working for cards printed today and additionally says, for former staff, "worked with us from X to Y, no longer active".

Success looks like:

- A reporter opens their profile, sees Payouts and Press ID card tiles, taps Press ID card, downloads a print-ready PDF (front + back, QR works).
- Admin opens a user, issues a card in two clicks, downloads it, later renews or revokes it.
- Scanning a card of someone who left shows a clear "former staff" page with service dates, not a green ACTIVE.
- The five cards already printed keep verifying unchanged.

## 2. Current state (v1)

- `PressCard` rows seeded from `packages/db/prisma/press-cards.json` on every deploy; not linked to `User`.
- Photos uploaded manually to Azure blob `uploads/press-cards/`.
- Cards rendered locally by `docs/press-cards/build-cards.py` (HTML/CSS → headless Chrome).
- `/verify/<token>` on the web app shows ACTIVE / EXPIRED / REVOKED.
- Reporter app surfaces: admin app `/reporter/profile` (tiles: personal, address, KYC, bank, phone), `/reporter/earnings` (payouts). KYC flow already collects a passport photo (`ReporterProfile.photoUrl`) reviewed by admin.
- Admin app already ships Playwright Chromium (e-paper PDF rendering in `apps/admin/src/lib/epaper/render-edition.ts`).

## 3. Data model

### 3.1 `PressCard` (existing, extended)

| Field | Change |
|---|---|
| `userId` | becomes the normal link; still nullable only so the v1 rows can be linked after deploy. Indexed, not unique: renewals keep the old (revoked) row for history, so a user may own several rows but only one with `status = ACTIVE`. That rule is enforced in the issue/renew transaction. |
| `issuedById` | new, optional `User.id` of the admin who issued. |
| `revokeNote` | exists; used by the admin revoke dialog. |
| `renewedFromId` | new, optional; set when Renew creates a fresh row so history is kept. |

Everything else unchanged. Card number stays `RSN/<year>/<NNN>`, sequence per year, derived from the highest existing number inside a transaction; the unique constraint on `cardNo` protects against concurrent issues (retry once on conflict).

### 3.2 `User` (extended)

| Field | Purpose |
|---|---|
| `joinedAt DateTime?` | date of joining; shown on verify page for former staff. Backfilled from `User.createdAt` where null. |
| `lastWorkingDate DateTime?` | set by admin when someone leaves. Drives the SEPARATED state everywhere, no per-card revoke needed. |

### 3.3 Live status (pure function, `packages/db/src/press-card.ts`)

Order of precedence:

1. `REVOKED` — card `status = REVOKED`.
2. `SEPARATED` — linked user has `lastWorkingDate` set and it is before now.
3. `EXPIRED` — now outside `[validFrom, validTill]` (validTill inclusive day).
4. `ACTIVE`.

`computePressCardStatus` gains an optional `user: { lastWorkingDate }` argument. Existing tests stay green; new tests cover SEPARATED and the precedence.

## 4. Rendering

- One HTML template, `apps/admin/src/lib/press-card/template.ts`, ported line-for-line from `build-cards.py` (same CR80 portrait + 3 mm bleed, same CSS). English only. Logo assets copied to `apps/admin/public/press-card/` (logo files are public brand assets already).
- QR generated server-side with the `qrcode` npm package, encoding `https://rayalaseemanews.com/verify/<token>`.
- PDF produced by Playwright `page.pdf({ width: "60mm", height: "91.6mm", printBackground: true })`, two pages: front, back. Generated on demand, streamed, never stored. Photo fetched from the blob URL at render time.
- `docs/press-cards/build-cards.py` stays as the offline fallback until the TS template is verified pixel-equivalent, then is marked legacy in its header.

## 5. Surfaces

### 5.1 Admin app — Users → user detail

New "Press ID card" panel:

- No card: **Issue card** button. Requires `ReporterProfile.kycStatus = VERIFIED` and a photo; otherwise the button is disabled with the reason shown. Issue dialog: designation (prefilled from role / last card), valid from (today), valid till (default +1 year), optional photo override (uses existing `/api/upload` + crop). Creates the row, shows the verify URL and a Download PDF button.
- Card exists: status chip (live status), card number, validity, verify link, **Download PDF**, **Renew** (new validTill, new row linked via `renewedFromId`, old row set REVOKED with note "renewed"), **Revoke** (reason required).
- User detail also gets **Last working date** (sets `User.lastWorkingDate`; confirmation explains it flips the verify page to former staff and blocks login-side download).

### 5.2 Admin app — reporter self-service

- `/reporter/profile`: two new tiles beside the existing ones: **Payouts** (links to the existing `/reporter/earnings`) and **Press ID card**.
- `/reporter/profile/press-card`: shows live status, card number, validity, the verify link, a preview image of the front, **Download PDF**. If no card: "Your card has not been issued yet" plus what is missing (KYC pending / photo missing). If SEPARATED or REVOKED: download disabled, status explained.

### 5.3 Mobile reporter app (`apps/reporter`)

- Profile screen gets the same two tiles. Press ID card opens the download endpoint in the system browser with the existing session token; the OS share sheet handles save/print. No native PDF viewer work in this spec.

### 5.4 Public verify page (`apps/web/src/app/verify/[token]`)

- Adds the SEPARATED state: grey chip "FORMER STAFF", line "Worked with Rayalaseema News from `joinedAt` to `lastWorkingDate`. This card is no longer valid." Photo stays, greyed. No other personal data.
- Query selects the linked user's `lastWorkingDate` and `joinedAt`. Cards without a linked user behave as today.

## 6. Endpoints (admin app, session-protected)

| Method | Path | Who | Does |
|---|---|---|---|
| GET | `/api/press-card/[id]/pdf` | owner of the card, or ADMIN / EDITOR | streams the PDF |
| POST | `/api/press-card` | ADMIN / EDITOR | issue (body: userId, designation, validFrom, validTill, photoUrl?) |
| POST | `/api/press-card/[id]/renew` | ADMIN / EDITOR | new row, old revoked with note |
| POST | `/api/press-card/[id]/revoke` | ADMIN / EDITOR | sets REVOKED + note |
| PATCH | `/api/users/[id]` (existing) | ADMIN | accepts `lastWorkingDate`, `joinedAt` |

Owner check for the PDF: `card.userId === session.user.id`. Reporters can never list or fetch other cards. Follows the existing auth helpers used by `/reporter/*` routes.

## 7. Migration of the five v1 cards

One-off script `packages/db/scripts/link-press-cards-to-users.ts`: for each card without `userId`, match by exact `User.name`; print unmatched for admin to link in the UI (user detail panel shows "Link existing card RSN/2026/00N" when a card with the same name is unlinked). After all five are linked, the JSON seed step is removed from `deploy.yml` and `press-cards.json` is deleted; the DB is the only source of truth. Tokens and card numbers do not change, so printed cards keep working.

## 8. Error handling

- Issue when KYC not VERIFIED or photo missing → 409 with a human message; UI shows it inline.
- PDF render failure (Chromium crash, photo fetch timeout) → one retry, then 503 with "try again"; logged with card id.
- Download by a SEPARATED or REVOKED holder → 403 with status explanation; admin download still allowed (for records).
- Concurrent issue for the same user → the issue transaction re-checks for an existing ACTIVE card and the `cardNo` unique constraint catches a duplicate number; the second call gets 409.

## 9. Testing

- Unit (`bun test packages/db`): status precedence incl. SEPARATED; card number sequencing (year rollover, gap tolerance); token shape.
- Route tests in admin: auth matrix (reporter own / other / admin) for the PDF endpoint; issue blocked without KYC.
- Manual before merge: issue card for one real user → download → scan QR with a phone → verify page ACTIVE; set last working date → verify page FORMER STAFF; renew → old QR shows REVOKED, new QR ACTIVE.
- Pixel check: render RSN/2026/001 through the new template and compare against the v1 PNG.

## 10. Out of scope

- Bulk A4 print sheets from the admin (keep the Python script for print shops).
- NFC / wallet passes.
- Automatic face crop of uploaded photos.
- Reader app (public app) changes.
- Admin revoke emails / WhatsApp notifications.

## 11. Decisions (owner, 2026-10-15)

1. Validity: one year from the issue date (validTill = validFrom + 1 year − 1 day).
2. ADMIN and EDITOR can both issue, renew and revoke.
3. Renew rotates the token: new row, new QR, old row REVOKED with note "renewed". A renewed card must be reprinted.
