// Web helpers for the admin-editable menus (Spec #3 E1 #183).
//
// Pages render Header / Footer / MobileMenu as server components and pass the
// fetched items array down as props. The menu items follow the shape Zod-
// validated by packages/db/src/menu-schemas.ts. resolveItemHref turns a target
// into the href the renderer puts on the <a>.
import { unstable_cache } from "next/cache";
import { prisma, MenuLocation, resolveItemHref, type MenuItem } from "@rayalaseema/db";

// Cached behind tag "menu" so admin publish (revalidateTag("menu")) busts it
// instantly. 60s TTL is enough for the cold-cache path; everything else hits
// the in-memory cache.
async function getMenuImpl(location: MenuLocation): Promise<MenuItem[]> {
  const menu = await prisma.menu.findUnique({ where: { location } });
  if (!menu || !menu.isPublished) return [];
  return (menu.items as unknown as MenuItem[]) ?? [];
}

const getHeader = unstable_cache(() => getMenuImpl(MenuLocation.HEADER), ["menu-header"], {
  revalidate: 60,
  tags: ["menu"],
});
const getFooter = unstable_cache(() => getMenuImpl(MenuLocation.FOOTER), ["menu-footer"], {
  revalidate: 60,
  tags: ["menu"],
});
const getMobile = unstable_cache(() => getMenuImpl(MenuLocation.MOBILE), ["menu-mobile"], {
  revalidate: 60,
  tags: ["menu"],
});

export async function getMenuItems(location: "HEADER" | "FOOTER" | "MOBILE"): Promise<MenuItem[]> {
  switch (location) {
    case "HEADER": return getHeader();
    case "FOOTER": return getFooter();
    case "MOBILE": return getMobile();
  }
}

export { resolveItemHref };
export type { MenuItem };
