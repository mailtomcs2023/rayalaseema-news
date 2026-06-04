// /gallery/[slug] - PHOTO_GALLERY Content type detail page (Spec #1 #111).
//
// Renders a server-side <noscript> grid for SEO (every img + caption
// indexable) plus the client-side Stories launcher: tappable thumb grid
// that opens a full-screen Instagram-style viewer with progress bars,
// tap-to-advance, auto-play, swipe-down-to-close. Big "Play as Story"
// CTA up top mirrors how mobile readers consume galleries today.
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { Footer } from "@/components/footer";
import { ShareBar } from "@/components/share-bar";
import { GalleryLauncher } from "@/components/gallery-launcher";
import { getPhotoGalleryBySlug, getSiteConfig, incrementViewCount } from "@/lib/db-queries";

const SITE_URL = process.env.SITE_URL || "https://rayalaseemanews.com";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const gallery = await getPhotoGalleryBySlug(slug);
  if (!gallery) return { title: "Not found" };
  const url = `${SITE_URL}/gallery/${slug}`;
  const ogImage = gallery.coverImage || gallery.featuredImage || `${SITE_URL}/api/og/${slug}`;
  return {
    title: `${gallery.title} | రాయలసీమ న్యూస్`,
    description: gallery.summary || `${gallery._count.photos} photos`,
    alternates: { canonical: url },
    openGraph: { title: gallery.title, url, type: "article", locale: "te_IN", images: ogImage ? [{ url: ogImage }] : undefined },
  };
}

export default async function GalleryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [gallery, config] = await Promise.all([getPhotoGalleryBySlug(slug), getSiteConfig()]);
  if (!gallery) return notFound();
  incrementViewCount(gallery.id).catch(() => {});

  const photos = gallery.photos as Array<{ url: string; caption?: string }>;

  return (
    <div className="min-h-screen" style={{ background: "#fff" }}>
      <SiteHeader config={config} breakingNews={[]} />
      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "16px 12px 48px" }}>
        <h1 style={{ fontFamily: "var(--font-telugu-heading), serif", fontSize: 28, fontWeight: 800, color: "#111", marginBottom: 8 }}>
          {gallery.title}
        </h1>
        <p style={{ fontSize: 14, color: "#666", marginBottom: 16 }}>
          {gallery._count.photos} {gallery._count.photos === 1 ? "photo" : "photos"}
          {gallery.summary && <> · {gallery.summary}</>}
        </p>

        {photos.length === 0 && gallery.coverImage && (
          <img src={gallery.coverImage} alt={gallery.title} style={{ width: "100%", borderRadius: 8 }} />
        )}

        {/* SEO-indexable image list. Crawlers see every photo + caption
          in the static HTML. Hidden visually for JS-enabled clients,
          who see the launcher grid below instead. */}
        <noscript>
          <div style={{ columnCount: 3, columnGap: 12 }} className="gallery-cols">
            {photos.map((photo, i) => (
              <a key={i} href={photo.url} target="_blank" rel="noopener noreferrer"
                style={{ display: "block", breakInside: "avoid", marginBottom: 12 }}>
                <img src={photo.url} alt={photo.caption || `Photo ${i + 1}`}
                  style={{ width: "100%", display: "block", borderRadius: 6 }}
                  loading="lazy" />
                {photo.caption && (
                  <p style={{ marginTop: 4, fontSize: 12, color: "#666", fontFamily: "var(--font-telugu-body), sans-serif" }}>
                    {photo.caption}
                  </p>
                )}
              </a>
            ))}
          </div>
        </noscript>

        <GalleryLauncher photos={photos} title={gallery.title} />

        <div style={{ marginTop: 24 }}>
          <ShareBar title={gallery.title} articleUrl={`${SITE_URL}/gallery/${slug}`} />
        </div>
      </main>

      <style>{`
        @media (max-width: 768px) { .gallery-cols { column-count: 2 !important; } }
        @media (max-width: 480px) { .gallery-cols { column-count: 1 !important; } }
      `}</style>

      <Footer config={config} />
    </div>
  );
}
