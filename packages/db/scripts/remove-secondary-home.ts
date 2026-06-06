// Remove the redundant "హోం" item from each district's secondary header. The
// home item is the child whose INTERNAL_URL equals the parent district's own
// URL (e.g. /kurnool under the /kurnool item). District news is reached via the
// main header tab; the secondary header is constituencies only (filter on click).
// Updates both draftItems and published items. Idempotent.
//   bunx tsx scripts/remove-secondary-home.ts            (dry run)
//   bunx tsx scripts/remove-secondary-home.ts --apply
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function stripHome(items: any[]): { items: any[]; removed: number } {
  let removed = 0;
  const out = items.map((top) => {
    if (!Array.isArray(top.children) || !top.children.length) return top;
    const parentUrl = top.target?.type === "INTERNAL_URL" ? top.target.url : null;
    if (!parentUrl) return top;
    const kept = top.children.filter((c: any) => {
      const isHome = c.target?.type === "INTERNAL_URL" && c.target.url === parentUrl;
      if (isHome) removed++;
      return !isHome;
    });
    return { ...top, children: kept };
  });
  return { items: out, removed };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const menu = await prisma.menu.findUnique({ where: { location: "HEADER" } });
  if (!menu) { console.error("no HEADER menu"); process.exit(1); }

  const published = stripHome((menu.items ?? []) as any[]);
  const draft = menu.draftItems ? stripHome(menu.draftItems as any[]) : { items: null, removed: 0 };

  console.log(`Home items to remove → published: ${published.removed}, draft: ${draft.removed}`);
  if (!apply) { console.log("DRY RUN - re-run with --apply.\n"); return; }

  await prisma.menu.update({
    where: { location: "HEADER" },
    data: {
      items: published.items as any,
      ...(draft.items ? { draftItems: draft.items as any } : {}),
      isPublished: true,
      publishedAt: new Date(),
    },
  });
  console.log("Updated + published. Hard-refresh after ~15s.\n");
}

main().catch((e) => console.error(String(e))).finally(() => prisma.$disconnect());
