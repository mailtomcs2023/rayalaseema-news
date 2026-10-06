// Press ID card verification - the page a printed card's QR opens.
//
// Audience: police, event security, sources, anyone handed a card. They need
// one answer fast: is this card genuine and still valid, and does the photo
// match the person in front of them. So the status chip is the loudest thing
// on the page and the photo is large. Nothing personal beyond what is already
// printed on the card is shown - no phone, no address, no DOB.
//
// Tokens are random (see packages/db/src/press-card.ts); card numbers are
// deliberately NOT routable so staff cannot be enumerated. noindex + the
// /verify/ disallow in robots.ts keep these out of search.

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { prisma, computePressCardStatus, isValidPressCardToken, type PressCardLiveStatus } from "@rayalaseema/db";

export const dynamic = "force-dynamic";

const PUBLISHER = "Medha Publications Pvt Ltd";
const CIN = "U58130AP2026PTC127049";
const REPORT_EMAIL = "social@rayalaseemanews.com";

async function fetchCard(token: string) {
  if (!isValidPressCardToken(token)) return null;
  return prisma.pressCard.findUnique({
    where: { token },
    select: {
      cardNo: true, name: true, designation: true, photoUrl: true,
      validFrom: true, validTill: true, status: true, revokedAt: true,
    },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const card = await fetchCard(token);
  return {
    title: card ? `Press card ${card.cardNo} - ${card.name} | Rayalaseema News` : "Press card not found | Rayalaseema News",
    robots: { index: false, follow: false },
  };
}

const STATUS_UI: Record<PressCardLiveStatus, { label: string; sub: string; bg: string; fg: string }> = {
  ACTIVE:  { label: "VERIFIED · ACTIVE", sub: "This press card is genuine and currently valid.", bg: "#0f9d58", fg: "#fff" },
  EXPIRED: { label: "EXPIRED",           sub: "This card's validity period has ended. Treat as not valid.", bg: "#c62828", fg: "#fff" },
  REVOKED: { label: "REVOKED",           sub: "This card has been cancelled by the publisher. Not valid.", bg: "#b71c1c", fg: "#fff" },
};

function fmt(d: Date) {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

export default async function VerifyPressCardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const card = await fetchCard(token);
  if (!card) notFound();

  const live = computePressCardStatus(card);
  const ui = STATUS_UI[live];
  const dim = live !== "ACTIVE";

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader />
      <main style={{ maxWidth: 520, margin: "0 auto", padding: "28px 16px 48px" }}>
        <p style={{ fontSize: 12, letterSpacing: 2, color: "#777", fontWeight: 700, textTransform: "uppercase", marginBottom: 10 }}>
          Press card verification
        </p>

        <div role="status" aria-live="polite" style={{ background: ui.bg, color: ui.fg, borderRadius: 12, padding: "16px 18px", marginBottom: 18 }}>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 1 }}>{ui.label}</div>
          <div style={{ fontSize: 14, opacity: 0.95, marginTop: 4 }}>{ui.sub}</div>
          {card.revokedAt && (
            <div style={{ fontSize: 12, opacity: 0.9, marginTop: 6 }}>Revoked on {fmt(card.revokedAt)}</div>
          )}
        </div>

        <section style={{ background: "#fff", border: "1px solid #e5e5e5", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,.05)" }}>
          <div style={{ background: "#D50000", color: "#fff", padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 900, letterSpacing: 4, fontSize: 18 }}>PRESS</span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{card.cardNo}</span>
          </div>

          <div style={{ display: "flex", gap: 18, padding: 18, alignItems: "flex-start", filter: dim ? "grayscale(0.6)" : undefined }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={card.photoUrl}
              alt={`Photo of ${card.name}`}
              width={150}
              height={200}
              style={{ width: 150, height: 200, objectFit: "cover", borderRadius: 8, border: "2px solid #D50000", flexShrink: 0, background: "#eee" }}
            />
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.15, color: "#111", margin: 0 }}>{card.name}</h1>
              <p style={{ color: "#D50000", fontWeight: 800, fontSize: 13, letterSpacing: 0.5, textTransform: "uppercase", margin: "6px 0 14px" }}>
                {card.designation}
              </p>
              <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px", fontSize: 14, color: "#222", margin: 0 }}>
                <dt style={{ color: "#777", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Valid from</dt>
                <dd style={{ margin: 0, fontWeight: 600 }}>{fmt(card.validFrom)}</dd>
                <dt style={{ color: "#777", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Valid till</dt>
                <dd style={{ margin: 0, fontWeight: 600 }}>{fmt(card.validTill)}</dd>
              </dl>
            </div>
          </div>

          <div style={{ borderTop: "1px solid #eee", padding: "12px 18px", fontSize: 12.5, color: "#555", lineHeight: 1.5 }}>
            Issued by <strong>{PUBLISHER}</strong>, publisher of <Link href="/" style={{ color: "#D50000", fontWeight: 700 }}>Rayalaseema News</Link>.
            CIN {CIN}. The holder is authorised to gather news on behalf of Rayalaseema News only while this page shows ACTIVE.
            Always compare the photo above with the person presenting the card.
          </div>
        </section>

        <p style={{ fontSize: 12.5, color: "#666", marginTop: 16, lineHeight: 1.5 }}>
          Suspect misuse, or the photo does not match?{" "}
          <a href={`mailto:${REPORT_EMAIL}?subject=Press%20card%20${encodeURIComponent(card.cardNo)}`} style={{ color: "#D50000", fontWeight: 700 }}>
            Report to {REPORT_EMAIL}
          </a>
          . See also our <Link href="/masthead" style={{ color: "#D50000" }}>masthead</Link> and{" "}
          <Link href="/ethics-policy" style={{ color: "#D50000" }}>ethics policy</Link>.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
