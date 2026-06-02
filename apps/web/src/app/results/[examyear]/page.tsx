// Spec #4 K6 (#251) - /results/<exam>-<year> exam-result live-blog template.
//
// One URL per exam-year. Editor pre-creates the article in admin as a
// Content row with category=exam-results, slug=<exam>-<year>-results,
// and toggles isLive=true (K5 ContentLiveBlog row). Reporter appends
// entries as results land (school-wise pass rates, topper interviews,
// district highlights). This route surfaces the live blog if it exists,
// otherwise 404s.

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@rayalaseema/db";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { buildBreadcrumbListSchema, buildLiveBlogPostingSchema, stringifyJsonLd } from "@rayalaseema/seo-schema";

const SITE_URL = process.env.SITE_URL || "https://rayalaseemanews.com";

type Params = Promise<{ examyear: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { examyear } = await params;
  const slug = `${examyear}-results`;
  const content = await prisma.content.findUnique({
    where: { slug },
    select: { title: true, summary: true, featuredImage: true },
  });
  if (!content) return { title: "Exam results not found" };
  return {
    title: `${content.title} | Rayalaseema News`,
    description: content.summary || content.title,
    alternates: { canonical: `${SITE_URL}/results/${examyear}` },
    openGraph: {
      title: content.title,
      url: `${SITE_URL}/results/${examyear}`,
      type: "article",
      locale: "te_IN",
      images: content.featuredImage ? [{ url: content.featuredImage }] : undefined,
    },
  };
}

interface LiveEntryStored {
  at: string;
  headline?: string;
  html: string;
  image?: string;
}

export default async function ExamResultsPage({ params }: { params: Params }) {
  const { examyear } = await params;
  const slug = `${examyear}-results`;
  const content = await prisma.content.findFirst({
    where: { slug, type: "ARTICLE", status: "PUBLISHED" },
    include: {
      author: { select: { name: true, publicProfileSlug: true, avatar: true, bio: true, role: true, twitterHandle: true, linkedinUrl: true, facebookUrl: true, expertise: true, affiliations: true } },
      liveBlog: true,
    },
  });
  if (!content) return notFound();

  const live = content.liveBlog;
  const entries: LiveEntryStored[] = live ? (live.entries as unknown as LiveEntryStored[]) : [];

  const breadcrumbLd = buildBreadcrumbListSchema({
    items: [
      { name: "Home", url: SITE_URL },
      { name: "Results", url: `${SITE_URL}/exam-results` },
      { name: content.title },
    ],
  });

  const liveBlogLd = live ? buildLiveBlogPostingSchema({
    title: content.title,
    summary: content.summary,
    startedAt: live.startedAt.toISOString(),
    endedAt: live.endedAt?.toISOString() ?? null,
    coverImage: content.featuredImage,
    entries: entries.map((e) => ({ at: e.at, headline: e.headline, html: e.html, image: e.image })),
    author: {
      name: content.author.name,
      publicProfileSlug: content.author.publicProfileSlug || "author",
      role: content.author.role,
      bio: content.author.bio,
      avatar: content.author.avatar,
      twitterHandle: content.author.twitterHandle,
      linkedinUrl: content.author.linkedinUrl,
      facebookUrl: content.author.facebookUrl,
      expertise: content.author.expertise,
      affiliations: content.author.affiliations,
    },
    publisher: {
      siteUrl: SITE_URL,
      publicationName: "Rayalaseema News",
      publicationNameTe: "రాయలసీమ న్యూస్ - వార్తలు",
      logoUrl: `${SITE_URL}/logo.png`,
    },
    canonicalUrl: `${SITE_URL}/results/${examyear}`,
  }) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(breadcrumbLd) }} />
      {liveBlogLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(liveBlogLd) }} />}
      <Header />
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 16px" }}>
        {live && !live.endedAt && (
          <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: 4, background: "#dc2626", color: "#fff", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            ● Live
          </span>
        )}
        <h1 style={{ fontSize: 32, fontWeight: 900, color: "#111", marginTop: 8 }}>{content.title}</h1>
        {content.summary && <p style={{ fontSize: 16, color: "#444", marginTop: 8, lineHeight: 1.7 }}>{content.summary}</p>}
        <p style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
          {content.author.name} · {content.publishedAt ? new Date(content.publishedAt).toLocaleString("en-IN") : ""}
        </p>

        {content.featuredImage && (
          <img src={content.featuredImage} alt={content.title} style={{ width: "100%", borderRadius: 8, marginTop: 16 }} />
        )}

        <div className="article-body" style={{ marginTop: 24, fontSize: 16, lineHeight: 1.85, color: "#333" }} dangerouslySetInnerHTML={{ __html: content.body || "" }} />

        {entries.length > 0 && (
          <section style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "#111", marginBottom: 16 }}>Live updates</h2>
            <ol style={{ borderLeft: "2px solid var(--color-brand)", paddingLeft: 16, listStyle: "none" }}>
              {[...entries].reverse().map((e, i) => (
                <li key={i} style={{ marginBottom: 24 }}>
                  <p style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
                    {new Date(e.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                  {e.headline && <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{e.headline}</h3>}
                  <div dangerouslySetInnerHTML={{ __html: e.html }} />
                  {e.image && <img src={e.image} alt="" style={{ width: "100%", borderRadius: 6, marginTop: 8 }} />}
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
