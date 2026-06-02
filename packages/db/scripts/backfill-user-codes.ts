// One-shot (idempotent): give every user a branded login code in the
// current format `RN<RoleLetter><5 digits>`. Re-issues codes that are
// either null OR don't match the format (e.g. the legacy 6-digit values
// from the first iteration of this feature).
//
// Safe to re-run on every deploy - users with an already-valid code are
// untouched.
//
// Run from packages/db:  bunx tsx scripts/backfill-user-codes.ts

import { prisma } from "../src/index";

const NUMERIC_TOTAL = 100_000;
const BRAND = "RN";
const VALID_RE = /^RN[AESRU]\d{5}$/;

const BANNED_NUMERIC = new Set<string>([
  "00000", "11111", "22222", "33333", "44444",
  "55555", "66666", "77777", "88888", "99999",
  "01234", "12345", "23456", "34567", "45678", "56789",
  "98765", "87654", "76543", "65432", "54321", "43210",
]);

function roleLetter(role: string): string {
  switch (role) {
    case "ADMIN":      return "A";
    case "EDITOR":     return "E";
    case "SUB_EDITOR": return "S";
    case "REPORTER":   return "R";
    case "USER":       return "U";
    default:           return "U";
  }
}

function randomNumeric(): string {
  return Math.floor(Math.random() * NUMERIC_TOTAL).toString().padStart(5, "0");
}

function acceptable(numeric: string): boolean {
  return /^\d{5}$/.test(numeric) && !BANNED_NUMERIC.has(numeric);
}

async function generateOne(role: string, taken: Set<string>): Promise<string> {
  const prefix = `${BRAND}${roleLetter(role)}`;
  for (let i = 0; i < 50; i++) {
    const numeric = randomNumeric();
    if (!acceptable(numeric)) continue;
    const candidate = `${prefix}${numeric}`;
    if (taken.has(candidate)) continue;
    // Final DB check in case another process minted the same value mid-run.
    const existing = await prisma.user.findUnique({
      where: { userCode: candidate },
      select: { id: true },
    });
    if (existing) continue;
    taken.add(candidate);
    return candidate;
  }
  throw new Error(`Could not generate a unique user code for role ${role} after 50 attempts`);
}

async function main() {
  console.log("=== Backfill user codes (RNA-style format) ===");

  // Seed the taken-set with every already-valid code so we don't collide
  // against the rows we're keeping.
  const validRows = await prisma.user.findMany({
    where: { userCode: { not: null } },
    select: { userCode: true },
  });
  const taken = new Set<string>(
    validRows.map((r) => r.userCode!).filter((c) => VALID_RE.test(c)),
  );
  console.log(`${taken.size} user(s) already have a code in the current format.`);

  // Pull EVERY user; we'll filter to those needing a re-issue in JS so the
  // "old-format" check stays in one place rather than splitting it across
  // a where clause + the validator.
  const all = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, userCode: true },
  });
  const targets = all.filter((u) => !u.userCode || !VALID_RE.test(u.userCode));
  console.log(`${targets.length} user(s) need a code (null or stale format).`);

  if (targets.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let done = 0;
  for (const u of targets) {
    const code = await generateOne(u.role, taken);
    await prisma.user.update({ where: { id: u.id }, data: { userCode: code } });
    done++;
    const was = u.userCode ? ` (was ${u.userCode})` : "";
    console.log(`  [${done}/${targets.length}] ${u.role.padEnd(11)} ${u.email} → ${code}${was}`);
  }

  console.log(`Done. Issued ${done} code(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
