import { prisma } from "../src/index";

async function main() {
  // Find articles authored by "Medha Cloud" in Content table (across all statuses).
  const cs = await prisma.content.findMany({
    where: { type: "ARTICLE", author: { name: { contains: "Medha", mode: "insensitive" } } },
    select: {
      id: true, title: true, status: true,
      category: { select: { nameEn: true } },
      author: { select: { name: true, email: true } },
      createdAt: true,
    },
  });
  console.log(`Content rows by Medha*: ${cs.length}`);
  for (const c of cs) {
    console.log(`  [${c.status}] ${c.title.slice(0, 50)}  cat=${c.category?.nameEn}  by=${c.author.name}`);
  }

  // Also check Article table.
  const arts = await prisma.article.findMany({
    where: { author: { name: { contains: "Medha", mode: "insensitive" } } },
    select: {
      id: true, title: true, status: true,
      category: { select: { nameEn: true } },
      author: { select: { name: true } },
    },
  });
  console.log(`\nArticle rows by Medha*: ${arts.length}`);
  for (const a of arts) {
    console.log(`  [${a.status}] ${a.title.slice(0, 50)}  cat=${a.category?.nameEn}  by=${a.author.name}`);
  }

  // Count articles across all statuses to confirm DB state.
  const byStatus = await prisma.content.groupBy({
    by: ["status"],
    where: { type: "ARTICLE" },
    _count: true,
  });
  console.log(`\nContent (type=ARTICLE) counts by status:`);
  for (const r of byStatus) console.log(`  ${r.status}: ${r._count}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
