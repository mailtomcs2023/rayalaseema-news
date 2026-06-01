import { prisma } from "@rayalaseema/db";

/**
 * Auto-pick the byline desk for an article based on its metadata.
 *
 * Fallback chain (first match wins):
 *   1. Explicit `deskId` (verified to exist)
 *   2. Desk linked to the article's `constituencyId`        → e.g. "ప్రొద్దుటూరు"
 *   3. Desk linked to the constituency's parent district    → e.g. "కర్నూలు"
 *   4. Desk linked to the article's `categoryId`            → e.g. "రాయలసీమ న్యూస్ బిజినెస్ డెస్క్"
 *   5. Root "Rayalaseema News" geographic desk
 *
 * Returns `null` only if the Desk table is empty (i.e. seed never ran).
 */
export async function resolveDeskId(input: {
  deskId?: string | null;
  categoryId?: string | null;
  constituencyId?: string | null;
}): Promise<string | null> {
  // 1. Explicit override
  if (input.deskId) {
    const exists = await prisma.desk.findUnique({ where: { id: input.deskId }, select: { id: true } });
    if (exists) return exists.id;
  }

  // 2. Constituency desk
  if (input.constituencyId) {
    const ac = await prisma.constituency.findUnique({
      where: { id: input.constituencyId },
      select: { id: true, districtId: true, desk: { select: { id: true } } },
    });
    if (ac?.desk?.id) return ac.desk.id;

    // 3. District desk (parent of the constituency)
    if (ac?.districtId) {
      const districtDesk = await prisma.desk.findFirst({
        where: { districtId: ac.districtId },
        select: { id: true },
      });
      if (districtDesk) return districtDesk.id;
    }
  }

  // 4. Topical desk from category
  if (input.categoryId) {
    const topical = await prisma.desk.findFirst({
      where: { categoryId: input.categoryId },
      select: { id: true },
    });
    if (topical) return topical.id;
  }

  // 5. Root
  const root = await prisma.desk.findUnique({ where: { slug: "desk-rayalaseema-news" }, select: { id: true } });
  return root?.id ?? null;
}
