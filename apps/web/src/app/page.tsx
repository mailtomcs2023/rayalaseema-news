// Public homepage. Layout is admin-editable via Page Builder (Spec #2):
// TemplateRenderer resolves the "/" URL → assigned Template → renders block tree.
// Header + Footer stay outside the template because every page on the site
// wears them; the seed-templates script (#158) populates the default homepage
// block tree that mirrors the pre-Spec-#2 layout.

import { cookies } from "next/headers";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { MarketTickerServer } from "@/components/market-ticker-server";
import { MastheadAdSlot } from "@/components/masthead-ad-slot";
import { TemplateRenderer } from "@/components/blocks/template-renderer";
import { getSiteConfig } from "@/lib/db-queries";
import { prisma } from "@rayalaseema/db";

export default async function HomePage() {
  const cookieStore = await cookies();
  const myDistrictSlug = cookieStore.get("my-district")?.value || null;

  const [config, breakingRows] = await Promise.all([
    getSiteConfig(),
    prisma.content.findMany({
      where: { type: "BREAKING_NEWS", status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, title: true },
    }),
  ]);
  const breakingNews = breakingRows.map((b) => ({ id: b.id, text: b.title }));

  return (
    <div className="min-h-screen bg-gray-100">
      <Header
        config={config}
        breakingNews={breakingNews}
        tickerSlot={<MarketTickerServer />}
        mastheadAdSlot={<MastheadAdSlot config={config} />}
      />
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "2px 8px 0" }}>
        <TemplateRenderer urlPath="/" ctx={{ districtSlug: myDistrictSlug }} />
      </main>
      <Footer config={config} />
    </div>
  );
}
