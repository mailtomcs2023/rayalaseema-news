// Spec #4 C3 (#206) - /corrections-policy.
//
// Linked from NewsMediaOrganization.correctionsPolicy. Lists how to request
// a correction and the timelines we commit to. Required by Google News
// Publisher Center.

import Link from "next/link";
import type { Metadata } from "next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { buildBreadcrumbListSchema, stringifyJsonLd } from "@rayalaseema/seo-schema";

const SITE_URL = process.env.SITE_URL || "https://rayalaseemaexpress.com";

export const metadata: Metadata = {
  title: "Corrections Policy | రాయలసీమ ఎక్స్‌ప్రెస్",
  description:
    "How Rayalaseema Express handles factual errors - corrections process, timelines, and how to request a correction.",
  alternates: { canonical: `${SITE_URL}/corrections-policy` },
};

export default function CorrectionsPolicyPage() {
  const ld = buildBreadcrumbListSchema({
    items: [{ name: "Home", url: SITE_URL }, { name: "Corrections Policy" }],
  });
  return (
    <div className="min-h-screen bg-gray-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(ld) }} />
      <Header />
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 16px" }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 6, color: "#111" }}>Corrections Policy</h1>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 24 }}>Last reviewed: 2026-05-27</p>

        <div className="article-body" style={{ fontSize: 16, lineHeight: 1.85, color: "#333" }}>
          <p>
            Rayalaseema Express commits to fixing factual errors promptly and transparently. Readers should never
            be left guessing whether what we publish is accurate.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>What counts as a correction</h2>
          <p>
            Anything factually wrong - a misspelled name, an incorrect date, a wrong figure, a misattributed quote.
            Opinions are not corrected; we publish responses to opinion pieces through letters to the editor.
            Clarifications are issued when an article is technically accurate but creates a misleading impression.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>How to request a correction</h2>
          <p>
            Email <a href="mailto:corrections@rayalaseemaexpress.com" style={{ color: "var(--color-brand)" }}>corrections@rayalaseemaexpress.com</a> with:
          </p>
          <ul style={{ paddingLeft: 24, marginBottom: 16 }}>
            <li>The article URL</li>
            <li>The specific sentence or claim you believe is incorrect</li>
            <li>The corrected fact + the source supporting it (link or document)</li>
            <li>Your name and how we can reach you for follow-up questions</li>
          </ul>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Our timeline</h2>
          <ul style={{ paddingLeft: 24, marginBottom: 16 }}>
            <li><strong>Within 24 hours:</strong> the editorial desk acknowledges receipt of your correction request.</li>
            <li><strong>Within 72 hours:</strong> we issue a decision - correction approved, clarification issued, or
              correction declined with a reason. If we need more time to verify (e.g. waiting on official records),
              we tell you why and give an expected resolution date.</li>
            <li><strong>Within seven days:</strong> if approved, the correction appears on the affected article + in
              our public corrections log.</li>
          </ul>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>How we publish corrections</h2>
          <p>
            When an article is corrected, the article's body is updated with the correct information, the
            "Corrections" note at the bottom of the article describes what was wrong and what changed, and the
            <code>dateModified</code> timestamp is updated. We never silently rewrite history - every correction is
            disclosed on the article.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Significant errors</h2>
          <p>
            For errors that materially change the story (e.g. naming the wrong person in a crime story), we issue a
            stand-alone correction article in addition to updating the original, push the correction notification to
            subscribers who saw the original, and notify any aggregators that picked up the wrong version.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Escalation</h2>
          <p>
            If you disagree with how we handled a correction request, escalate to the Editor-in-Chief at
            {" "}<a href="mailto:editor@rayalaseemaexpress.com" style={{ color: "var(--color-brand)" }}>editor@rayalaseemaexpress.com</a>.
            We will respond within five working days. If you remain dissatisfied, you may approach the Press Council
            of India.
          </p>

          <p style={{ marginTop: 24 }}>
            See also our <Link href="/ethics-policy" style={{ color: "var(--color-brand)" }}>ethics policy</Link>{" "}
            and <Link href="/editorial-standards" style={{ color: "var(--color-brand)" }}>editorial standards</Link>.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
