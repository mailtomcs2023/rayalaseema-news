// Public homepage. Layout is admin-editable via Page Builder (Spec #2):
// TemplateRenderer resolves the "/" URL → assigned Template → renders block tree.
// Header + Footer stay outside the template because every page on the site
// wears them; the seed-templates script (#158) populates the default homepage
// block tree that mirrors the pre-Spec-#2 layout.

// Cache the rendered HTML for 30s. Home page does ~10 Prisma queries
// (featured carousel + 8 district top-articles + breaking + latest +
// site config + menu). At ~400ms cold TTFB on the Azure VM, cache-warm
// requests drop to ~30ms — direct LCP win on Slow 4G PSI runs. 30s
// freshness is fine for a news front: editors who publish hot stories
// usually wait > 30s to see them surfaced anyway, and any cache miss
// after a publish self-resolves on the next revalidate tick.
export const revalidate = 30;

import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { MastheadAdSlot } from "@/components/masthead-ad-slot";
import { TemplateRenderer } from "@/components/blocks/template-renderer";
import { getSiteConfig } from "@/lib/db-queries";
import { getMenuItems } from "@/lib/menu";
import { prisma } from "@rayalaseema/db";

export default async function HomePage() {
  const [config, breakingRows, headerItems, mobileItems] = await Promise.all([
    getSiteConfig(),
    prisma.content.findMany({
      where: { type: "BREAKING_NEWS", status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, title: true },
    }),
    getMenuItems("HEADER"),
    getMenuItems("MOBILE"),
  ]);
  const breakingNews = breakingRows.map((b) => ({ id: b.id, text: b.title }));

  return (
    <div className="min-h-screen bg-gray-100">
      <Header
        config={config}
        breakingNews={breakingNews}
        headerItems={headerItems}
        mobileItems={mobileItems}
        mastheadAdSlot={<MastheadAdSlot config={config} />}
      />
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "2px 8px 0" }}>
        <TemplateRenderer urlPath="/" />
      </main>
      <SiteFooter config={config} />
    </div>
  );
}
