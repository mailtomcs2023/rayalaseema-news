// /gallery/[slug] — PHOTO_GALLERY Content type detail page (Spec #1 #111).
// Masonry-ish grid using CSS columns (no JS lightbox lib — clicking opens the
// full image in a new tab for now; richer lightbox can land in a polish PR).
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { ShareBar } from "@/components/share-bar";
import { getPhotoGalleryBySlug, getSiteConfig, incrementViewCount } from "@/lib/db-queries";

const SITE_URL = process.env.SITE_URL || "https://rayalaseemaexpress.com";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const gallery = await getPhotoGalleryBySlug(slug);
  if (!gallery) return { title: "Not found" };
  const url = `${SITE_URL}/gallery/${slug}`;
  const ogImage = gallery.coverImage || gallery.featuredImage || `${SITE_URL}/api/og/${slug}`;
  return {
    title: `${gallery.title} | రాయలసీమ ఎక్స్‌ప్రెస్`,
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
      <Header config={config} breakingNews={[]} />
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

        <div style={{ columnCount: 3, columnGap: 12 }} className="gallery-cols">
          {photos.map((photo, i) => (
            <a
              key={i}
              href={photo.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "block", breakInside: "avoid", marginBottom: 12 }}
            >
              <img
                src={photo.url}
                alt={photo.caption || `Photo ${i + 1}`}
                style={{ width: "100%", display: "block", borderRadius: 6 }}
                loading="lazy"
              />
              {photo.caption && (
                <p style={{ marginTop: 4, fontSize: 12, color: "#666", fontFamily: "var(--font-telugu-body), sans-serif" }}>
                  {photo.caption}
                </p>
              )}
            </a>
          ))}
        </div>

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
