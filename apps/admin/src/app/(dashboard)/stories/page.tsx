import { Sidebar } from "@/components/sidebar";
import { CrudTable } from "@/components/crud-table";
import { prisma } from "@rayalaseema/db";

export const dynamic = "force-dynamic";

export default async function StoriesPage() {
  const data = await prisma.webStory.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <CrudTable
          title="Web Stories"
          apiPath="stories"
          data={JSON.parse(JSON.stringify(data))}
          columns={[
            { key: "title", label: "Title" },
            { key: "category", label: "Category" },
            { key: "views", label: "Views" },
            { key: "active", label: "Status", type: "boolean" },
          ]}
          fields={[
            { key: "title", label: "Title", type: "text", required: true },
            { key: "imageUrl", label: "Image URL", type: "url", required: true },
            { key: "category", label: "Category", type: "select", options: [
              { value: "devotional", label: "Devotional" }, { value: "travel", label: "Travel" },
              { value: "food", label: "Food" }, { value: "history", label: "History" },
              { value: "heritage", label: "Heritage" }, { value: "city", label: "City" },
            ]},
            { key: "active", label: "Active", type: "checkbox", placeholder: "Story is active" },
          ]}
        />
      </main>
    </div>
  );
}
