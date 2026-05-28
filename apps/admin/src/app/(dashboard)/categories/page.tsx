import { Sidebar } from "@/components/sidebar";
import { prisma } from "@rayalaseema/db";
import { CategoriesTable, type CategoryRow } from "./categories-table";

export default async function CategoriesPage() {
  // Pull every category plus its (optional) parent + per-category article
  // count. Order by sortOrder so the visual order matches the front-end nav.
  const raw = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { contents: true } },
      parent: { select: { id: true, nameEn: true, slug: true } },
    },
  });
  // JSON round-trip strips Date/etc. so it crosses the server → client boundary
  // cleanly. The cast is safe because the include shape matches CategoryRow.
  const data: CategoryRow[] = JSON.parse(JSON.stringify(raw));

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111", marginBottom: 4 }}>Categories</h1>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
          {data.length} categories · Telugu + English display names, hierarchy supported
        </p>
        <CategoriesTable data={data} />
      </main>
    </div>
  );
}
