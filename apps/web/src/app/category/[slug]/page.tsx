// Public category page. Layout is admin-editable via Page Builder (Spec #2).
// TemplateRenderer resolves "/category/<slug>" against the assignment table —
// the seeded /category/* assignment (#158) points it at the Standard Category
// template; /category/movie-reviews has a higher-priority assignment pointing
// at the Movie Reviews template that swaps the news rail for a CinemaBand.
//
// The previous hardcoded JSX (hero + 2x2 grid + rest list + trending rail)
// now lives inside the Template's block tree.

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@rayalaseema/db";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { TemplateRenderer } from "@/components/blocks/template-renderer";
import { getSiteConfig } from "@/lib/db-queries";
import { buildBreadcrumbListSchema, stringifyJsonLd } from "@rayalaseema/seo-schema";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const cat = await prisma.category.findUnique({ where: { slug } });
  if (!cat) return { title: "Category not found" };
  const siteUrl = process.env.SITE_URL || "https://rayalaseemaexpress.com";
  return {
    title: `${cat.name} | రాయలసీమ ఎక్స్‌ప్రెస్`,
    description: cat.description || `${cat.name} — తాజా వార్తలు, విశ్లేషణలు`,
    alternates: { canonical: `${siteUrl}/category/${slug}` },
    openGraph: {
      title: cat.name,
      url: `${siteUrl}/category/${slug}`,
      type: "website",
      locale: "te_IN",
    },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = await prisma.category.findUnique({ where: { slug } });
  if (!category) return notFound();

  const config = await getSiteConfig();

  const siteUrl = process.env.SITE_URL || "https://rayalaseemaexpress.com";
  const breadcrumbLd = buildBreadcrumbListSchema({
    items: [
      { name: "Home", url: siteUrl },
      { name: category.name },
    ],
  });

  return (
    <div className="min-h-screen" style={{ background: "#fff" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(breadcrumbLd) }} />
      <Header config={config} breakingNews={[]} />
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "18px 12px 48px" }}>
        <TemplateRenderer
          urlPath={`/category/${slug}`}
          ctx={{ categorySlug: slug }}
        />
      </main>
      <Footer config={config} />
    </div>
  );
}
