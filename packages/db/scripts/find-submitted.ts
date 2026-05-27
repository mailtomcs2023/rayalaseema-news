import { prisma } from "../src/index";

async function main() {
  console.log("--- Article table ---");
  const arts = await prisma.article.findMany({
    where: { status: "SUBMITTED" },
    select: {
      id: true, title: true, categoryId: true,
      category: { select: { name: true, nameEn: true } },
      author: { select: { name: true, email: true } },
      createdAt: true,
    },
  });
  console.log(`${arts.length} SUBMITTED in Article`);
  for (const a of arts) {
    console.log(`  ${a.title.slice(0, 60)}  cat=${a.category?.nameEn}  by=${a.author.name}`);
  }

  console.log("\n--- Content table (type=ARTICLE) ---");
  const cs = await prisma.content.findMany({
    where: { type: "ARTICLE", status: "SUBMITTED" },
    select: {
      id: true, title: true, categoryId: true,
      category: { select: { name: true, nameEn: true } },
      author: { select: { name: true, email: true } },
      createdAt: true,
    },
  });
  console.log(`${cs.length} SUBMITTED in Content`);
  for (const c of cs) {
    console.log(`  ${c.title.slice(0, 60)}  cat=${c.category?.nameEn}  by=${c.author.name}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
