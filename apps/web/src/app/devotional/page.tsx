// Spec #4 K3 (#248) - /devotional hub.
//
// Single canonical URL collecting Tirumala-Tirupati Devasthanams (TTD)
// news + Hindu festival schedules + temple-town stories. Articles
// surface by Category.slug = "devotional".
//
// Renders through the shared CategoryHubView so /devotional matches every other
// category hub (image-left lead + 2-col card grid + Trending rail). The richer
// SEO metadata below is kept since this is a hand-curated landing page.

import type { Metadata } from "next";
import { CategoryHubView } from "@/lib/category-render";

export const revalidate = 600;

const SITE_URL = process.env.SITE_URL || "https://rayalaseemanews.com";

export const metadata: Metadata = {
  title: "Devotional news - Tirumala, Tirupati, AP temples | Rayalaseema News",
  description:
    "TTD news, seva booking updates, festival schedules, and devotional stories from across Andhra Pradesh's temple towns. Tirumala, Tirupati, Srisailam, Kanipakam and more.",
  alternates: { canonical: `${SITE_URL}/devotional` },
  openGraph: {
    title: "Devotional news | రాయలసీమ న్యూస్ - భక్తి",
    url: `${SITE_URL}/devotional`,
    type: "website",
    locale: "te_IN",
  },
};

export default async function DevotionalPage() {
  return <CategoryHubView slug="devotional" />;
}
