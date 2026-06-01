/**
 * Idempotent seed for one test account per role so the four-role flow
 * (Admin / Editor / Sub Editor / Reporter) can be tested end-to-end.
 *
 * - Upserts users by email
 * - Resets the password to the documented value every run
 * - For the reporter, creates a VERIFIED JournalistProfile so all gated
 *   features (submit article, view earnings) are unlocked
 *
 * Run with:  bun run packages/db/scripts/seed-test-users.ts
 */
import { hash } from "bcryptjs";
import { prisma } from "../src/index";

interface Seed {
  email: string;
  password: string;
  name: string;
  role: "ADMIN" | "EDITOR" | "SUB_EDITOR" | "REPORTER";
}

const SEEDS: Seed[] = [
  { email: "admin@rayalaseemanews.com",      password: "admin123",      name: "Admin",      role: "ADMIN" },
  { email: "editor@rayalaseemanews.com",     password: "editor123",     name: "Editor",     role: "EDITOR" },
  { email: "subeditor@rayalaseemanews.com",  password: "subeditor123",  name: "Sub Editor", role: "SUB_EDITOR" },
  { email: "reporter@rayalaseemanews.com",   password: "reporter123",   name: "Reporter",   role: "REPORTER" },
];

async function main() {
  for (const s of SEEDS) {
    const passwordHash = await hash(s.password, 10);

    // Don't overwrite the display name on existing rows — those addresses
    // may already point at named accounts (e.g. "Rajesh Kumar"). The seed
    // is about role + password, not identity.
    const user = await prisma.user.upsert({
      where: { email: s.email },
      update: { passwordHash, role: s.role, active: true },
      create: {
        email: s.email,
        passwordHash,
        name: s.name,
        role: s.role,
        active: true,
      },
      select: { id: true, email: true, role: true, name: true },
    });

    // The reporter needs a VERIFIED JournalistProfile to bypass the KYC gate
    // on /reporter/articles/new and the locked-earnings state.
    if (user.role === "REPORTER") {
      await prisma.journalistProfile.upsert({
        where: { userId: user.id },
        update: { kycStatus: "VERIFIED", kycRejectionNote: null },
        create: {
          userId: user.id,
          fullName: s.name,
          kycStatus: "VERIFIED",
        },
      });
    }

    // Sub editors are scoped to a list of categories via UserCategory. With
    // no assignments, their review queue is empty even when articles exist —
    // counts and list both filter by `categoryId IN <empty set>`. Seed every
    // active category so the test sub editor can review across the board.
    if (user.role === "SUB_EDITOR") {
      const categories = await prisma.category.findMany({
        where: { active: true },
        select: { id: true },
      });
      // Wipe-and-replace so re-running the seed gives a clean, complete set.
      await prisma.userCategory.deleteMany({ where: { userId: user.id } });
      if (categories.length > 0) {
        await prisma.userCategory.createMany({
          data: categories.map((c) => ({ userId: user.id, categoryId: c.id })),
          skipDuplicates: true,
        });
      }
    }

    console.log(`  ✓ ${s.role.padEnd(11)} | ${s.email.padEnd(28)} | password: ${s.password}`);
  }

  console.log("\nDone. Log in at http://localhost:3001/login");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
