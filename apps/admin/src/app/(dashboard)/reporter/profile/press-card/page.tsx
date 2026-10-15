import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { ReporterEditShell } from "../_components/edit-shell";
import { getUserPressCard, issuableReason } from "@/lib/press-card/service";

const CHIP: Record<string, { bg: string; fg: string; label: string }> = {
  ACTIVE: { bg: "#dcfce7", fg: "#166534", label: "Active" },
  EXPIRED: { bg: "#fef3c7", fg: "#92400e", label: "Expired" },
  REVOKED: { bg: "#fef2f2", fg: "#dc2626", label: "Revoked" },
  SEPARATED: { bg: "#f1f5f9", fg: "#475569", label: "Former staff" },
};
const REASON: Record<string, string> = {
  KYC_NOT_VERIFIED: "Complete KYC and wait for verification. Your card is issued after that.",
  NO_PHOTO: "Upload your passport photo in KYC documents. Your card is issued after that.",
};

export default async function ReporterPressCardPage() {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;
  if (!userId) redirect("/login");
  if (role !== "REPORTER") redirect("/");
  const [card, user] = await Promise.all([
    getUserPressCard(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { reporterProfile: { select: { kycStatus: true, photoUrl: true } } } }),
  ]);
  const reason = issuableReason(user?.reporterProfile ?? null, card);

  return (
    <ReporterEditShell title="Press ID card">
      <div style={{ display: "grid", gap: 14 }}>
        {card ? (
          <>
            <div style={{ display: "flex", gap: 14, background: "#fff", border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={card.photoUrl} alt="" style={{ width: 84, height: 112, objectFit: "cover", borderRadius: 8, border: "2px solid #D50000" }} />
              <div style={{ fontSize: 14 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{card.name}</div>
                <div style={{ color: "#D50000", fontWeight: 700 }}>{card.designation}</div>
                <div style={{ marginTop: 6 }}>{card.cardNo}</div>
                <div style={{ color: "#666" }}>Valid {card.validFrom} → {card.validTill}</div>
                <span style={{ display: "inline-block", marginTop: 8, padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800, background: CHIP[card.liveStatus].bg, color: CHIP[card.liveStatus].fg }}>{CHIP[card.liveStatus].label}</span>
              </div>
            </div>
            {card.liveStatus === "ACTIVE" ? (
              <a href={`/api/press-card/${card.id}/pdf`} style={{ display: "block", textAlign: "center", background: "#D50000", color: "#fff", fontWeight: 800, padding: 14, borderRadius: 10, textDecoration: "none" }}>Download card (PDF)</a>
            ) : (
              <p style={{ fontSize: 13, color: "#666" }}>
                {card.liveStatus === "EXPIRED" && "Your card has expired. Ask the editor to renew it."}
                {card.liveStatus === "REVOKED" && `This card was revoked${card.revokeNote ? ` (${card.revokeNote})` : ""}. Ask the editor for a new one.`}
                {card.liveStatus === "SEPARATED" && "Your employment has ended, so the card is no longer valid."}
              </p>
            )}
            <a href={card.verifyUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "#D50000" }}>Open public verify page</a>
          </>
        ) : (
          <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 12, padding: 16, fontSize: 14 }}>
            <p style={{ fontWeight: 800, marginBottom: 6 }}>Your card has not been issued yet</p>
            <p style={{ color: "#666" }}>{REASON[reason ?? ""] ?? "The editor will issue your card shortly."}</p>
            {reason === "KYC_NOT_VERIFIED" || reason === "NO_PHOTO" ? <Link href="/reporter/profile/kyc" style={{ color: "#D50000", fontWeight: 700 }}>Go to KYC documents →</Link> : null}
          </div>
        )}
      </div>
    </ReporterEditShell>
  );
}
