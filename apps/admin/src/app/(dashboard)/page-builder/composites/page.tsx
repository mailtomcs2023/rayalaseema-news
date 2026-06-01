// Page Builder (Spec #2) - composite blocks list. CRUD wired through the
// page-builder/composites API. Composites are populated by the visual
// editor's "Group into composite" action (F1 #168); this page handles
// name/slug/description maintenance + delete.

import { prisma } from "@rayalaseema/db";
import { CompositesClient } from "./composites-client";

export const dynamic = "force-dynamic";

export default async function CompositesPage() {
  const rows = await prisma.compositeBlock.findMany({
    orderBy: { updatedAt: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  const data = rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    blockCount: Array.isArray(r.blocks) ? (r.blocks as unknown[]).length : 0,
    createdBy: r.createdBy?.name || "-",
    updatedAt: r.updatedAt.toISOString(),
  }));

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <main style={{ marginLeft: 240, flex: 1, padding: "24px 28px" }}>
        <CompositesClient initialRows={data} />
      </main>
    </div>
  );
}
