// Spec #4 C1 (#204) — /masthead public page.
//
// Editorial transparency surface required by Google News Publisher Center +
// E-E-A-T scoring. Lists the editorial team with role, bio, photo. Sourced
// from User rows with editorial roles (ADMIN / EDITOR / CHIEF_SUB_EDITOR /
// SUB_EDITOR). REPORTER role is intentionally excluded — reporters have
// their own /author/<slug> profiles but don't appear on the masthead.

import Link from "next/link";
import type { Metadata } from "next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { prisma } from "@rayalaseema/db";
import { buildBreadcrumbListSchema, stringifyJsonLd } from "@rayalaseema/seo-schema";

const SITE_URL = process.env.SITE_URL || "https://rayalaseemaexpress.com";

export const metadata: Metadata = {
  title: "Masthead | రాయలసీమ ఎక్స్‌ప్రెస్",
  description:
    "Editorial team and leadership of Rayalaseema Express — Editor-in-Chief, desk leads, and editorial staff covering Rayalaseema regional news.",
  alternates: { canonical: `${SITE_URL}/masthead` },
  openGraph: { title: "Masthead", url: `${SITE_URL}/masthead`, type: "profile", locale: "te_IN" },
};

const ROLE_ORDER: Record<string, number> = {
  ADMIN: 1,
  EDITOR: 2,
  CHIEF_SUB_EDITOR: 3,
  SUB_EDITOR: 4,
};

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Editor-in-Chief",
  EDITOR: "Editor",
  CHIEF_SUB_EDITOR: "Chief Sub-Editor",
  SUB_EDITOR: "Sub-Editor",
};

export default async function MastheadPage() {
  const team = await prisma.user.findMany({
    where: {
      active: true,
      role: { in: ["ADMIN", "EDITOR", "CHIEF_SUB_EDITOR", "SUB_EDITOR"] },
    },
    select: {
      id: true, name: true, bio: true, avatar: true, role: true,
      publicProfileSlug: true, twitterHandle: true, linkedinUrl: true,
      expertise: true,
    },
  });
  team.sort((a, b) => (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99));

  const breadcrumbLd = buildBreadcrumbListSchema({
    items: [
      { name: "Home", url: SITE_URL },
      { name: "Masthead" },
    ],
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(breadcrumbLd) }} />
      <Header />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 16px" }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 6, color: "#111" }}>Masthead</h1>
        <p style={{ fontSize: 14, color: "#888", marginBottom: 32 }}>
          The editorial team behind Rayalaseema Express. Last updated: rolling — staff is added or removed as roles change.
        </p>

        <p style={{ fontSize: 15, color: "#444", lineHeight: 1.8, marginBottom: 32 }}>
          Editorial decisions at Rayalaseema Express are made by the team listed below. The Editor-in-Chief carries final
          responsibility for everything published. The masthead is updated whenever staff change roles or join the team.
          Reporters are not listed here — they appear on their individual <Link href="/author" style={{ color: "var(--color-brand)" }}>author profiles</Link>.
        </p>

        {team.length === 0 ? (
          <p style={{ fontSize: 14, color: "#888", padding: 24, textAlign: "center" }}>
            Masthead is being assembled. Check back shortly.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
            {team.map((m) => (
              <div key={m.id} style={{ background: "#fff", borderRadius: 12, padding: 24, display: "flex", gap: 20, alignItems: "flex-start", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--color-brand)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 32, fontWeight: 900, overflow: "hidden" }}>
                  {m.avatar ? <img src={m.avatar} alt={m.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : m.name.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                    <h2 style={{ fontSize: 20, fontWeight: 800, color: "#111" }}>
                      {m.publicProfileSlug ? (
                        <Link href={`/author/${m.publicProfileSlug}`} style={{ color: "#111", textDecoration: "none" }}>{m.name}</Link>
                      ) : (
                        m.name
                      )}
                    </h2>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 4, background: "#fef3c7", color: "#92400e", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {ROLE_LABEL[m.role] || m.role}
                    </span>
                  </div>
                  {m.bio && <p style={{ fontSize: 14, color: "#555", marginTop: 8, lineHeight: 1.7 }}>{m.bio}</p>}
                  {m.expertise.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                      {m.expertise.map((tag) => (
                        <span key={tag} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "#f3f4f6", color: "#555" }}>{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <section style={{ marginTop: 48, paddingTop: 32, borderTop: "1px solid #e5e7eb" }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "#111", marginBottom: 12 }}>How to reach the editorial team</h2>
          <p style={{ fontSize: 15, color: "#444", lineHeight: 1.8 }}>
            For story tips, corrections, complaints, or general feedback, contact the editorial desk at
            {" "}<a href="mailto:editor@rayalaseemaexpress.com" style={{ color: "var(--color-brand)" }}>editor@rayalaseemaexpress.com</a>.
            See our <Link href="/feedback-policy" style={{ color: "var(--color-brand)" }}>feedback policy</Link> for response timelines and our
            {" "}<Link href="/corrections-policy" style={{ color: "var(--color-brand)" }}>corrections policy</Link> for how we handle errors.
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
