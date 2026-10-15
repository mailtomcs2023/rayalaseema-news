// Sets User.joinedAt = createdAt for rows that have no joinedAt. Idempotent;
// wired into deploy.yml after `prisma db push`.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const rows = await prisma.user.findMany({ where: { joinedAt: null }, select: { id: true, createdAt: true } });
  for (const r of rows) await prisma.user.update({ where: { id: r.id }, data: { joinedAt: r.createdAt } });
  console.log(`joinedAt backfilled for ${rows.length} users`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
