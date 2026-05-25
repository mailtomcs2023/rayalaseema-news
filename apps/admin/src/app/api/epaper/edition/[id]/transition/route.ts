import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { canTransition, transitionMeta } from "@/lib/epaper/workflow";
import type { EpaperWorkflowState } from "@prisma/client";

// POST /api/epaper/edition/[id]/transition
// Body: { to: EpaperWorkflowState, note?: string }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const body = await req.json();
    const to = body?.to as EpaperWorkflowState | undefined;
    const note = (body?.note as string | undefined)?.trim() || null;
    if (!to) return NextResponse.json({ error: "to required" }, { status: 400 });

    const edition = await prisma.epaperEdition.findUnique({ where: { id } });
    if (!edition) return NextResponse.json({ error: "Edition not found" }, { status: 404 });

    const role = (session.user as any).role as "ADMIN" | "CHIEF_SUB_EDITOR" | "SUB_EDITOR" | "REPORTER";
    const reason = canTransition(edition.workflowState, to, role);
    if (reason) return NextResponse.json({ error: reason }, { status: 403 });

    const meta = transitionMeta(edition.workflowState, to);
    if (meta?.noteRequired && !note) {
      return NextResponse.json({ error: "This transition requires a note" }, { status: 400 });
    }

    // Stamp kill metadata when transitioning into KILLED. Reverse stamps on
    // any other transition (e.g. KILLED → DRAFT if we ever allow undo).
    const killPatch =
      to === "KILLED"
        ? { killedAt: new Date(), killedReason: note, killedById: session.user.id, active: false }
        : edition.workflowState === "KILLED"
        ? { killedAt: null, killedReason: null, killedById: null, active: true }
        : {};

    const updated = await prisma.epaperEdition.update({
      where: { id },
      data: { workflowState: to, workflowNote: note, ...killPatch },
    });

    await logAudit({
      action: `epaper.workflow.${edition.workflowState}_to_${to}`,
      resource: "epaper_edition",
      resourceId: id,
      meta: { from: edition.workflowState, to, note },
      actor: { id: session.user.id, email: session.user.email, role },
      req,
    });

    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}
