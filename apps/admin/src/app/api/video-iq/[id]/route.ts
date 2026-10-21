import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { chosenSchema } from "@/lib/video-iq/chosen";

// GET   /api/video-iq/[id]            → the run
// PATCH /api/video-iq/[id] { chosen } → store the editor's choice (validated)

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;
  const { id } = await ctx.params;
  const row = await prisma.videoOptimization.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR"]);
  if (isAuthError(auth)) return auth;
  try {
    const { id } = await ctx.params;
    const row = await prisma.videoOptimization.findUnique({ where: { id }, select: { id: true, status: true, chosen: true } });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!["READY", "APPROVED", "FAILED"].includes(row.status)) {
      return NextResponse.json({ error: `cannot edit a run in status ${row.status}` }, { status: 409 });
    }
    const body = await req.json().catch(() => ({}));
    // Keep an existing admin override; the editor cannot set one through PATCH.
    const existingOverride = (row.chosen as { override?: unknown } | null)?.override;
    const parsed = chosenSchema.safeParse({ ...(body.chosen ?? {}), override: existingOverride });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid choice", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
    }
    // Optional visibility change (public | private | scheduled + publishAt ≥ 5 min ahead).
    const vis = body.visibility as string | undefined;
    const visData: Record<string, unknown> = {};
    if (vis) {
      if (!["public", "private", "scheduled"].includes(vis)) return NextResponse.json({ error: "visibility must be public, private or scheduled" }, { status: 400 });
      const at = vis === "scheduled" ? Date.parse(String(body.publishAt ?? "")) : NaN;
      if (vis === "scheduled" && (!Number.isFinite(at) || at < Date.now() + 5 * 60_000)) {
        return NextResponse.json({ error: "scheduled time must be at least 5 minutes in the future" }, { status: 400 });
      }
      visData.visibility = vis;
      visData.publishAt = vis === "scheduled" ? new Date(at) : null;
    }
    const updated = await prisma.videoOptimization.update({
      where: { id },
      data: { chosen: parsed.data, ...visData, ...(row.status === "APPROVED" ? { status: "READY" } : {}) },
    });
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}
