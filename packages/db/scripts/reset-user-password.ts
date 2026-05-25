// One-shot user diagnostics + password reset.
//   EMAIL=user@x.com PASSWORD=newpass bunx tsx scripts/reset-user-password.ts
//
// Behaviour:
//   1. Look up user by exact email.
//   2. If found: hash PASSWORD with bcrypt + update passwordHash + active=true +
//      mustChangePassword=false. Print before/after.
//   3. If not found: list any users with a similar email (substring match
//      on the local part) so we can tell typos apart from missing rows.
import { prisma } from "../src/index";
import { hash } from "bcryptjs";

async function main() {
  const email = process.env.EMAIL?.trim();
  const password = process.env.PASSWORD;
  if (!email || !password) {
    console.error("EMAIL and PASSWORD env vars required");
    process.exit(1);
  }

  const found = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true, active: true, mustChangePassword: true, createdAt: true },
  });

  if (!found) {
    console.log(`No user with email "${email}".`);
    const localPart = email.split("@")[0];
    if (localPart) {
      const similar = await prisma.user.findMany({
        where: { email: { contains: localPart, mode: "insensitive" } },
        select: { email: true, role: true, active: true },
      });
      if (similar.length) {
        console.log(`\nSimilar emails found (${similar.length}):`);
        for (const u of similar) console.log(`  ${u.email}  role=${u.role}  active=${u.active}`);
      } else {
        console.log("No similar emails either.");
      }
    }
    return;
  }

  console.log("BEFORE:", JSON.stringify(found, null, 2));

  const hashed = await hash(password, 12);
  const updated = await prisma.user.update({
    where: { id: found.id },
    data: { passwordHash: hashed, active: true, mustChangePassword: false },
    select: { id: true, email: true, name: true, role: true, active: true, mustChangePassword: true },
  });
  console.log("\nAFTER:", JSON.stringify(updated, null, 2));
  console.log(`\nDone. ${email} can now sign in with the supplied password.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
