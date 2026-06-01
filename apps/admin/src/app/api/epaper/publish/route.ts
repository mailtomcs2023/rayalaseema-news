import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// POST /api/epaper/publish - body { editionId }
// On PUBLISHED state transition, fire:
//   1. Update web/epaper to point to this edition (already auto - newest active edition wins)
//   2. WhatsApp blast with PDF link (Twilio API or wa-bot)
//   3. OneSignal push notification to subscribers
//   4. Tweet edition link
//
// For now we do step 1 only and stub the rest. Each integration ships when
// the relevant API key + opt-in list are ready.
// Tracking issue: #72.

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const body = await req.json();
    const editionId = body?.editionId as string;
    if (!editionId) return NextResponse.json({ error: "editionId required" }, { status: 400 });

    const edition = await prisma.epaperEdition.findUnique({ where: { id: editionId } });
    if (!edition) return NextResponse.json({ error: "Edition not found" }, { status: 404 });
    if (!edition.pdfUrl) return NextResponse.json({ error: "Render the edition first (no pdfUrl yet)" }, { status: 400 });

    // Step 1: flip workflow + active. Web /epaper picks the newest active+ready
    // automatically - no other change needed for web release.
    await prisma.epaperEdition.update({
      where: { id: editionId },
      data: { active: true, workflowState: "PUBLISHED", status: "ready" },
    });

    const headline = `రాయలసీమ న్యూస్ - ${edition.date.toLocaleDateString("te-IN", { day: "numeric", month: "long", year: "numeric" })} ఎడిషన్ విడుదలైంది`;
    const siteUrl = process.env.SITE_URL || "https://rayalaseemanews.com";
    const editionUrl = `${siteUrl}/epaper?date=${edition.date.toISOString().slice(0, 10)}`;

    const dispatched: Record<string, boolean> = { web: true, whatsapp: false, push: false, tweet: false };
    const skippedReason: Record<string, string> = {};
    const errors: Record<string, string> = {};

    // OneSignal web push - gated on app id + rest key.
    if (process.env.ONESIGNAL_APP_ID && process.env.ONESIGNAL_REST_KEY) {
      try {
        const r = await fetch("https://api.onesignal.com/notifications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Key ${process.env.ONESIGNAL_REST_KEY}`,
          },
          body: JSON.stringify({
            app_id: process.env.ONESIGNAL_APP_ID,
            headings: { en: headline, te: headline },
            contents: { en: "Tap to read today's ePaper", te: "ఈ రోజు ఈ-పేపర్ చదవండి" },
            url: editionUrl,
            included_segments: ["All"],
          }),
        });
        dispatched.push = r.ok;
        if (!r.ok) errors.push = `HTTP ${r.status}`;
      } catch (e) { errors.push = String((e as Error).message || e); }
    } else {
      skippedReason.push = "Set ONESIGNAL_APP_ID + ONESIGNAL_REST_KEY";
    }

    // X / Twitter v2 - bearer token must hold tweet.write scope.
    if (process.env.X_BEARER_TOKEN) {
      try {
        const r = await fetch("https://api.twitter.com/2/tweets", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.X_BEARER_TOKEN}`,
          },
          body: JSON.stringify({ text: `${headline}\n${editionUrl}` }),
        });
        dispatched.tweet = r.ok;
        if (!r.ok) errors.tweet = `HTTP ${r.status}`;
      } catch (e) { errors.tweet = String((e as Error).message || e); }
    } else {
      skippedReason.tweet = "Set X_BEARER_TOKEN with tweet.write scope";
    }

    // WhatsApp via Twilio Conversations - broadcasts to E.164 opt-in list
    // stored in TWILIO_WHATSAPP_TO (comma-separated). Replace with DB table
    // when subscriber opt-in flow ships.
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM && process.env.TWILIO_WHATSAPP_TO) {
      try {
        const toList = process.env.TWILIO_WHATSAPP_TO.split(",").map((s) => s.trim()).filter(Boolean);
        const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
        const msgBody = `${headline}\n${editionUrl}\n${edition.pdfUrl}`;
        let okCount = 0;
        for (const to of toList) {
          const form = new URLSearchParams({
            From: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
            To: `whatsapp:${to}`,
            Body: msgBody,
          });
          const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${auth}` },
            body: form.toString(),
          });
          if (r.ok) okCount++;
        }
        dispatched.whatsapp = okCount > 0;
        if (okCount < toList.length) errors.whatsapp = `${okCount}/${toList.length} delivered`;
      } catch (e) { errors.whatsapp = String((e as Error).message || e); }
    } else {
      skippedReason.whatsapp = "Set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM + TWILIO_WHATSAPP_TO (comma-list)";
    }

    return NextResponse.json({ ok: true, dispatched, skippedReason, errors, pdfUrl: edition.pdfUrl });
  } catch (e) { return apiError(e); }
}
