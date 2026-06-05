// /redirects - manage site-wide URL redirects (301/308). The public site reads
// these via its own /api/redirects + middleware.
import { redirect } from "next/navigation";
import { prisma } from "@rayalaseema/db";
import { auth } from "@/lib/auth";
import { RedirectsClient } from "./redirects-client";

export const dynamic = "force-dynamic";

export default async function RedirectsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!["ADMIN", "EDITOR"].includes((session.user as any).role)) redirect("/");

  const rows = await prisma.redirect.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <RedirectsClient initial={JSON.parse(JSON.stringify(rows))} />
      </main>
    </div>
  );
}
