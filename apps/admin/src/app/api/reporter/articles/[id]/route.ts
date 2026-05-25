import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { getReporterId } from "@/lib/reporter-auth";

// Reporter-scoped single-article operations.
//
// GET    — fetch one of the signed-in reporter's articles (any status).
// PATCH  — edit the article. Allowed only while status is "SUBMITTED" or
//          "DRAFT" (the reporter still owns the content). Once an editor
//          picks it up (IN_REVIEW) or it's been decided
//          (APPROVED/PUBLISHED/REJECTED), the reporter loses edit access.
//          PATCH also accepts a status field for one specific transition:
//          DRAFT → SUBMITTED ("submit a draft for review"). No other
//          status changes are honoured here.
// DELETE — same window as PATCH: SUBMITTED or DRAFT only.
//
// Reporters can never reach a different author's article — every handler
// checks article.authorId against the bearer-token reporter id and 404s
// otherwise (we treat "not yours" as "doesn't exist" to avoid leaking ids).

const EDITABLE_STATUSES = ["SUBMITTED", "DRAFT"] as const;
type EditableStatus = typeof EDITABLE_STATUSES[number];
function isEditable(status: string): status is EditableStatus {
  return (EDITABLE_STATUSES as readonly string[]).includes(status);
}

async function loadOwned(req: NextRequest, id: string) {
  const reporterId = await getReporterId(req);
  if (!reporterId) return { err: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  // Only fetch the fields needed for the ownership + editability checks.
  const article = await prisma.article.findUnique({
    where: { id },
    select: { id: true, authorId: true, status: true },
  });
  if (!article || article.authorId !== reporterId) {
    return { err: NextResponse.json({ error: "Article not found" }, { status: 404 }) };
  }
  return { article };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await loadOwned(req, id);
  if (r.err) return r.err;
  const full = await prisma.article.findUnique({
    where: { id },
    // Explicit select — keeps the response stable across environments and
    // matches the fields the editor (mobile + web) actually reads.
    select: {
      id: true,
      title: true,
      slug: true,
      summary: true,
      body: true,
      status: true,
      featuredImage: true,
      rejectionNote: true,
      viewCount: true,
      createdAt: true,
      updatedAt: true,
      categoryId: true,
      category: { select: { id: true, name: true, nameEn: true, slug: true, color: true } },
    },
  });
  return NextResponse.json(full);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await loadOwned(req, id);
  if (r.err) return r.err;
  if (!isEditable(r.article.status)) {
    return NextResponse.json(
      { error: `Article is ${r.article.status} — editing is no longer allowed` },
      { status: 403 },
    );
  }
  try {
    const body = await req.json();
    const { title, summary, body: articleBody, categoryId, featuredImage, status } = body;

    // Validate only the fields actually being changed. Empty title is rejected
    // because it would leave the article in an invalid state; everything else
    // can be cleared by sending null/empty.
    if (title !== undefined && !String(title).trim()) {
      return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = String(title).trim();
    if (summary !== undefined) data.summary = summary ? String(summary).trim() : null;
    if (articleBody !== undefined) data.body = articleBody || "";
    if (categoryId !== undefined) data.categoryId = categoryId;
    if (featuredImage !== undefined) data.featuredImage = featuredImage ? String(featuredImage).trim() : null;

    // Status: the only transition reporters may make here is
    // DRAFT → SUBMITTED ("send my draft for review"). Anything else is a
    // hard 403 — we don't let reporters un-submit, approve, or publish.
    if (status !== undefined && status !== r.article.status) {
      if (r.article.status === "DRAFT" && status === "SUBMITTED") {
        data.status = "SUBMITTED";
      } else {
        return NextResponse.json(
          { error: `Status change ${r.article.status} → ${status} is not allowed` },
          { status: 403 },
        );
      }
    }

    const updated = await prisma.article.update({
      where: { id },
      data,
      // Mirror the GET shape so callers can rely on the same field set.
      select: { id: true, title: true, slug: true, status: true, updatedAt: true },
    });
    return NextResponse.json(updated);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to update article";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await loadOwned(req, id);
  if (r.err) return r.err;
  if (!isEditable(r.article.status)) {
    return NextResponse.json(
      { error: `Article is ${r.article.status} — deletion is no longer allowed` },
      { status: 403 },
    );
  }
  try {
    await prisma.article.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to delete article";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
