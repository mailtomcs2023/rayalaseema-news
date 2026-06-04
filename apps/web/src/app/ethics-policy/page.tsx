// Spec #4 C2 (#205) - /ethics-policy.
//
// Linked from NewsMediaOrganization.ethicsPolicy in the root layout JSON-LD.
// Required for Google News Publisher Center approval and a primary E-E-A-T
// signal for AI search engines.

import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { buildBreadcrumbListSchema, stringifyJsonLd } from "@rayalaseema/seo-schema";

const SITE_URL = process.env.SITE_URL || "https://rayalaseemanews.com";

export const metadata: Metadata = {
  title: "Ethics Policy | రాయలసీమ న్యూస్",
  description:
    "Rayalaseema News ethics policy - sourcing standards, conflict of interest, anonymous sources, gifts, and paid content disclosure.",
  alternates: { canonical: `${SITE_URL}/ethics-policy` },
};

export default function EthicsPolicyPage() {
  const ld = buildBreadcrumbListSchema({
    items: [{ name: "Home", url: SITE_URL }, { name: "Ethics Policy" }],
  });
  return (
    <div className="min-h-screen bg-gray-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(ld) }} />
      <SiteHeader />
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 16px" }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 6, color: "#111" }}>Ethics Policy</h1>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 24 }}>Last reviewed: 2026-05-27</p>

        <div className="article-body" style={{ fontSize: 16, lineHeight: 1.85, color: "#333" }}>
          <p>
            Rayalaseema News commits to honest, accurate, and independent journalism for the Rayalaseema region.
            Our ethics policy sets the standards every reporter, editor, and contributor follows. We treat these as
            commitments to our readers, not internal guidelines.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Accuracy and verification</h2>
          <p>
            Every factual claim is verified before publication. We prefer primary sources - official records,
            on-the-record interviews, named sources - over secondary reporting. When we rely on another publication,
            we attribute the original outlet and link to it where possible. We do not publish claims that cannot be
            verified, even if other outlets have.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Independence</h2>
          <p>
            Rayalaseema News is independent of any political party, government office, or corporate interest.
            No reporter or editor may accept gifts, paid travel, or favours from sources, parties, or PR agencies
            whose work they cover. Reporters disclose any personal connection - family, financial, or social - to
            the subject of a story before reporting it.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Anonymous sources</h2>
          <p>
            We use anonymous sources only when (a) the information is in the public interest, (b) it cannot
            reasonably be obtained on the record, and (c) the source faces credible risk if named. An anonymous
            source must be known to at least one editor, who decides whether the source's information meets our
            evidence bar. We describe the source's position generically (e.g. "a senior official in the Kurnool
            collectorate") so readers can judge credibility without exposing the source's identity.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Sponsored content</h2>
          <p>
            Any article that is paid for by an external party - advertorial, sponsored content, branded campaign -
            is clearly labelled "Sponsored" at the top of the article and excluded from the news desks. Sponsored
            content is never written by the news team and never carries an editorial byline. Editors retain the
            right to refuse sponsored content that conflicts with our editorial values.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>AI-assisted reporting</h2>
          <p>
            We use AI tools to translate, summarise, and check facts in our reporting workflow. Every AI-assisted
            article is reviewed by a human editor before publication. We do not publish AI-generated images, AI
            voice clones, or AI-generated quotes attributed to real people. When a graphic or chart is AI-generated,
            we label it as such.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Plagiarism and attribution</h2>
          <p>
            We do not publish text, photographs, video, or audio from other publications without permission or fair-use
            attribution. Embedded social media posts include a clearly visible source label and link. Reporters who
            plagiarise are subject to disciplinary action up to and including termination.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Reporting on minors and victims</h2>
          <p>
            We do not name or photographically identify minors involved in crime, violence, abuse, or family
            disputes without explicit consent from a parent or legal guardian. Survivors of sexual violence are
            never named in our reporting, in accordance with Indian law (Section 228A IPC).
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>How to report a violation</h2>
          <p>
            If you believe Rayalaseema News has violated this policy, email
            {" "}<a href="mailto:ethics@rayalaseemanews.com" style={{ color: "var(--color-brand)" }}>ethics@rayalaseemanews.com</a>{" "}
            with the article URL and a description of the concern. Complaints are reviewed by the Editor-in-Chief
            within five working days. See also our
            {" "}<Link href="/corrections-policy" style={{ color: "var(--color-brand)" }}>corrections policy</Link>{" "}
            for factual errors and our
            {" "}<Link href="/feedback-policy" style={{ color: "var(--color-brand)" }}>feedback policy</Link>{" "}
            for other concerns.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
