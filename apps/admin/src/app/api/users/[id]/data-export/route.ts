import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

// GET /api/users/[id]/data-export
//
// DPDPA / GDPR personal-data export (#100). Returns every row in the DB
// associated with the user — profile, authored articles (id + slug + title
// only, full body via the public site), comments, audit-log actions they
// triggered. JSON download.
//
// Access rules:
//   - User can export their own data.
//   - ADMIN can export any user's data.
// Audit-logged either way.
//
// Right-to-be-forgotten (account deletion) is a separate endpoint (DELETE)
// — splitting export from deletion lets users keep a copy before wiping.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const role = (session.user as any).role;
    if (session.user.id !== id && role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden — users can only export their own data" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, name: true, role: true, avatar: true, bio: true,
        phone: true, active: true, createdAt: true, updatedAt: true,
        // Explicitly exclude passwordHash, mustChangePassword from export.
      },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const [articlesAuthored, comments, auditEvents] = await Promise.all([
      prisma.content.findMany({
        where: { type: "ARTICLE", authorId: id },
        select: { id: true, slug: true, title: true, status: true, createdAt: true, publishedAt: true },
        orderBy: { createdAt: "desc" },
        take: 1000,
      }),
      // Comments are anonymous in this schema (name + email, no userId
      // relation). Return [] to keep the export shape stable until a
      // userId column lands on Comment.
      Promise.resolve([] as never[]),
      prisma.auditLog.findMany({
        where: { actorId: id },
        select: { id: true, action: true, resource: true, resourceId: true, createdAt: true, meta: true },
        orderBy: { createdAt: "desc" },
        take: 1000,
      }).catch(() => []),
    ]);

    await logAudit({
      action: "user.data_export",
      resource: "user",
      resourceId: id,
      meta: { exportedById: session.user.id, counts: { articles: articlesAuthored.length, comments: comments.length, audit: auditEvents.length } },
      actor: { id: session.user.id, email: session.user.email, role },
      req,
    });

    const payload = {
      exportedAt: new Date().toISOString(),
      regulation: "DPDPA 2023 / GDPR Article 20",
      user,
      articlesAuthored,
      comments,
      auditEvents,
      _note: "passwordHash + mustChangePassword intentionally omitted (security).",
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="re-data-export-${user.id}-${Date.now()}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) { return apiError(e); }
}
