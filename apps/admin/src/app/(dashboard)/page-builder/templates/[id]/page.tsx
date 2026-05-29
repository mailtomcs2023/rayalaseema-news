// Page Builder (Spec #2) - visual editor shell (E1 #163).
// Loads the template + the published web URL into a client component
// that owns the 3-pane layout (palette | canvas iframe | config panel).
// Subsequent E phases (#164-#167) wire the interactivity:
//   E2 = palette drag source + drop targets
//   E3 = canvas iframe postMessage protocol (insert/reorder/delete/select)
//   E4 = config panel driven by block.type registry
//   E5 = mobileVariant selector + auto-save

import { prisma, layoutSchema, BUILTIN_BLOCK_TYPES } from "@rayalaseema/db";
import { notFound } from "next/navigation";
import { EditorShell } from "./editor-shell";

export const dynamic = "force-dynamic";

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tpl = await prisma.template.findUnique({
    where: { id },
    include: { _count: { select: { versions: true } } },
  });
  if (!tpl) return notFound();

  const composites = await prisma.compositeBlock.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });

  const initial = {
    id: tpl.id,
    name: tpl.name,
    slug: tpl.slug,
    description: tpl.description,
    isPublished: tpl.isPublished,
    publishedAt: tpl.publishedAt?.toISOString() ?? null,
    versionCount: tpl._count.versions,
    layout: layoutSchema.safeParse(tpl.layout).success
      ? (tpl.layout as object)
      : { version: 1, blocks: [] },
    draftLayout:
      tpl.draftLayout && layoutSchema.safeParse(tpl.draftLayout).success
        ? (tpl.draftLayout as object)
        : null,
  };

  // SITE_URL is the public web app; in development point to localhost:3000.
  // The editor iframes /page-builder/preview/[id]?draft=1 on this origin.
  const webUrl = process.env.SITE_URL || "http://localhost:3000";

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <main style={{ marginLeft: 240, flex: 1, padding: "16px 20px" }}>
        <EditorShell
          initial={initial}
          webUrl={webUrl}
          builtinBlockTypes={[...BUILTIN_BLOCK_TYPES]}
          composites={composites}
        />
      </main>
    </div>
  );
}
