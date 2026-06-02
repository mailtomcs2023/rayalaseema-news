// Pure helpers for the 8-character branded login code (RN<role><5 digits>).
// Lives in its own file because the generator in lib/user-code.ts imports
// the Prisma client, and that import chain pulls in Prisma-generated enums
// that crash when evaluated in the browser bundle. Anything a client
// component needs to do with the code (format, normalize, role letter
// lookup) should come from THIS file, not user-code.ts.

const BRAND = "RN";
const CODE_RE = /^RN[AESRU]-?\d{5}$/i;

export type CodedRole = "ADMIN" | "EDITOR" | "SUB_EDITOR" | "REPORTER" | "USER";

export function roleLetter(role: string | null | undefined): string {
  switch (role) {
    case "ADMIN":      return "A";
    case "EDITOR":     return "E";
    case "SUB_EDITOR": return "S";
    case "REPORTER":   return "R";
    case "USER":       return "U";
    default:           return "U";
  }
}

export function isValidCodeFormat(code: string): boolean {
  return CODE_RE.test(code);
}

// Strip the optional dash and uppercase the alphabetic prefix so callers
// can compare against the stored form. Returns null if the input doesn't
// match the format.
export function normalizeCode(code: string): string | null {
  const trimmed = code.trim();
  if (!CODE_RE.test(trimmed)) return null;
  return trimmed.replace(/-/g, "").toUpperCase();
}

// "RNA12345" → "RNA-12345". Returns "" on invalid / null so callers can
// truthiness-check.
export function formatUserCode(code: string | null | undefined): string {
  if (!code || !CODE_RE.test(code)) return "";
  const compact = code.replace(/-/g, "").toUpperCase();
  return `${compact.slice(0, 3)}-${compact.slice(3)}`;
}

export { BRAND };
