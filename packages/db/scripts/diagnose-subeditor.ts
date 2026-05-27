import { prisma } from "../src/index";

async function main() {
  // Find the test sub-editor account.
  const sub = await prisma.user.findFirst({
    where: { role: "SUB_EDITOR" },
    select: { id: true, email: true, name: true },
  });
  if (!sub) {
    console.log("No SUB_EDITOR user found.");
    return;
  }
  console.log(`Sub editor: ${sub.name} <${sub.email}>  id=${sub.id}`);

  // Their category assignments.
  const assignments = await prisma.userCategory.findMany({
    where: { userId: sub.id },
    include: { category: { select: { name: true, nameEn: true, slug: true } } },
  });
  console.log(`\nAssigned to ${assignments.length} categories:`);
  for (const a of assignments) {
    console.log(`  - ${a.category.nameEn ?? a.category.name} (${a.category.slug})  catId=${a.categoryId}`);
  }

  // Currently SUBMITTED content in the system (the review queue's source).
  const submitted = await prisma.content.findMany({
    where: { type: "ARTICLE", status: "SUBMITTED" },
    select: {
      id: true,
      title: true,
      categoryId: true,
      category: { select: { name: true, nameEn: true, slug: true } },
    },
  });
  console.log(`\n${submitted.length} SUBMITTED article(s) in the DB:`);
  for (const c of submitted) {
    const assignedToThis = assignments.some((a) => a.categoryId === c.categoryId);
    const tick = assignedToThis ? "✓" : "✗";
    console.log(
      `  ${tick} ${c.title.slice(0, 50)}  → ${c.category?.nameEn ?? c.category?.name ?? "(none)"}  catId=${c.categoryId ?? "null"}`,
    );
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
