// /story/[slug] - WEB_STORY Content type detail page (Spec #1 #111).
// Renders payload.slides as a swipeable card carousel (CSS scroll-snap so we
// don't ship a swiper lib for the MVP). Each slide = full-bleed image + caption.
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getWebStoryBySlug, getSiteConfig, incrementViewCount } from "@/lib/db-queries";

const SITE_URL = process.env.SITE_URL || "https://rayalaseemanews.com";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const story = await getWebStoryBySlug(slug);
  if (!story) return { title: "Not found" };
  const url = `${SITE_URL}/story/${slug}`;
  const firstSlideImage = story.slides[0] ? (story.slides[0] as { image: string }).image : null;
  const ogImage = story.imageUrl || firstSlideImage || story.featuredImage || `${SITE_URL}/api/og/${slug}`;
  return {
    title: `${story.title} | రాయలసీమ న్యూస్`,
    description: story.summary || story.title,
    alternates: { canonical: url },
    openGraph: { title: story.title, url, type: "article", locale: "te_IN", images: ogImage ? [{ url: ogImage }] : undefined },
  };
}

export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [story, config] = await Promise.all([getWebStoryBySlug(slug), getSiteConfig()]);
  if (!story) return notFound();
  incrementViewCount(story.id).catch(() => {});

  // Cover slide derived from featuredImage when payload doesn't provide one
  // explicitly (some operators upload a single cover and rely on it).
  const slides = story.slides.length > 0
    ? story.slides
    : story.imageUrl ? [{ image: story.imageUrl, caption: story.title }] : [];

  return (
    <div className="min-h-screen" style={{ background: "#000" }}>
      <SiteHeader config={config} breakingNews={[]} />
      <main style={{ maxWidth: 480, margin: "0 auto", padding: "12px" }}>
        <h1 style={{ fontFamily: "var(--font-telugu-heading), serif", fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 12 }}>
          {story.title}
        </h1>
        <div
          style={{
            display: "flex",
            overflowX: "auto",
            scrollSnapType: "x mandatory",
            gap: 0,
            borderRadius: 8,
            aspectRatio: "9 / 16",
            background: "#111",
          }}
        >
          {slides.map((slide, i) => {
            const s = slide as { image: string; caption?: string };
            return (
              <div
                key={i}
                style={{
                  flex: "0 0 100%",
                  scrollSnapAlign: "start",
                  position: "relative",
                  background: "#000",
                  display: "flex",
                  alignItems: "flex-end",
                }}
              >
                <img
                  src={s.image}
                  alt={s.caption || `Slide ${i + 1}`}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                />
                {s.caption && (
                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      padding: "32px 16px 24px",
                      background: "linear-gradient(transparent, rgba(0,0,0,0.85))",
                      color: "#fff",
                      fontFamily: "var(--font-telugu-body), sans-serif",
                      fontSize: 16,
                      lineHeight: 1.5,
                    }}
                  >
                    {s.caption}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p style={{ marginTop: 12, fontSize: 12, color: "#999", textAlign: "center" }}>
          {slides.length} {slides.length === 1 ? "slide" : "slides"} · swipe to read more
        </p>
      </main>
      <SiteFooter config={config} />
    </div>
  );
}
