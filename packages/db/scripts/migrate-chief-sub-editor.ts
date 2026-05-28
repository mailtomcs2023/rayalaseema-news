// One-shot data migration: collapse the legacy CHIEF_SUB_EDITOR role into
// EDITOR. The schema enum still carries CHIEF_SUB_EDITOR while this script
// runs — once every row has been migrated, schema.prisma drops the value
// and `bunx prisma db push` succeeds.
//
// MUST run BEFORE the schema is updated to remove the enum value, otherwise
// any remaining rows would block `prisma db push` with an invalid-enum
// error. The deploy workflow runs this script immediately before
// `prisma db push` for exactly that reason.
//
// Idempotent — re-running is a no-op once everyone is on EDITOR.
//
// Run from packages/db:  bunx tsx scripts/migrate-chief-sub-editor.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Migrate CHIEF_SUB_EDITOR → EDITOR ===");

  // Raw SQL because the regenerated Prisma client may not know about
  // CHIEF_SUB_EDITOR once schema.prisma drops it. Going through executeRaw
  // bypasses the typed enum and talks straight to the DB enum, which still
  // has the legacy value until the next `prisma db push`.
  const affected = await prisma.$executeRawUnsafe(
    `UPDATE users SET role = 'EDITOR' WHERE role = 'CHIEF_SUB_EDITOR'`,
  );

  if (affected === 0) {
    console.log("No rows on CHIEF_SUB_EDITOR — already migrated.");
  } else {
    console.log(`Moved ${affected} user${affected === 1 ? "" : "s"} from CHIEF_SUB_EDITOR → EDITOR.`);
  }

  // Sanity check — confirm zero rows remain on the legacy value.
  const remaining = (await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count FROM users WHERE role = 'CHIEF_SUB_EDITOR'`,
  ))[0]?.count ?? BigInt(0);
  if (Number(remaining) !== 0) {
    throw new Error(`Migration verification failed — ${remaining} CHIEF_SUB_EDITOR row(s) still present`);
  }
  console.log("Verified: 0 CHIEF_SUB_EDITOR rows remain.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
