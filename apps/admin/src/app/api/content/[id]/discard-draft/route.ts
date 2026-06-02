// POST /api/content/[id]/discard-draft
//
// Soft-deletes a *never-touched* placeholder draft when the editor is
// abandoned - e.g. "New Content -> pick a type -> hit back" without typing
// anything. /content/new creates the row eagerly (title "Untitled <Type>")
// so the editor has an id immediately; this endpoint cleans up the ones the
// user walks away from.
//
// Safety: the server re-verifies the row is still a pristine "Untitled" DRAFT
// owned by the caller before deleting, so a stale/forged call can never remove
// real content. No KYC gate - discarding your own empty placeholder is not an
// editorial action. Always returns 200 with { discarded: boolean } so the
// fire-and-forget keepalive call on unmount never surfaces an error.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError } from "@/lib/api-utils";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"]);
  if (isAuthError(session)) return session;
  const { id } = await params;

  const row = await prisma.content.findUnique({
    where: { id },
    select: { id: true, authorId: true, status: true, title: true, body: true, featuredImage: true, viewCount: true },
  });
  if (!row) return NextResponse.json({ discarded: false, reason: "not_found" });

  const pristine =
    row.authorId === session.user.id &&
    row.status === "DRAFT" &&
    (row.title || "").startsWith("Untitled ") &&
    !(row.body || "").trim() &&
    !row.featuredImage &&
    (row.viewCount ?? 0) === 0;

  if (!pristine) return NextResponse.json({ discarded: false, reason: "not_pristine" });

  await prisma.content.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ discarded: true });
}
