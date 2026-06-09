// Visual page editor host (GrapesJS). Server component: auth + load the page,
// then hand off to the client editor boundary.
import { redirect, notFound } from "next/navigation";
import { prisma } from "@rayalaseema/db";
import { auth } from "@/lib/auth";
import { VisualEditorClient } from "@/components/visual-editor-client";

export const dynamic = "force-dynamic";

export default async function VisualEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!["ADMIN", "EDITOR"].includes((session.user as { role?: string }).role || "")) redirect("/");

  const { id } = await params;
  const page = await (prisma as unknown as { visualPage: { findUnique: (a: unknown) => Promise<{ id: string; name: string; slug: string; projectData: unknown } | null> } }).visualPage.findUnique({
    where: { id },
    select: { id: true, name: true, slug: true, projectData: true },
  });
  if (!page) notFound();

  const webUrl = process.env.WEB_URL || process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000";

  return (
    <div style={{ marginLeft: 240 }}>
      <VisualEditorClient
        id={page.id}
        name={page.name}
        slug={page.slug}
        initialProject={page.projectData ?? null}
        webUrl={webUrl}
      />
    </div>
  );
}
