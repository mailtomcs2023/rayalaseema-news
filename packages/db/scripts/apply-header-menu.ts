// Apply the HEADER menu (with the district -> constituency secondary sub-nav)
// from prisma/header-menu.json to whatever DB this points at. Use it to push the
// menu you built in the admin Menu Builder locally onto PRODUCTION, since
// seed-menus is skip-if-exists (it never overwrites a prod menu).
//
// Idempotent: re-running just re-applies the same menu. It overwrites ONLY the
// HEADER menu's items/draftItems - nothing else in the DB is touched.
//
//   cd packages/db && bunx tsx scripts/apply-header-menu.ts
//
// To refresh the JSON from your local DB later, re-export it (see README/commit
// message) and re-run this.

import { PrismaClient, MenuLocation } from "@prisma/client";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const prisma = new PrismaClient();

async function main() {
  const dataPath = join(dirname(fileURLToPath(import.meta.url)), "../prisma/header-menu.json");
  const items = JSON.parse(readFileSync(dataPath, "utf8"));
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("prisma/header-menu.json is empty or invalid.");
  }

  const withChildren = items.filter((i: any) => Array.isArray(i?.children) && i.children.length).length;

  const menu = await prisma.menu.upsert({
    where: { location: MenuLocation.HEADER },
    create: { location: MenuLocation.HEADER, name: "Header menu", items, draftItems: items, isPublished: true },
    // Set both the published items AND the draft so the admin editor matches
    // the live site (no dangling "unpublished draft" state).
    update: { items, draftItems: items, isPublished: true },
  });

  console.log(`✓ HEADER menu applied (menu ${menu.id}): ${items.length} top items, ${withChildren} with a constituency sub-nav. Published.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
