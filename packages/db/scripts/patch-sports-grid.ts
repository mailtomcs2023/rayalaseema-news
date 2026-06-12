// One-off: bump the homepage Sports (క్రీడలు) SectionBand to 6 grid articles +
// 5 trending. upsertTemplate in seed-templates.ts skips existing templates, so
// the already-seeded "default-homepage" layout never picked up the new config.
// This patches the live row in place (idempotent).
//
//   Run via: bunx tsx packages/db/scripts/patch-sports-grid.ts

import { prisma } from "../src";

async function main() {
  const tpl = await prisma.template.findUnique({ where: { slug: "default-homepage" } });
  if (!tpl) {
    console.error('No "default-homepage" template found - run seed-templates first.');
    process.exit(1);
  }

  const layout = tpl.layout as any;
  let patched = 0;
  for (const block of layout?.blocks ?? []) {
    if (block?.type === "SectionBand" && block?.config?.categorySlug === "sports") {
      block.config.gridCount = 6;
      block.config.trendingCount = 5;
      patched++;
    }
  }

  if (!patched) {
    console.log("No Sports SectionBand block found in the homepage layout - nothing to do.");
    return;
  }

  await prisma.template.update({
    where: { id: tpl.id },
    data: { layout: layout as object },
  });
  console.log(`✓ Patched ${patched} Sports SectionBand block(s) → gridCount 6, trendingCount 5.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
