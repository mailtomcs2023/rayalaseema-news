// Spec #4 C6 (#209) — /mission.

import type { Metadata } from "next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { buildBreadcrumbListSchema, stringifyJsonLd } from "@rayalaseema/seo-schema";

const SITE_URL = process.env.SITE_URL || "https://rayalaseemaexpress.com";

export const metadata: Metadata = {
  title: "Our Mission | రాయలసీమ ఎక్స్‌ప్రెస్",
  description:
    "Why Rayalaseema Express exists — our mission to deliver hyper-local Telugu news for the eight districts of the Rayalaseema region.",
  alternates: { canonical: `${SITE_URL}/mission` },
};

export default function MissionPage() {
  const ld = buildBreadcrumbListSchema({
    items: [{ name: "Home", url: SITE_URL }, { name: "Our Mission" }],
  });
  return (
    <div className="min-h-screen bg-gray-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(ld) }} />
      <Header />
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 16px" }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 6, color: "#111" }}>Our Mission</h1>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 24 }}>రాయలసీమ ఎక్స్‌ప్రెస్ — Why we exist</p>

        <div className="article-body" style={{ fontSize: 16, lineHeight: 1.85, color: "#333" }}>
          <p>
            Rayalaseema Express was founded to give the Rayalaseema region of Andhra Pradesh a Telugu-first news
            outlet that takes hyper-local reporting as seriously as state and national coverage. We cover eight
            districts — Kurnool, Nandyal, Anantapuramu, Sri Sathya Sai, YSR-Kadapa, Annamayya, Tirupati, and
            Chittoor — down to the mandal level.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>What we do</h2>
          <p>
            We publish original reporting from across Rayalaseema — political coverage at the constituency level,
            agricultural and mandi-price reporting for the farming community, devotional and cultural news from
            Tirumala-Tirupati and other temple towns, exam-result coverage during the academic season, cinema and
            entertainment reviews, and breaking news with the speed local readers expect.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>Why Telugu first</h2>
          <p>
            The Rayalaseema region speaks Telugu. National English-language outlets cover Andhra Pradesh sparingly
            and rarely reach below the district level. Existing Telugu state-wide outlets concentrate on Hyderabad
            and the coastal districts. Rayalaseema's news has, for decades, been served as an afterthought. We are
            the first Telugu-native digital outlet built specifically around this region.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>What we will not be</h2>
          <p>
            We will not be a propaganda outlet for any political party or community. We will not be a paid-news
            broker. We will not chase virality at the cost of accuracy. We will not publish content we cannot stand
            behind in public — every story carries a real byline and a route to feedback.
          </p>

          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 32, marginBottom: 10 }}>How we sustain this</h2>
          <p>
            Rayalaseema Express is funded through display advertising and, in time, an optional reader subscription
            for premium features. Editorial decisions are insulated from advertising; the news desk does not see
            advertiser lists or revenue figures. See our
            {" "}<a href="/ownership" style={{ color: "var(--color-brand)" }}>ownership disclosure</a> for the
            publishing-entity and funding details.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
