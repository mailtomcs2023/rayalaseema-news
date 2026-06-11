// Shared category-hub rendering, used by BOTH the new root resolver
// (app/[district]/page.tsx, which serves /business etc.) and the legacy
// app/category/[slug]/page.tsx (kept as a fallback; next.config redirects()
// 301s /category/* to the bare slug before it's normally reached).
//
// The browser URL is the bare slug, but TemplateRenderer is still given the
// "/category/<slug>" urlPath so the existing page-builder template assignment
// (pattern "/category/*", plus the higher-priority "/category/movie-reviews")
// keeps resolving unchanged.

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@rayalaseema/db";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { TemplateRenderer } from "@/components/blocks/template-renderer";
import { getSiteConfig, getCategoryTrending } from "@/lib/db-queries";
import { buildBreadcrumbListSchema, stringifyJsonLd } from "@rayalaseema/seo-schema";
import { categoryHref } from "@/lib/category-href";
import { SectionHub } from "@/lib/section-hub";

function siteUrl(): string {
  return process.env.SITE_URL || "https://rayalaseemanews.com";
}

export async function buildCategoryMetadata(slug: string): Promise<Metadata> {
  const cat = await prisma.category.findUnique({ where: { slug } });
  if (!cat) return { title: "Category not found" };
  const url = `${siteUrl()}${categoryHref(slug)}`;
  return {
    title: `${cat.name} | రాయలసీమ న్యూస్`,
    description: cat.description || `${cat.name} - తాజా వార్తలు, విశ్లేషణలు`,
    alternates: { canonical: url },
    openGraph: {
      title: cat.name,
      url,
      type: "website",
      locale: "te_IN",
    },
  };
}

// District-page-style category hub (same layout as /kurnool): header → lead +
// 2-col grid + rest list → sticky Trending rail, fed by this category's own
// published articles. Used for the జిల్లా వార్తలు / district-news category so it
// reads like a district hub instead of the page-builder template grid.
export async function CategoryHubView({ slug }: { slug: string }) {
  const category = await prisma.category.findUnique({ where: { slug } });
  if (!category) return notFound();

  const [config, articles, trending] = await Promise.all([
    getSiteConfig(),
    prisma.content.findMany({
      where: { categoryId: category.id, type: "ARTICLE", status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 30,
      select: { id: true, title: true, slug: true, summary: true, featuredImage: true, category: { select: { name: true, slug: true } } },
    }),
    // Trending scoped to THIS category only (not site-wide).
    getCategoryTrending(category.id, 8),
  ]);

  return (
    <SectionHub
      config={config}
      slug={slug}
      title={category.name}
      subtitle={category.nameEn}
      breadcrumbName={category.name}
      emptyLabel={category.name}
      articles={articles}
      trending={trending}
      siteUrl={siteUrl()}
    />
  );
}

export async function CategoryView({ slug }: { slug: string }) {
  const category = await prisma.category.findUnique({ where: { slug } });
  if (!category) return notFound();

  const config = await getSiteConfig();
  const breadcrumbLd = buildBreadcrumbListSchema({
    items: [
      { name: "Home", url: siteUrl() },
      { name: category.name },
    ],
  });

  return (
    <div className="min-h-screen" style={{ background: "#fff" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(breadcrumbLd) }} />
      <SiteHeader config={config} breakingNews={[]} activeSectionSlug={slug} />
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "18px 12px 48px" }}>
        {/* Spec #4 F4 (#228) - category header with name + description so
            the hub has its own content surface for crawlers. The
            TemplateRenderer-rendered article grid follows below. */}
        <header style={{ marginBottom: 18, paddingBottom: 12, borderBottom: "1px solid #e5e7eb" }}>
          {/* "Telugu - English" on one line. Font sizes unchanged: Telugu big,
              English small/grey, separated by a dash. */}
          <h1 style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 8, margin: 0 }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: "#111" }}>{category.name}</span>
            {category.nameEn && (
              <span style={{ fontSize: 13, fontWeight: 400, color: "#888" }}>- {category.nameEn}</span>
            )}
          </h1>
          {category.description && (
            <p style={{ fontSize: 15, color: "#444", marginTop: 8, lineHeight: 1.7, maxWidth: 720 }}>
              {category.description}
            </p>
          )}
        </header>
        <TemplateRenderer
          urlPath={`/category/${slug}`}
          ctx={{ categorySlug: slug }}
        />
      </main>
      <SiteFooter config={config} />
    </div>
  );
}
