// One-shot diagnostic: prints (a) the most recent user-related audit-log
// entries and (b) the full User table so we can correlate "I clicked Delete"
// against what the server actually did. Used to answer "I deleted that user,
// why is the email still rejected by create?" investigations.
import { prisma } from "../src/index";

async function main() {
  console.log("\n=== Recent user-related audit log (last 30) ===\n");
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { resource: "user" },
        { action: { startsWith: "user." } },
        { action: { startsWith: "auth." } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      createdAt: true,
      action: true,
      actorEmail: true,
      resourceId: true,
      meta: true,
    },
  });

  for (const l of logs) {
    const when = l.createdAt.toISOString().replace("T", " ").slice(0, 19);
    const actor = (l.actorEmail || "system").padEnd(30);
    const action = String(l.action).padEnd(28);
    const target = (l.resourceId || "-").slice(-8).padEnd(10);
    const meta = l.meta ? JSON.stringify(l.meta).slice(0, 80) : "";
    console.log(`${when} | ${actor} | ${action} | ${target} | ${meta}`);
  }
  if (logs.length === 0) console.log("(none)");

  console.log("\n=== All users (sorted by creation, newest first) ===\n");
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      createdAt: true,
      _count: { select: { contents: true, contentPayments: true } },
    },
  });
  for (const u of users) {
    const when = u.createdAt.toISOString().slice(0, 10);
    const flag = u.active ? "active  " : "INACTIVE";
    console.log(
      `${when} | ${flag} | ${String(u.role).padEnd(11)} | ${u.email.padEnd(40)} | ${u.name || ""} | id=${u.id.slice(-8)} | content=${u._count.contents} pay=${u._count.contentPayments}`,
    );
  }
  console.log(`\nTotal users: ${users.length}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
