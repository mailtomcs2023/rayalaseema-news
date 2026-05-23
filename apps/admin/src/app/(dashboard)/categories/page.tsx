import { Sidebar } from "@/components/sidebar";
import { CrudTable } from "@/components/crud-table";
import { prisma } from "@rayalaseema/db";

export default async function CategoriesPage() {
  const data = await prisma.category.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { articles: true } } } });

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <CrudTable
          title="Categories"
          apiPath="categories"
          data={JSON.parse(JSON.stringify(data))}
          columns={[
            { key: "sortOrder", label: "#" },
            { key: "name", label: "Name (Telugu)" },
            { key: "nameEn", label: "Name (English)" },
            { key: "slug", label: "Slug" },
            { key: "color", label: "Color", type: "color" },
            { key: "_count", label: "Articles", type: "count" },
            { key: "active", label: "Status", type: "boolean" },
          ]}
          fields={[
            { key: "nameEn", label: "Name (English)", type: "text", required: true, placeholder: "Category name in English" },
            { key: "name", label: "Name (Telugu)", type: "text", required: true, placeholder: "Category name in Telugu", translateFromKey: "nameEn" },
            { key: "slug", label: "Slug", type: "text", placeholder: "auto-generated from English name", slugFromKey: "nameEn" },
            { key: "color", label: "Color", type: "color" },
            { key: "description", label: "Description", type: "textarea" },
            { key: "sortOrder", label: "Sort Order", type: "number" },
            { key: "active", label: "Active", type: "checkbox", placeholder: "Category is active" },
          ]}
        />
      </main>
    </div>
  );
}
