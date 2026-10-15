import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getReporterId } from "@/lib/reporter-auth";
import { getPressCardById } from "@/lib/press-card/service";
import { renderPressCardPdf, PressCardRenderError } from "@/lib/press-card/render";
import { verifyDownloadToken } from "@/lib/press-card/download-token";
import { decideAccess } from "@/lib/press-card/access";

export const dynamic = "force-dynamic";

// Who may download: (1) a valid short-lived ?t= token for THIS card,
// (2) an ADMIN / EDITOR session, (3) the holder (bearer token from the app
// or reporter web session). Staff is checked before the holder because
// staff can always pull the PDF for records (never gated by liveStatus),
// while holders are blocked once their card is SEPARATED, REVOKED or
// EXPIRED. See access.ts for the unit-tested decision matrix this route
// just applies.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = await getPressCardById(id);
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const t = req.nextUrl.searchParams.get("t");
  const tokenCardId = t ? verifyDownloadToken(t) : null;
  const holderId = await getReporterId(req);
  const session = await auth();
  const role = (session?.user as any)?.role as string | undefined;

  const decision = decideAccess({
    cardId: id,
    cardUserId: card.userId,
    liveStatus: card.liveStatus,
    tokenCardId,
    holderId,
    role,
  });

  if (!decision.allowed) {
    if (decision.reason) {
      return NextResponse.json({ error: `Card is ${decision.reason.toLowerCase()}; download is disabled`, code: decision.reason }, { status: 403 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = { ...card, validFrom: new Date(`${card.validFrom}T00:00:00.000Z`), validTill: new Date(`${card.validTill}T00:00:00.000Z`) };
  let pdf: Buffer | null = null; let lastErr: unknown;
  for (let attempt = 0; attempt < 2 && !pdf; attempt++) {
    try { pdf = await renderPressCardPdf(data); } catch (e) { lastErr = e; }
  }
  if (!pdf) {
    console.error("[press-card] render failed", id, lastErr);
    const msg = lastErr instanceof PressCardRenderError && lastErr.code === "PHOTO_UNREACHABLE" ? "Card photo could not be loaded, try again" : "Card could not be rendered, try again";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="press-card-${card.cardNo.replace(/\//g, "-")}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
