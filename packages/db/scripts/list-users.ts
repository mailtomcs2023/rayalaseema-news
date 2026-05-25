import { prisma } from "../src/index";

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, active: true },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  for (const u of users) {
    console.log(
      `${String(u.role).padEnd(12)} | ${u.active ? "active  " : "inactive"} | ${u.email.padEnd(40)} | ${u.name || ""}`,
    );
  }
  console.log(`\nTotal: ${users.length}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
