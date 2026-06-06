// Public homepage. Layout is admin-editable via Page Builder (Spec #2):
// TemplateRenderer resolves the "/" URL → assigned Template → renders block tree.
// Header + Footer stay outside the template because every page on the site
// wears them; the seed-templates script (#158) populates the default homepage
// block tree that mirrors the pre-Spec-#2 layout.

import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { MastheadAdSlot } from "@/components/masthead-ad-slot";
import { TemplateRenderer } from "@/components/blocks/template-renderer";
import { getSiteConfig } from "@/lib/db-queries";
import { getMenuItems } from "@/lib/menu";
import { prisma } from "@rayalaseema/db";

export default async function HomePage() {
  const [config, breakingRows, headerItems, mobileItems, lcpHero] = await Promise.all([
    getSiteConfig(),
    prisma.content.findMany({
      where: { type: "BREAKING_NEWS", status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, title: true },
    }),
    getMenuItems("HEADER"),
    getMenuItems("MOBILE"),
    // Resolve the same article the FeaturedCarousel first slide will
    // render so we can emit an explicit <link rel="preload"
    // fetchpriority="high"> in the document head. Lighthouse audit kept
    // flagging the hero as "LCP not preloaded" because next/image's
    // priority prop doesn't always cascade up to a head-level preload
    // when the image lives inside a Swiper SSR'd carousel.
    prisma.content.findFirst({
      where: { type: "ARTICLE", status: "PUBLISHED", featured: true },
      orderBy: { publishedAt: "desc" },
      select: { featuredImage: true },
    }),
  ]);
  const breakingNews = breakingRows.map((b) => ({ id: b.id, text: b.title }));
  // Pre-build the next/image-optimised URL at two sizes so the preload
  // hint matches what next/image will actually request. Skip when
  // there's no featured article (clean DB / cold start).
  const heroSrc = lcpHero?.featuredImage || null;
  const heroPreloadHref = heroSrc
    ? `/_next/image?url=${encodeURIComponent(heroSrc)}&w=1080&q=75`
    : null;
  const heroPreloadHrefMobile = heroSrc
    ? `/_next/image?url=${encodeURIComponent(heroSrc)}&w=750&q=75`
    : null;

  return (
    <div className="min-h-screen bg-gray-100">
      {heroPreloadHref && (
        <>
          {/* Explicit LCP image preload — fires alongside the HTML so the
            browser starts downloading the hero before it parses CSS. The
            `imagesrcset` pair lets the optimiser pick the right variant
            per viewport without forcing a second request. */}
          <link
            rel="preload"
            as="image"
            href={heroPreloadHref}
            // @ts-expect-error fetchpriority is valid React 19+ but typed lazily
            fetchpriority="high"
            imageSrcSet={heroPreloadHrefMobile ? `${heroPreloadHrefMobile} 750w, ${heroPreloadHref} 1080w` : undefined}
            imageSizes="(max-width: 768px) 100vw, 680px"
          />
        </>
      )}
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
