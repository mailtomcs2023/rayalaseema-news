// Press ID card verification helpers (pure, no Prisma import so the web app
// and tests can use them without a DB).
//
// The public /verify/<token> page shows exactly one of four states:
//   ACTIVE    - stored status ACTIVE, holder not separated, today is within
//               [validFrom, validTill]
//   EXPIRED   - stored status ACTIVE but outside the window (validTill is an
//               inclusive calendar day; a card printed "Valid Till 05-10-2027"
//               must still verify at 23:59 that day)
//   SEPARATED - holder's lastWorkingDate has passed (no longer staff), even
//               if the card is otherwise within its validity window
//   REVOKED   - stored status REVOKED; always wins, regardless of dates
// Only REVOKED is persisted. EXPIRED/SEPARATED are derived at request time so
// no cron has to flip rows and a renewed validTill re-activates the card
// instantly.

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

// Tokens are 12 chars from an unambiguous lowercase alphabet (no 0/o/1/l/i).
// Validating the shape before the DB lookup keeps junk and path-trick URLs
// from ever reaching Prisma.
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
  // Date.UTC's own overflow handles the leap-day case: Feb 29 + 1y rolls to
  // Mar 1 (next year has no Feb 29), and subtracting a day lands on Feb 28.
  const d = new Date(Date.UTC(validFrom.getUTCFullYear() + 1, validFrom.getUTCMonth(), validFrom.getUTCDate()));
  return new Date(d.getTime() - DAY_MS);
}
