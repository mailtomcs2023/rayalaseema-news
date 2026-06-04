// Spec #4 C7 (#210) - /feedback-policy.

import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { buildBreadcrumbListSchema, stringifyJsonLd } from "@rayalaseema/seo-schema";

const SITE_URL = process.env.SITE_URL || "https://rayalaseemanews.com";

export const metadata: Metadata = {
  title: "Feedback Policy | రాయలసీమ న్యూస్",
  description:
    "How Rayalaseema News handles reader feedback - channels, response timelines, and escalation paths.",
  alternates: { canonical: `${SITE_URL}/feedback-policy` },
};

export default function FeedbackPolicyPage() {
  const ld = buildBreadcrumbListSchema({
    items: [{ name: "Home", url: SITE_URL }, { name: "Feedback Policy" }],
  });
  return (
    <div className="min-h-screen bg-gray-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(ld) }} />
      <SiteHeader />
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 16px" }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 6, color: "#111" }}>Feedback Policy</h1>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 24 }}>Last reviewed: 2026-05-27</p>

        <div className="article-body" style={{ fontSize: 16, lineHeight: 1.85, color: "#333" }}>
          <p>
            Reader feedback shapes how Rayalaseema News improves. We treat every message as a signal - even
            short ones - and respond within published timelines.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>How to reach us</h2>
          <ul style={{ paddingLeft: 24, marginBottom: 16 }}>
            <li><strong>Story tips, corrections, complaints:</strong> <a href="mailto:editor@rayalaseemanews.com" style={{ color: "var(--color-brand)" }}>editor@rayalaseemanews.com</a></li>
            <li><strong>Factual corrections:</strong> <a href="mailto:corrections@rayalaseemanews.com" style={{ color: "var(--color-brand)" }}>corrections@rayalaseemanews.com</a> (see <Link href="/corrections-policy" style={{ color: "var(--color-brand)" }}>corrections policy</Link>)</li>
            <li><strong>Ethics violations:</strong> <a href="mailto:ethics@rayalaseemanews.com" style={{ color: "var(--color-brand)" }}>ethics@rayalaseemanews.com</a> (see <Link href="/ethics-policy" style={{ color: "var(--color-brand)" }}>ethics policy</Link>)</li>
            <li><strong>Reader letters / opinion submissions:</strong> <a href="mailto:letters@rayalaseemanews.com" style={{ color: "var(--color-brand)" }}>letters@rayalaseemanews.com</a></li>
            <li><strong>Privacy / data requests:</strong> see our <Link href="/privacy" style={{ color: "var(--color-brand)" }}>privacy policy</Link></li>
            <li><strong>Technical issues with the site:</strong> <a href="mailto:support@rayalaseemanews.com" style={{ color: "var(--color-brand)" }}>support@rayalaseemanews.com</a></li>
          </ul>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Response timelines</h2>
          <ul style={{ paddingLeft: 24, marginBottom: 16 }}>
            <li><strong>Factual corrections:</strong> acknowledged in 24 hours, decided in 72 hours, published within seven days.</li>
            <li><strong>Ethics complaints:</strong> acknowledged in 48 hours, investigated and decided within ten working days.</li>
            <li><strong>Privacy / data requests:</strong> acknowledged in 72 hours, fulfilled within 30 days as required by law.</li>
            <li><strong>General feedback / letters:</strong> acknowledged within seven working days. Selected letters are published with the reader's name and city; opt out of publication when you write.</li>
            <li><strong>Technical issues:</strong> acknowledged in 24 hours, resolution depends on complexity.</li>
          </ul>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>What we do not respond to</h2>
          <p>
            We do not respond to anonymous abuse, bulk-template messages, or messages whose only content is
            "remove this article". We do reply to legitimate takedown requests that cite a specific legal basis -
            send those to <a href="mailto:editor@rayalaseemanews.com" style={{ color: "var(--color-brand)" }}>editor@rayalaseemanews.com</a>.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Escalation</h2>
          <p>
            If you are not satisfied with how editorial staff handled your feedback, escalate to the Editor-in-Chief
            (same email as editor@ above) and mark the subject "Escalation". If you remain dissatisfied, the Press
            Council of India is the statutory body that handles complaints against Indian newspapers and online news
            publications.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
