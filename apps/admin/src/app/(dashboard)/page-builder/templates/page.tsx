// Page Builder (Spec #2) - templates list. Server-renders the table from
// /api/page-builder/templates data and embeds a client component that
// owns the create + clone + delete dialogs.

import { Sidebar } from "@/components/sidebar";
import { prisma } from "@rayalaseema/db";
import { TemplatesTable } from "./templates-table";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const rows = await prisma.template.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { versions: true } },
      assignments: { where: { active: true }, select: { pattern: true, priority: true } },
      createdBy: { select: { name: true } },
    },
  });

  const data = rows.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    description: t.description,
    isPublished: t.isPublished,
    publishedAt: t.publishedAt?.toISOString() ?? null,
    hasDraft: t.draftLayout !== null,
    versionCount: t._count.versions,
    patterns: t.assignments
      .sort((a, b) => b.priority - a.priority)
      .map((a) => a.pattern),
    createdBy: t.createdBy?.name || "-",
    updatedAt: t.updatedAt.toISOString(),
  }));

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: "24px 28px" }}>
        <TemplatesTable initialRows={data} />
      </main>
    </div>
  );
}
