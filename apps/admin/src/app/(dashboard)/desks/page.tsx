import { Sidebar } from "@/components/sidebar";
import { CrudTable } from "@/components/crud-table";
import { prisma } from "@rayalaseema/db";

export default async function DesksPage() {
  const data = await prisma.desk.findMany({
    orderBy: [{ branch: "asc" }, { sortOrder: "asc" }, { nameEn: "asc" }],
    include: { _count: { select: { articles: true } } },
  });

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <div style={{ marginBottom: 16, padding: 14, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, fontSize: 13, color: "#9a3412" }}>
          <strong>Desks</strong> = byline groupings used on web + e-paper.
          Most desks are auto-seeded from districts, constituencies, and categories
          (run <code>scripts/seed-desks.ts</code> after adding a new one). Only create new
          desks here for EDITORIAL branches or one-off bureaus.
        </div>
        <CrudTable
          title="Desks"
          apiPath="desks"
          data={JSON.parse(JSON.stringify(data))}
          columns={[
            { key: "branch", label: "Branch" },
            { key: "name", label: "Name (Telugu)" },
            { key: "nameEn", label: "Name (English)" },
            { key: "slug", label: "Slug" },
            { key: "_count", label: "Articles", type: "count" },
            { key: "active", label: "Active", type: "boolean" },
          ]}
          fields={[
            { key: "name", label: "Name (Telugu)", type: "text", required: true, placeholder: "Byline text shown to readers" },
            { key: "nameEn", label: "Name (English)", type: "text", required: true, placeholder: "English name (admin only)" },
            { key: "slug", label: "Slug", type: "text", required: true, placeholder: "desk-something (must be unique)" },
            { key: "branch", label: "Branch", type: "select", required: true, options: [
                { value: "TOPICAL", label: "Topical (per category)" },
                { value: "GEOGRAPHIC", label: "Geographic (region/district/AC)" },
                { value: "EDITORIAL", label: "Editorial (opinion / letters)" },
              ] },
            { key: "sortOrder", label: "Sort Order", type: "number" },
            { key: "active", label: "Active", type: "checkbox", placeholder: "Desk is selectable in article editor" },
          ]}
        />
      </main>
    </div>
  );
}
