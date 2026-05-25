import { prisma } from "../src/index";

async function main() {
  const districts = await prisma.district.findMany({ include: { constituencies: true } });
  const articles = await prisma.content.findMany({
    where: { type: "ARTICLE", constituencyId: null, status: "PUBLISHED" },
    select: { id: true, title: true, summary: true },
  });

  console.log(`Districts: ${districts.length}, Untagged articles: ${articles.length}`);

  let tagged = 0;
  for (const a of articles) {
    const text = a.title + " " + (a.summary || "");
    for (const d of districts) {
      const match =
        text.toLowerCase().includes(d.nameEn.toLowerCase()) ||
        text.includes(d.name);
      if (match && d.constituencies[0]) {
        await prisma.content.update({
          where: { id: a.id },
          data: { constituencyId: d.constituencies[0].id },
        });
        tagged++;
        console.log(`  ${d.nameEn}: ${a.title.substring(0, 60)}`);
        break;
      }
    }
  }
  console.log(`\nTagged ${tagged} / ${articles.length} articles`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
