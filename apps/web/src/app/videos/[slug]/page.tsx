// Canonical video page. Reads Content (type=VIDEO for bulletins, REEL for
// shorts) - the standalone Video model was dropped in Spec #1 A1C #189.
//
// The page is deliberately NOT just an embed. It carries the desk's Telugu
// story text, a dateline, links out to related articles and to other videos,
// and VideoObject JSON-LD. An embed-only page is thin content, and we are
// still recovering from a Google indexing penalty caused by exactly that class
// of page.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { YouTubeFacade } from "@/components/youtube-facade";
import { VideoCardGrid } from "@/components/video-card-grid";
import { getSiteConfig } from "@/lib/db-queries";
import { articleHref } from "@/lib/article-href";
import { getVideoBySlug, getVideos, getRelatedArticlesForVideo, videoHref } from "@/lib/video-queries";
import { buildVideoObjectSchema, buildBreadcrumbListSchema, stringifyJsonLd } from "@rayalaseema/seo-schema";
import { formatRelativeTelugu } from "@/lib/byline";
import "@/styles/video-page.css";

const SITE_URL = process.env.SITE_URL || "https://rayalaseemanews.com";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const video = await getVideoBySlug(slug);
  if (!video) return { title: "వీడియో దొరకలేదు" };

  // summary is built from the stripped story text at import time, so the
  // YouTube links/hashtag block can never reach the meta description.
  const description = (video.summary || video.body).replace(/\s+/g, " ").trim().slice(0, 160);
  const canonical = `${SITE_URL}${videoHref(video.slug)}`;

  return {
    title: video.title,
    description,
    alternates: { canonical },
    openGraph: {
      title: video.title,
      description,
      url: canonical,
      type: "video.other",
      locale: "te_IN",
      images: video.thumbnail ? [{ url: video.thumbnail }] : undefined,
    },
  };
}

export default async function VideoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [config, video] = await Promise.all([getSiteConfig(), getVideoBySlug(slug)]);
  if (!video) notFound();

  const [relatedVideos, relatedArticles] = await Promise.all([
    getVideos({ kind: video.isShort ? "short" : "video", take: 3, excludeSlug: slug }),
    getRelatedArticlesForVideo({
      categoryId: video.categoryId,
      constituencyId: video.constituencyId,
      take: 5,
    }),
  ]);

  const canonical = `${SITE_URL}${videoHref(video.slug)}`;
  const place = video.constituency?.name || video.constituency?.district?.name || null;

  const videoLd = video.videoId
    ? buildVideoObjectSchema({
        title: video.title,
        description: video.summary || video.body,
        videoId: video.videoId,
        publishedAt: video.publishedAt || new Date(),
        pageUrl: canonical,
        thumbnailUrl: video.thumbnail,
        durationSeconds: video.durationSeconds,
        transcript: video.transcript,
        publisher: {
          name: config.publisher_brand_name || "Rayalaseema News",
          logoUrl: `${SITE_URL}/logo.png`,
          siteUrl: SITE_URL,
        },
      })
    : null;

  const breadcrumbLd = buildBreadcrumbListSchema({
    items: [
      { name: "Home", url: SITE_URL },
      { name: "Videos", url: `${SITE_URL}/videos` },
      ...(video.isShort ? [{ name: "Shorts", url: `${SITE_URL}/videos/shorts` }] : []),
      { name: video.title },
    ],
  });

  return (
    <div className="min-h-screen" style={{ background: "#fff" }}>
      {videoLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(videoLd) }} />
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(breadcrumbLd) }} />

      <SiteHeader config={config} breakingNews={[]} />

      <main className="vp">
        <nav className="vp-crumbs">
          <Link href="/">హోమ్</Link>
          <span aria-hidden="true">/</span>
          <Link href="/videos">వీడియోలు</Link>
          {video.isShort && (
            <>
              <span aria-hidden="true">/</span>
              <Link href="/videos/shorts">షార్ట్స్</Link>
            </>
          )}
        </nav>

        <h1 className="vp-title">{video.title}</h1>

        <p className="vp-meta">
          {place && <span className="vp-place">{place}</span>}
          {place && video.publishedAt && <span className="vp-sep">·</span>}
          {video.publishedAt && (
            <time dateTime={video.publishedAt.toISOString()}>
              {video.publishedAt.toLocaleDateString("te-IN", {
                day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata",
              })}
              {" · "}
              {formatRelativeTelugu(video.publishedAt)}
            </time>
          )}
        </p>

        {video.videoId ? (
          <YouTubeFacade
            videoId={video.videoId}
            title={video.title}
            thumbnail={video.thumbnail}
            vertical={video.isShort}
            priority
          />
        ) : null}

        {/* The story, in Telugu. Without this the page is an embed and nothing
            more - which is the thin-content pattern we are recovering from. */}
        {video.body && (
          <div className="vp-body">
            {video.body.split(/\n{2,}/).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        )}

        {/* Spec 12.5: the spoken Telugu, collapsed by default. Search engines
            read it as page text; viewers who want the words can open it. */}
        {video.transcript && (
          <details className="vp-section vp-transcript">
            <summary className="vp-h2" style={{ cursor: "pointer" }}>వీడియో ట్రాన్స్‌క్రిప్ట్ (Transcript)</summary>
            <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>{video.transcript}</p>
          </details>
        )}

        {relatedArticles.length > 0 && (
          <section className="vp-section">
            <h2 className="vp-h2">సంబంధిత వార్తలు</h2>
            <ul className="vp-links">
              {relatedArticles.map((a) => (
                <li key={a.id}>
                  <Link href={articleHref(a as never)}>{a.title}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {relatedVideos.length > 0 && (
          <section className="vp-section">
            <h2 className="vp-h2">మరిన్ని వీడియోలు</h2>
            <VideoCardGrid items={relatedVideos} />
          </section>
        )}
      </main>

      <SiteFooter config={config} />
    </div>
  );
}
