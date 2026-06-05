// /menu-builder/[location] - three locations served by the same editor:
//   /menu-builder/header  /menu-builder/footer  /menu-builder/mobile
//
// Spec #3 B1 #177 + C1-C3 #178-#180. Server component picks the right
// location enum value, then hands off to the client tree editor.
import { redirect, notFound } from "next/navigation";
import { prisma, MenuLocation } from "@rayalaseema/db";
import { auth } from "@/lib/auth";
import { MenuTreeEditor } from "@/components/menu-tree-editor";
import { normalizeMenuTreeUrls } from "@/components/menu-normalize";

export const dynamic = "force-dynamic";

const LOCATION_LABELS: Record<string, string> = {
  header: "Header menu",
  footer: "Footer menu",
  mobile: "Mobile menu",
};

function parseLocation(slug: string): MenuLocation | null {
  switch (slug) {
    case "header": return MenuLocation.HEADER;
    case "footer": return MenuLocation.FOOTER;
    case "mobile": return MenuLocation.MOBILE;
    default: return null;
  }
}

export default async function MenuBuilderPage({ params }: { params: Promise<{ location: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = (session.user as any).role;
  // ADMIN + EDITOR - same gate as Page Builder.
  if (!["ADMIN", "EDITOR"].includes(role)) redirect("/");

  const { location: slug } = await params;
  const location = parseLocation(slug);
  if (!location) notFound();

  // Upsert-on-load so the editor never sees a 404 for an unseeded location.
  // Empty items array is a valid published menu (renders nothing); the seed
  // script can backfill richer defaults later.
  const menu = await prisma.menu.upsert({
    where: { location },
    create: {
      location,
      name: LOCATION_LABELS[slug] || slug,
      items: [],
      isPublished: false,
    },
    update: {},
    include: {
      _count: { select: { versions: true } },
    },
  });

  // Categories + districts + recent Content for the per-item target pickers.
  const [rawCategories, recentContent, rawDistricts] = await Promise.all([
    prisma.category.findMany({
      where: { active: true },
      select: { slug: true, name: true, nameEn: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.content.findMany({
      where: { status: "PUBLISHED" },
      select: { id: true, type: true, title: true, slug: true },
      orderBy: { publishedAt: "desc" },
      take: 200,
    }),
    prisma.district.findMany({
      where: { active: true },
      select: { slug: true, name: true, nameEn: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const categories = rawCategories.map((c) => ({ slug: c.slug, name: c.name, nameEn: c.nameEn ?? c.name }));
  // Districts reuse the {slug,name,nameEn} picker shape. The picker inserts a
  // clean bare /<slug> link, so districts are now fully menu-builder driven.
  const districts = rawDistricts.map((d) => ({ slug: d.slug, name: d.name, nameEn: d.nameEn }));

  // Spec #3 F1 #185 - broken-link detection. Collect every CATEGORY slug and
  // CONTENT id referenced by the menu (draft view, since editor shows draft),
  // then check which still exist. Items pointing at deleted rows get the ⚠
  // marker + a top-of-page banner.
  type AnyItem = { target?: { type?: string; categorySlug?: string; contentId?: string }; children?: AnyItem[] };
  const draftView = ((menu.draftItems ?? menu.items) as AnyItem[]) || [];
  const referencedCategorySlugs = new Set<string>();
  const referencedContentIds = new Set<string>();
  const walk = (items: AnyItem[]) => {
    for (const it of items) {
      const t = it.target;
      if (t?.type === "CATEGORY" && t.categorySlug) referencedCategorySlugs.add(t.categorySlug);
      if (t?.type === "CONTENT" && t.contentId) referencedContentIds.add(t.contentId);
      if (it.children?.length) walk(it.children);
    }
  };
  walk(draftView);

  const [validCategoryRows, validContentRows] = await Promise.all([
    referencedCategorySlugs.size
      ? prisma.category.findMany({
          where: { slug: { in: [...referencedCategorySlugs] }, active: true },
          select: { slug: true },
        })
      : Promise.resolve([]),
    referencedContentIds.size
      ? prisma.content.findMany({
          where: { id: { in: [...referencedContentIds] } },
          select: { id: true, status: true },
        })
      : Promise.resolve([]),
  ]);
  const validCategorySlugs = new Set(validCategoryRows.map((r) => r.slug));
  // Treat unpublished content as broken - public site won't render the link.
  const validContentIds = new Set(
    validContentRows.filter((r) => r.status === "PUBLISHED").map((r) => r.id),
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <MenuTreeEditor
          menuId={menu.id}
          location={slug}
          label={LOCATION_LABELS[slug] || slug}
          items={normalizeMenuTreeUrls((menu.draftItems as any) || (menu.items as any) || [])}
          publishedItems={(menu.items as any) || []}
          isPublished={menu.isPublished}
          hasUnpublishedDraft={menu.draftItems !== null}
          versionCount={menu._count.versions}
          categories={categories}
          districts={districts}
          recentContent={JSON.parse(JSON.stringify(recentContent))}
          validCategorySlugs={[...validCategorySlugs]}
          validContentIds={[...validContentIds]}
          currentUserName={(session.user.name as string) || (session.user.email as string) || "Editor"}
        />
      </main>
    </div>
  );
}
