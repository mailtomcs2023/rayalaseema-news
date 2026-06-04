// Spec #4 C5 (#208) - /diversity-policy.

import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { buildBreadcrumbListSchema, stringifyJsonLd } from "@rayalaseema/seo-schema";

const SITE_URL = process.env.SITE_URL || "https://rayalaseemanews.com";

export const metadata: Metadata = {
  title: "Diversity Policy | రాయలసీమ న్యూస్",
  description:
    "Rayalaseema News diversity policy - coverage diversity, hiring practices, and our commitment to representation across the 8 districts.",
  alternates: { canonical: `${SITE_URL}/diversity-policy` },
};

export default function DiversityPolicyPage() {
  const ld = buildBreadcrumbListSchema({
    items: [{ name: "Home", url: SITE_URL }, { name: "Diversity Policy" }],
  });
  return (
    <div className="min-h-screen bg-gray-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(ld) }} />
      <SiteHeader />
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 16px" }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 6, color: "#111" }}>Diversity Policy</h1>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 24 }}>Last reviewed: 2026-05-27</p>

        <div className="article-body" style={{ fontSize: 16, lineHeight: 1.85, color: "#333" }}>
          <p>
            Rayalaseema News is committed to representing the full breadth of the eight districts we cover -
            Kurnool, Nandyal, Anantapuramu, Sri Sathya Sai, YSR-Kadapa, Annamayya, Tirupati, Chittoor - across
            geography, gender, caste, religion, language, and economic background.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Coverage diversity</h2>
          <p>
            We track our coverage across districts and constituencies to ensure no area is systematically
            under-reported. Hyper-local stories - village panchayats, mandal-level disputes, single-school issues -
            sit alongside district and state coverage. We publish news in Telugu by default with English summaries
            so non-Telugu speakers can follow Rayalaseema stories.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Source diversity</h2>
          <p>
            When reporting on policy, politics, business, or community issues, we aim for source diversity that
            reflects the people affected. We push back against all-male source lists, single-caste source lists,
            and English-medium-only expert lists. Reporters log source demographics weekly so editors can spot
            patterns.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Hiring</h2>
          <p>
            Job postings are open to candidates regardless of gender, caste, religion, mother tongue, or
            disability. We actively seek reporters from under-represented districts (currently Annamayya and Sri
            Sathya Sai) and reporters who can report from rural and tribal areas. Internship and reporter-trainee
            programmes prioritise first-generation journalists from the Rayalaseema region.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Language and accessibility</h2>
          <p>
            Articles use plain Telugu accessible to readers across education levels. We avoid English jargon where
            a Telugu word exists; we explain Telugu technical terms (legal, agricultural, administrative) on first
            use. Our site supports screen-reader navigation and respects users who reduce motion or increase
            contrast in their browser.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Coverage of marginalised groups</h2>
          <p>
            Coverage of Dalit, Adivasi, religious-minority, gender-minority, and disabled communities is anchored in
            the lives and voices of those communities, not in second-hand commentary. We report on routine community
            life, not only when crisis or violence makes a story unavoidable.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Annual review</h2>
          <p>
            The editorial team reviews coverage and hiring patterns annually. Findings - including where we fell
            short - are summarised in a public annual report.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
