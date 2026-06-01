// Spec #4 C8 (#211) - /ownership.
//
// Linked from NewsMediaOrganization.ownershipFundingInfo. Required for
// Google News Publisher Center transparency review.

import Link from "next/link";
import type { Metadata } from "next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { buildBreadcrumbListSchema, stringifyJsonLd } from "@rayalaseema/seo-schema";

const SITE_URL = process.env.SITE_URL || "https://rayalaseemanews.com";

export const metadata: Metadata = {
  title: "Ownership & Funding | రాయలసీమ న్యూస్",
  description:
    "Who owns Rayalaseema News, how we are funded, and which related properties we operate.",
  alternates: { canonical: `${SITE_URL}/ownership` },
};

export default function OwnershipPage() {
  const ld = buildBreadcrumbListSchema({
    items: [{ name: "Home", url: SITE_URL }, { name: "Ownership & Funding" }],
  });
  return (
    <div className="min-h-screen bg-gray-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(ld) }} />
      <Header />
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 16px" }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 6, color: "#111" }}>Ownership & Funding</h1>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 24 }}>Last reviewed: 2026-05-27</p>

        <div className="article-body" style={{ fontSize: 16, lineHeight: 1.85, color: "#333" }}>
          <p>
            Rayalaseema News is published by Medha Hosting OPC Pvt Ltd, an Indian private limited company
            registered in Andhra Pradesh. This page discloses ownership, funding sources, and related properties.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Publishing entity</h2>
          <p>
            <strong>Medha Hosting OPC Pvt Ltd</strong> &mdash; an Indian One Person Company (OPC) registered with the
            Ministry of Corporate Affairs. The company is registered for the operation of digital news publications
            and related technology services. Registered office and CIN details are available on request from the
            editorial address below; we publish them on this page once the full filing record is complete.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Editorial independence</h2>
          <p>
            Editorial decisions at Rayalaseema News are taken by the editorial team described on our
            {" "}<Link href="/masthead" style={{ color: "var(--color-brand)" }}>masthead</Link>{" "}
            page. The publishing company does not direct day-to-day editorial choices; the Editor-in-Chief carries
            final responsibility for content. The news desk operates without access to advertiser lists or revenue
            figures.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Funding sources</h2>
          <p>
            Rayalaseema News is funded primarily through:
          </p>
          <ul style={{ paddingLeft: 24, marginBottom: 16 }}>
            <li>Display advertising served via Google AdSense and direct advertiser relationships</li>
            <li>Sponsored content clearly labelled as such (see our <Link href="/ethics-policy" style={{ color: "var(--color-brand)" }}>ethics policy</Link>)</li>
            <li>Reader contributions, when a contribution programme is operational (see below)</li>
          </ul>
          <p>
            We do not receive funding from political parties, foreign governments, or industry associations whose
            members we cover. We disclose any funding source above ₹1,00,000 from a single donor on this page
            within 30 days of receipt.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Related properties</h2>
          <p>
            Medha Hosting OPC Pvt Ltd operates additional digital properties unrelated to news, including hosting,
            cloud-infrastructure, and Microsoft 365 partner services. None of those properties are involved in
            editorial decisions for Rayalaseema News.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Conflicts of interest</h2>
          <p>
            When we report on Medha Hosting, its directors, or any related entity, we disclose the relationship
            inside the article and have an independent editor sign off. Stories that materially affect related
            parties are escalated to the Editor-in-Chief.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Contact</h2>
          <p>
            Press, legal, and ownership inquiries: <a href="mailto:editor@rayalaseemanews.com" style={{ color: "var(--color-brand)" }}>editor@rayalaseemanews.com</a>.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
