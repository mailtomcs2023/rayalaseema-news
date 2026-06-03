// /cartoon/[slug] - CARTOON Content type detail page (Spec #1 #111).
// Single image, optional caption, publish date. Newsroom uses this for the
// daily editorial cartoon (ఎట్టెట / యెట్టెట section).
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { Footer } from "@/components/footer";
import { ShareBar } from "@/components/share-bar";
import { getCartoonBySlug, getSiteConfig, incrementViewCount } from "@/lib/db-queries";

const SITE_URL = process.env.SITE_URL || "https://rayalaseemanews.com";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const cartoon = await getCartoonBySlug(slug);
  if (!cartoon) return { title: "Not found" };
  const url = `${SITE_URL}/cartoon/${slug}`;
  const ogImage = cartoon.imageUrl || cartoon.featuredImage || `${SITE_URL}/api/og/${slug}`;
  return {
    title: `${cartoon.title} | రాయలసీమ న్యూస్`,
    description: cartoon.caption || cartoon.title,
    alternates: { canonical: url },
    openGraph: { title: cartoon.title, description: cartoon.caption || undefined, url, type: "article", locale: "te_IN", images: ogImage ? [{ url: ogImage }] : undefined },
  };
}

export default async function CartoonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [cartoon, config] = await Promise.all([getCartoonBySlug(slug), getSiteConfig()]);
  if (!cartoon) return notFound();
  incrementViewCount(cartoon.id).catch(() => {});

  const dateLabel = cartoon.date.toLocaleDateString("te-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="min-h-screen" style={{ background: "#fff" }}>
      <SiteHeader config={config} breakingNews={[]} />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "16px 12px 48px" }}>
        <h1 style={{ fontFamily: "var(--font-telugu-heading), serif", fontSize: 28, fontWeight: 800, color: "#111", marginBottom: 4 }}>
          {cartoon.title}
        </h1>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>{dateLabel}</p>

        {cartoon.imageUrl && (
          <img
            src={cartoon.imageUrl}
            alt={cartoon.caption || cartoon.title}
            style={{ width: "100%", borderRadius: 8, background: "#f3f4f6" }}
          />
        )}

        {cartoon.caption && (
          <p style={{ marginTop: 16, fontFamily: "var(--font-telugu-body), sans-serif", fontSize: 16, color: "#333", lineHeight: 1.7, fontStyle: "italic" }}>
            {cartoon.caption}
          </p>
        )}

        <div style={{ marginTop: 24 }}>
          <ShareBar title={cartoon.title} articleUrl={`${SITE_URL}/cartoon/${slug}`} />
        </div>
      </main>
      <Footer config={config} />
    </div>
  );
}
