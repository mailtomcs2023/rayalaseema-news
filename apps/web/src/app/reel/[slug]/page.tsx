// /reel/[slug] - REEL Content type detail page (Spec #1 #111).
// Vertical-oriented short-clip player (9:16 aspect). Native <video> tag for
// hosted clips since reels are typically Azure Blob MP4s, not embeds.
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { ShareBar } from "@/components/share-bar";
import { getReelBySlug, getSiteConfig, incrementViewCount } from "@/lib/db-queries";

const SITE_URL = process.env.SITE_URL || "https://rayalaseemaexpress.com";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const reel = await getReelBySlug(slug);
  if (!reel) return { title: "Not found" };
  const url = `${SITE_URL}/reel/${slug}`;
  const ogImage = reel.thumbnailUrl || reel.featuredImage || `${SITE_URL}/api/og/${slug}`;
  return {
    title: `${reel.title} | రాయలసీమ ఎక్స్‌ప్రెస్`,
    description: reel.summary || reel.title,
    alternates: { canonical: url },
    openGraph: { title: reel.title, url, type: "video.other", locale: "te_IN", images: ogImage ? [{ url: ogImage }] : undefined },
  };
}

export default async function ReelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [reel, config] = await Promise.all([getReelBySlug(slug), getSiteConfig()]);
  if (!reel) return notFound();
  incrementViewCount(reel.id).catch(() => {});

  return (
    <div className="min-h-screen" style={{ background: "#000" }}>
      <Header config={config} breakingNews={[]} />
      <main style={{ maxWidth: 480, margin: "0 auto", padding: "16px 12px 48px" }}>
        <h1 style={{ fontFamily: "var(--font-telugu-heading), serif", fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 12 }}>
          {reel.title}
        </h1>
        {reel.videoUrl ? (
          <video
            controls
            playsInline
            poster={reel.thumbnailUrl || undefined}
            style={{ width: "100%", aspectRatio: "9 / 16", background: "#111", borderRadius: 8 }}
          >
            <source src={reel.videoUrl} />
          </video>
        ) : reel.thumbnailUrl ? (
          <img src={reel.thumbnailUrl} alt={reel.title} style={{ width: "100%", aspectRatio: "9 / 16", objectFit: "cover", borderRadius: 8 }} />
        ) : null}
        <div style={{ marginTop: 8, fontSize: 13, color: "#ccc" }}>👁 {reel.views}</div>
        {reel.summary && (
          <p style={{ marginTop: 12, fontFamily: "var(--font-telugu-body), sans-serif", fontSize: 14, color: "#eee", lineHeight: 1.6 }}>
            {reel.summary}
          </p>
        )}
        <div style={{ marginTop: 16 }}>
          <ShareBar title={reel.title} articleUrl={`${SITE_URL}/reel/${slug}`} />
        </div>
      </main>
      <Footer config={config} />
    </div>
  );
}
