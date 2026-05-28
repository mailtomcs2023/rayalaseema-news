// One-shot data migration: encrypt every existing plaintext value in
// aadhaarNumber / panNumber / bankAccount across ReporterProfile.
//
// Idempotent: rows already in the "kyc1:..." encrypted format are skipped,
// so it's safe to re-run after a partial failure or as a deploy step on
// every release until you're confident every row is encrypted.
//
// Usage:
//   bun run --cwd packages/db packages/db/scripts/encrypt-kyc-backfill.ts
//
// Requires KYC_ENCRYPTION_KEY in the env (same one the app uses).
// Exits non-zero on the first row that fails to encrypt - so you notice
// before the rest of the table partial-migrates.

import { PrismaClient } from "@prisma/client";
import { encrypt, isEncrypted } from "../../../apps/admin/src/lib/crypto/kyc";

const prisma = new PrismaClient();

const FIELDS = ["aadhaarNumber", "panNumber", "bankAccount"] as const;

async function main() {
  console.log("=== KYC field encryption backfill ===");

  // Fetch only rows where AT LEAST ONE of the three fields is non-null.
  // Already-encrypted rows are filtered out at the per-row level below so
  // we don't have to encode the prefix check in SQL.
  const profiles = await prisma.reporterProfile.findMany({
    where: {
      OR: [
        { aadhaarNumber: { not: null } },
        { panNumber: { not: null } },
        { bankAccount: { not: null } },
      ],
    },
    select: {
      id: true,
      aadhaarNumber: true,
      panNumber: true,
      bankAccount: true,
    },
  });

  console.log(`Scanning ${profiles.length} profile(s) with at least one KYC value…`);

  let touched = 0;
  let skipped = 0;
  let failed = 0;

  for (const p of profiles) {
    const update: Record<string, string | null> = {};

    for (const field of FIELDS) {
      const v = (p as any)[field] as string | null;
      if (v == null || v === "") continue;
      if (isEncrypted(v)) {
        // Already encrypted from a prior run - leave alone.
        continue;
      }
      try {
        update[field] = encrypt(v);
      } catch (e) {
        console.error(`  ✗ profile ${p.id} field ${field}: encrypt failed`, e);
        failed++;
      }
    }

    if (Object.keys(update).length === 0) {
      skipped++;
      continue;
    }

    try {
      await prisma.reporterProfile.update({
        where: { id: p.id },
        data: update,
      });
      touched++;
      console.log(`  ✓ encrypted ${Object.keys(update).join(", ")} on profile ${p.id}`);
    } catch (e) {
      console.error(`  ✗ profile ${p.id}: DB update failed`, e);
      failed++;
    }
  }

  console.log("---");
  console.log(`Done. Encrypted: ${touched}, skipped (already done): ${skipped}, failed: ${failed}.`);

  if (failed > 0) {
    console.error("Some rows failed - investigate above. Re-run after fixing; the script is idempotent.");
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error("Backfill aborted:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
