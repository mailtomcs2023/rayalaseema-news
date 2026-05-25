// /menu-builder/[location] — three locations served by the same editor:
//   /menu-builder/header  /menu-builder/footer  /menu-builder/mobile
//
// Spec #3 B1 #177 + C1-C3 #178-#180. Server component picks the right
// location enum value, then hands off to the client tree editor.
import { redirect, notFound } from "next/navigation";
import { prisma, MenuLocation } from "@rayalaseema/db";
import { Sidebar } from "@/components/sidebar";
import { auth } from "@/lib/auth";
import { MenuTreeEditor } from "@/components/menu-tree-editor";

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
  // ADMIN + (CHIEF_SUB_)EDITOR — same gate as Page Builder.
  if (!["ADMIN", "EDITOR", "CHIEF_SUB_EDITOR"].includes(role)) redirect("/");

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

  // Categories + recent Content for the per-item target pickers.
  const [categories, recentContent] = await Promise.all([
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
  ]);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <MenuTreeEditor
          menuId={menu.id}
          location={slug}
          label={LOCATION_LABELS[slug] || slug}
          items={(menu.draftItems as any) || (menu.items as any) || []}
          publishedItems={(menu.items as any) || []}
          isPublished={menu.isPublished}
          hasUnpublishedDraft={menu.draftItems !== null}
          versionCount={menu._count.versions}
          categories={categories}
          recentContent={JSON.parse(JSON.stringify(recentContent))}
        />
      </main>
    </div>
  );
}
