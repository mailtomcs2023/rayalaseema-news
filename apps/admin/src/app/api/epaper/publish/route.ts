import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// POST /api/epaper/publish — body { editionId }
// On PUBLISHED state transition, fire:
//   1. Update web/epaper to point to this edition (already auto — newest active edition wins)
//   2. WhatsApp blast with PDF link (Twilio API or wa-bot)
//   3. OneSignal push notification to subscribers
//   4. Tweet edition link
//
// For now we do step 1 only and stub the rest. Each integration ships when
// the relevant API key + opt-in list are ready.
// Tracking issue: #72.

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "CHIEF_SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const body = await req.json();
    const editionId = body?.editionId as string;
    if (!editionId) return NextResponse.json({ error: "editionId required" }, { status: 400 });

    const edition = await prisma.epaperEdition.findUnique({ where: { id: editionId } });
    if (!edition) return NextResponse.json({ error: "Edition not found" }, { status: 404 });
    if (!edition.pdfUrl) return NextResponse.json({ error: "Render the edition first (no pdfUrl yet)" }, { status: 400 });

    // Step 1: flip workflow + active. Web /epaper picks the newest active+ready
    // automatically — no other change needed for web release.
    await prisma.epaperEdition.update({
      where: { id: editionId },
      data: { active: true, workflowState: "PUBLISHED", status: "ready" },
    });

    // Steps 2-4: stubs. Each enables when its API key + opt-in list are wired.
    const dispatched = {
      web: true,
      whatsapp: false, // Twilio Conversations API
      push: false,     // OneSignal
      tweet: false,    // X API v2
    };
    const skippedReason = {
      whatsapp: "Set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM + add subscriber opt-in list",
      push: "Set ONESIGNAL_APP_ID + ONESIGNAL_REST_KEY and confirm web push opted-in users exist",
      tweet: "Set X_BEARER_TOKEN with epaper:tweet permission",
    };

    return NextResponse.json({ ok: true, dispatched, skippedReason, pdfUrl: edition.pdfUrl, issue: "#72" });
  } catch (e) { return apiError(e); }
}
