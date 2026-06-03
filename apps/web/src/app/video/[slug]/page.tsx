// /video/[slug] - VIDEO Content type detail page (Spec #1 #111).
// Embeds the videoUrl (typically YouTube) above a short metadata block.
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { Footer } from "@/components/footer";
import { ShareBar } from "@/components/share-bar";
import { getVideoBySlug, getSiteConfig, incrementViewCount } from "@/lib/db-queries";

const SITE_URL = process.env.SITE_URL || "https://rayalaseemanews.com";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const video = await getVideoBySlug(slug);
  if (!video) return { title: "Not found" };
  const url = `${SITE_URL}/video/${slug}`;
  const ogImage = video.thumbnailUrl || video.featuredImage || `${SITE_URL}/api/og/${slug}`;
  return {
    title: `${video.title} | రాయలసీమ న్యూస్`,
    description: video.summary || video.title,
    alternates: { canonical: url },
    openGraph: { title: video.title, description: video.summary || undefined, url, type: "video.other", locale: "te_IN", images: ogImage ? [{ url: ogImage }] : undefined },
    twitter: { card: "summary_large_image", title: video.title, description: video.summary || undefined, images: ogImage ? [ogImage] : undefined },
  };
}

// Convert a YouTube/Vimeo URL into an embeddable iframe src. Returns null for
// arbitrary URLs (which we render as a plain link instead).
function toEmbedSrc(url: string | null): string | null {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

export default async function VideoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [video, config] = await Promise.all([getVideoBySlug(slug), getSiteConfig()]);
  if (!video) return notFound();
  incrementViewCount(video.id).catch(() => {});
  const embedSrc = toEmbedSrc(video.videoUrl);

  return (
    <div className="min-h-screen" style={{ background: "#fff" }}>
      <SiteHeader config={config} breakingNews={[]} />
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "16px 12px 48px" }}>
        <h1 style={{ fontFamily: "var(--font-telugu-heading), serif", fontSize: 28, fontWeight: 800, color: "#111", marginBottom: 12 }}>
          {video.title}
        </h1>
        <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, overflow: "hidden", background: "#000", borderRadius: 8 }}>
          {embedSrc ? (
            <iframe
              src={embedSrc}
              title={video.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
            />
          ) : video.videoUrl ? (
            <a href={video.videoUrl} target="_blank" rel="noopener noreferrer" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", textDecoration: "none" }}>
              ▶ {video.videoUrl}
            </a>
          ) : video.thumbnailUrl ? (
            <img src={video.thumbnailUrl} alt={video.title} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          ) : null}
        </div>
        {video.duration && (
          <div style={{ marginTop: 8, fontSize: 13, color: "#666" }}>⏱ {video.duration} · 👁 {video.views.toLocaleString()}</div>
        )}
        {video.summary && (
          <p style={{ marginTop: 16, fontFamily: "var(--font-telugu-body), sans-serif", fontSize: 16, color: "#333", lineHeight: 1.7 }}>
            {video.summary}
          </p>
        )}
        <div style={{ marginTop: 24 }}>
          <ShareBar title={video.title} articleUrl={`${SITE_URL}/video/${slug}`} />
        </div>
      </main>
      <Footer config={config} />
    </div>
  );
}
