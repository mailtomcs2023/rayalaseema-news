// Visual Pages list + create.
import { redirect } from "next/navigation";
import { prisma } from "@rayalaseema/db";
import { auth } from "@/lib/auth";
import { VisualPagesTable } from "@/components/visual-pages-table";

export const dynamic = "force-dynamic";

export default async function VisualPagesListPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!["ADMIN", "EDITOR"].includes((session.user as { role?: string }).role || "")) redirect("/");

  const pages = await (prisma as unknown as {
    visualPage: { findMany: (a: unknown) => Promise<unknown[]> };
  }).visualPage.findMany({
    select: { id: true, name: true, slug: true, isPublished: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  const webUrl = process.env.WEB_URL || process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000";

  return (
    <div style={{ marginLeft: 240, padding: 24, background: "#f3f4f6", minHeight: "100vh" }}>
      <VisualPagesTable data={JSON.parse(JSON.stringify(pages))} webUrl={webUrl} />
    </div>
  );
}
