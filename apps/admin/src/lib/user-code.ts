// Server-side login-code generator. Uses Prisma for the uniqueness check,
// so this file MUST NOT be imported from a client component - it would
// drag the Prisma client into the browser bundle and crash on a
// generated-enum lookup at module evaluation time. For pure formatting /
// validation helpers usable from anywhere (client or server) import from
// lib/user-code-format.ts instead.

import { prisma } from "@rayalaseema/db";
import { roleLetter, BRAND } from "./user-code-format";

const NUMERIC_TOTAL = 100_000; // 00000..99999

// Banned 5-digit patterns - keeps the issued codes feeling random and
// avoids embarrassing-looking strings like "RNA-00000" or "RNS-12345".
const BANNED_NUMERIC = new Set<string>([
  "00000", "11111", "22222", "33333", "44444",
  "55555", "66666", "77777", "88888", "99999",
  "01234", "12345", "23456", "34567", "45678", "56789",
  "98765", "87654", "76543", "65432", "54321", "43210",
]);

function randomNumericBlock(): string {
  return Math.floor(Math.random() * NUMERIC_TOTAL).toString().padStart(5, "0");
}

function isAcceptableNumeric(n: string): boolean {
  return /^\d{5}$/.test(n) && !BANNED_NUMERIC.has(n);
}

/**
 * Returns a code for the given role that is not currently taken in the users
 * table. Format: `RN<RoleLetter><5 digits>` e.g. "RNA12345". Throws after
 * 8 attempts so a runaway loop can't hang a request.
 */
export async function generateUniqueUserCode(role: string | null | undefined): Promise<string> {
  const prefix = `${BRAND}${roleLetter(role)}`;
  for (let attempt = 0; attempt < 8; attempt++) {
    const numeric = randomNumericBlock();
    if (!isAcceptableNumeric(numeric)) continue;
    const candidate = `${prefix}${numeric}`;
    const existing = await prisma.user.findUnique({
      where: { userCode: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique user code after 8 attempts");
}

// Re-export the format helpers so existing server-side callers that already
// import from "@/lib/user-code" keep working without churn. New code should
// pull these straight from "@/lib/user-code-format" instead.
export { roleLetter, isValidCodeFormat, normalizeCode, formatUserCode } from "./user-code-format";
