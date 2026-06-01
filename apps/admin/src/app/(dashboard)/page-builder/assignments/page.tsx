// Page Builder (Spec #2) - assignments list page. Server-renders the
// initial rows; the client component owns create/edit/delete + Test URL.

import { prisma } from "@rayalaseema/db";
import { AssignmentsClient } from "./assignments-client";

export const dynamic = "force-dynamic";

export default async function AssignmentsPage() {
  const [rows, templates] = await Promise.all([
    prisma.templateAssignment.findMany({
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      include: { template: { select: { id: true, name: true, slug: true, isPublished: true } } },
    }),
    prisma.template.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, isPublished: true },
    }),
  ]);

  const data = rows.map((r) => ({
    id: r.id,
    templateId: r.templateId,
    template: r.template,
    pattern: r.pattern,
    priority: r.priority,
    active: r.active,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <main style={{ marginLeft: 240, flex: 1, padding: "24px 28px" }}>
        <AssignmentsClient initialRows={data} templates={templates} />
      </main>
    </div>
  );
}
