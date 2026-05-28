import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// GET /api/audit-logs - filter by actor / action / resource / date range, paginated
//
// Admin + EDITOR can view. Lower roles get 403 (audit data is sensitive).
export async function GET(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    // Default 10 matches the admin's standard per-page size. Hard cap at
    // 100 to protect the audit-log query (gets big fast in prod).
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "10")));
    const offset = (page - 1) * limit;

    const actorId = searchParams.get("actorId") || "";
    const action = searchParams.get("action") || "";
    const resource = searchParams.get("resource") || "";
    const resourceId = searchParams.get("resourceId") || "";
    const from = searchParams.get("from"); // ISO date
    const to = searchParams.get("to");
    const search = searchParams.get("search") || "";

    const where: any = {};
    if (actorId) where.actorId = actorId;
    if (action) where.action = { contains: action };
    if (resource) where.resource = resource;
    if (resourceId) where.resourceId = resourceId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    if (search) {
      where.OR = [
        { actorEmail: { contains: search, mode: "insensitive" } },
        { action: { contains: search, mode: "insensitive" } },
        { resourceId: { contains: search } },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: { actor: { select: { id: true, name: true, email: true, role: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json({ logs, total, page, limit });
  } catch (error) {
    return apiError(error);
  }
}
