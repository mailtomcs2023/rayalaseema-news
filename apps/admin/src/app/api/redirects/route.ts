// Redirects CRUD (list + create/upsert). Consumed by the admin Redirects page
// and auto-create from the menu builder. The public site reads these via its
// own /api/redirects + middleware.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// Normalize to a root-relative path ("/foo"). External http(s) targets pass
// through untouched so a redirect can point off-site if ever needed.
function normPath(p: unknown): string {
  let s = String(p ?? "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (!s.startsWith("/")) s = "/" + s;
  return s.replace(/\s+/g, "");
}

export async function GET() {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const rows = await prisma.redirect.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json(rows);
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const body = await req.json();
    const fromPath = normPath(body.fromPath);
    const toPath = normPath(body.toPath);
    const statusCode = body.statusCode === 307 ? 307 : 308;
    if (!fromPath.startsWith("/")) {
      return NextResponse.json({ error: "From path must start with /" }, { status: 400 });
    }
    if (!toPath) {
      return NextResponse.json({ error: "Target is required" }, { status: 400 });
    }
    if (fromPath === toPath) {
      return NextResponse.json({ error: "From and target can't be the same" }, { status: 400 });
    }
    // Upsert on fromPath so re-adding the same source updates its target instead
    // of failing the unique constraint (also how the menu auto-create behaves).
    const row = await prisma.redirect.upsert({
      where: { fromPath },
      create: { fromPath, toPath, statusCode, note: body.note ? String(body.note) : null },
      update: { toPath, statusCode, note: body.note ? String(body.note) : null },
    });
    return NextResponse.json(row);
  } catch (e) {
    return apiError(e);
  }
}
