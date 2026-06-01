// Spec #4 F3 (#227) — mandal hub page at /[district]/[constituency]/[mandal].
//
// Lightest hub tier — mandals don't have their own MLA, lat/lng often
// missing from OSM, and article tagging by mandal won't fill out until
// Phase G2 (NER auto-tagging on publish) lands. Until then this page
// falls through to the parent constituency's article list so it's never
// dead.
//
// URL collision note: the [slugid] route at
// /[district]/[constituency]/[slugid] also matches three-segment URLs.
// Next.js resolves by file specificity — the [mandal] segment is the
// less-specific catch-all here, so we must explicitly detect an article
// slug (ends with -<id8>) and 404 if matched here, OR detect mandal
// existence before rendering article-shape URLs through this route.
//
// Resolution: this route checks Mandal.slug first; if no match, fall
// through to notFound() and Next routes to /news/[slugid] or the article
// slugid route. We rely on Mandal.slug being distinct from article slugs
// (mandal slugs are short like "kurnool" / "chandragiri"; article slugs
// always end with -<8-char-id> which mandal slugs never do).

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@rayalaseema/db";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { articleHref } from "@/lib/article-href";
import { buildBreadcrumbListSchema, stringifyJsonLd } from "@rayalaseema/seo-schema";

const SITE_URL = process.env.SITE_URL || "https://rayalaseemanews.com";

// Route shape: /[district]/[constituency]/mandal/[slug]. The /mandal/ prefix
// was added when this hub clashed with the article slugid route at the same
// depth — both /district/constituency/<x> patterns collided.
type Params = Promise<{ district: string; constituency: string; slug: string }>;

// Article slug pattern (from articleHref): "<text>-<8 hex>". Now lives at a
// different path so the looksLikeArticleSlug guard is no longer load-bearing
// for disambiguation — kept as a defensive 404 for someone visiting a
// hand-crafted /mandal/<articleslug> URL.
function looksLikeArticleSlug(s: string): boolean {
  return /-[a-z0-9]{8}$/.test(s);
}

async function resolveMandal(params: { district: string; constituency: string; slug: string }) {
  if (looksLikeArticleSlug(params.slug)) return null;
  return prisma.mandal.findUnique({
    where: { slug: params.slug },
    select: {
      id: true, name: true, nameEn: true, slug: true, lat: true, lng: true,
      population: true, isMandalHq: true,
      constituency: {
        select: {
          slug: true, name: true, nameEn: true,
          district: { select: { slug: true, name: true, nameEn: true } },
        },
      },
    },
  }).catch(() => null);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const p = await params;
  const mandal = await resolveMandal(p);
  if (!mandal) return { title: "Not found" };
  return {
    title: `${mandal.name} (${mandal.nameEn}) | Rayalaseema News News`,
    description: `${mandal.name} మండలం నుండి తాజా వార్తలు. News from ${mandal.nameEn} mandal in ${mandal.constituency.district.nameEn} district.`,
    alternates: { canonical: `${SITE_URL}/${p.district}/${p.constituency}/mandal/${p.slug}` },
    openGraph: {
      title: `${mandal.name} | రాయలసీమ న్యూస్`,
      url: `${SITE_URL}/${p.district}/${p.constituency}/mandal/${p.slug}`,
      type: "website",
      locale: "te_IN",
    },
  };
}

