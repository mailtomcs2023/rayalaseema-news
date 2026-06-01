// Page Builder (Spec #2) - version history table for a single template.
// Restore copies the chosen snapshot into draftLayout (preserves the
// currently published layout) so the operator can review the restored
// version inside the editor before publishing.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@rayalaseema/db";
import { VersionsClient } from "./versions-client";

export const dynamic = "force-dynamic";

export default async function VersionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tpl = await prisma.template.findUnique({ where: { id } });
  if (!tpl) return notFound();

  const versions = await prisma.templateVersion.findMany({
    where: { templateId: id },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { editedBy: { select: { name: true, email: true } } },
  });

  const data = versions.map((v) => ({
    id: v.id,
    editNote: v.editNote,
    editorName: v.editedBy?.name || v.editedBy?.email || "-",
    blockCount: Array.isArray((v.layout as { blocks?: unknown[] })?.blocks)
      ? ((v.layout as { blocks: unknown[] }).blocks.length)
      : 0,
    createdAt: v.createdAt.toISOString(),
  }));

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <main style={{ marginLeft: 240, flex: 1, padding: "24px 28px" }}>
        <div style={{ marginBottom: 14 }}>
          <Link
            href={`/page-builder/templates/${tpl.id}`}
            style={{ color: "#6b7280", textDecoration: "none", fontSize: 13 }}
          >
            ← Back to editor
          </Link>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: "6px 0 2px" }}>
            Version history - {tpl.name}
          </h1>
          <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
            Each publish snapshots the layout. Restoring copies a snapshot
            into the draft slot so you can review (and re-edit) before
            re-publishing - the live layout doesn't change until you publish.
          </p>
        </div>

        <VersionsClient templateId={tpl.id} versions={data} />
      </main>
    </div>
  );
}
