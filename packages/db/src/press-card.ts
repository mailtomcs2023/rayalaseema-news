// Press ID card verification helpers (pure, no Prisma import so the web app
// and tests can use them without a DB).
//
// The public /verify/<token> page shows exactly one of three states:
//   ACTIVE  - stored status ACTIVE and today is within [validFrom, validTill]
//   EXPIRED - stored status ACTIVE but outside the window (validTill is an
//             inclusive calendar day; a card printed "Valid Till 05-10-2027"
//             must still verify at 23:59 that day)
//   REVOKED - stored status REVOKED; always wins, regardless of dates
// Only REVOKED is persisted. EXPIRED is derived at request time so no cron
// has to flip rows and a renewed validTill re-activates the card instantly.

export type PressCardLiveStatus = "ACTIVE" | "EXPIRED" | "REVOKED";

export interface PressCardStatusInput {
  status: "ACTIVE" | "REVOKED";
  revokedAt?: Date | null;
  validFrom: Date;
  validTill: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function computePressCardStatus(card: PressCardStatusInput, now: Date = new Date()): PressCardLiveStatus {
  if (card.status === "REVOKED" || card.revokedAt) return "REVOKED";
  const t = now.getTime();
  // validTill is stored as a date (midnight UTC); treat the whole day as valid.
  const tillEnd = Math.floor(card.validTill.getTime() / DAY_MS) * DAY_MS + DAY_MS;
  if (t < card.validFrom.getTime() || t >= tillEnd) return "EXPIRED";
  return "ACTIVE";
}

// Tokens are 12 chars from an unambiguous lowercase alphabet (no 0/o/1/l/i).
// Validating the shape before the DB lookup keeps junk and path-trick URLs
// from ever reaching Prisma.
const TOKEN_RE = /^[a-z0-9]{12}$/;
export function isValidPressCardToken(token: string): boolean {
  return TOKEN_RE.test(token);
}