export default async function MandalPage({ params }: { params: Params }) {
  const p = await params;
  const mandal = await resolveMandal(p);
  if (!mandal) return notFound();
  // Verify the URL chain — mandal slug must belong to the constituency named
  // in the URL, which in turn must belong to the named district.
  if (
    mandal.constituency.slug !== p.constituency ||
    mandal.constituency.district.slug !== p.district
  ) {
    return notFound();
  }

  // Articles tagged to this mandal's constituency. Mandal-level tagging
  // becomes meaningful after G1 NER lands (#231); for now we surface
  // constituency-level articles so the page is never empty.
  const articles = await prisma.content.findMany({
    where: {
      type: "ARTICLE",
      status: "PUBLISHED",
      OR: [
        { title: { contains: mandal.nameEn, mode: "insensitive" } },
        { title: { contains: mandal.name } },
        { constituencyId: mandal.constituency.slug ? undefined : undefined }, // placeholder; full mandal join lands in G2
      ],
    },
    include: {
      category: { select: { name: true, nameEn: true, slug: true, color: true } },
      constituency: { select: { slug: true, district: { select: { slug: true } } } },
    },
    orderBy: { publishedAt: "desc" },
    take: 20,
  });

  // Fall back to constituency articles if mandal-specific matches are thin.
  let displayed = articles;
  if (articles.length < 3) {
    displayed = await prisma.content.findMany({
      where: {
        type: "ARTICLE", status: "PUBLISHED",
        constituency: { slug: mandal.constituency.slug },
      },
      include: {
        category: { select: { name: true, nameEn: true, slug: true, color: true } },
        constituency: { select: { slug: true, district: { select: { slug: true } } } },
      },
      orderBy: { publishedAt: "desc" },
      take: 20,
    });
  }

  const breadcrumbLd = buildBreadcrumbListSchema({
    items: [
      { name: "Home", url: SITE_URL },
      { name: mandal.constituency.district.name, url: `${SITE_URL}/district/${p.district}` },
      { name: mandal.constituency.name, url: `${SITE_URL}/constituency/${p.constituency}` },
      { name: mandal.name },
    ],
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(breadcrumbLd) }} />
      <Header />
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 12px" }}>
        <nav style={{ fontSize: 13, color: "#888", marginBottom: 12 }}>
          <Link href="/" style={{ color: "#888", textDecoration: "none" }}>Home</Link>
          <span> / </span>
          <Link href={`/district/${p.district}`} style={{ color: "#888", textDecoration: "none" }}>{mandal.constituency.district.name}</Link>
          <span> / </span>
          <Link href={`/constituency/${p.constituency}`} style={{ color: "#888", textDecoration: "none" }}>{mandal.constituency.name}</Link>
          <span> / </span>
          <span style={{ color: "#333" }}>{mandal.name}</span>
        </nav>

        <header style={{ borderBottom: "3px solid var(--color-brand)", paddingBottom: 14, marginBottom: 24 }}>
          <h1 style={{ fontSize: 30, fontWeight: 900, color: "var(--color-brand)" }}>{mandal.name}</h1>
          <p style={{ fontSize: 14, color: "#666", marginTop: 4 }}>
            {mandal.nameEn}
            {mandal.isMandalHq && <span style={{ marginLeft: 8, fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "#fef3c7", color: "#92400e" }}>Mandal HQ</span>}
            {" "}· {mandal.constituency.nameEn} constituency · {mandal.constituency.district.nameEn} district
            {mandal.population ? ` · Population ${mandal.population.toLocaleString()}` : ""}
          </p>
        </header>

        {displayed.length === 0 ? (
          <p style={{ fontSize: 14, color: "#888", padding: 24, textAlign: "center" }}>
            No articles tagged to {mandal.nameEn} yet. Constituency news at{" "}
            <Link href={`/constituency/${p.constituency}`} style={{ color: "var(--color-brand)" }}>{mandal.constituency.nameEn}</Link>.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {displayed.map((a) => (
              <Link key={a.id} href={articleHref(a)} style={{ textDecoration: "none" }}>
                <div style={{ background: "#fff", borderRadius: 8, overflow: "hidden", border: "1px solid #eee" }}>
                  {a.featuredImage && (
                    <img src={a.featuredImage} alt="" style={{ width: "100%", aspectRatio: "16/10", objectFit: "cover" }} loading="lazy" />
                  )}
                  <div style={{ padding: 12 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: a.category?.color || "#888", padding: "1px 6px", borderRadius: 3 }}>
                      {a.category?.nameEn}
                    </span>
                    <h3 style={{ fontSize: 15, fontWeight: 800, color: "#000", lineHeight: 1.5, marginTop: 6 }}>{a.title}</h3>
                    <p style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
                      {a.publishedAt ? new Date(a.publishedAt).toLocaleDateString("te-IN") : ""}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
