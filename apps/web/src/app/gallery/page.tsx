// /gallery - photo-gallery index. Listing of all PUBLISHED PHOTO_GALLERY
// Content rows, paginated. Mirrors the /gallery/[slug] detail page's
// layout convention (SiteHeader + 1080-max main + Footer).
//
// Was 404 until 2026-06-04 because only /gallery/[slug] existed. The
// header nav, the homepage "ఫోటో గ్యాలరీ" SectionShell "more →" link,
// and the in-component thumb links all pointed here.
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Footer } from "@/components/footer";
import { prisma } from "@rayalaseema/db";
import { getSiteConfig } from "@/lib/db-queries";

const SITE_URL = process.env.SITE_URL || "https://rayalaseemanews.com";
const PAGE_SIZE = 24;

export const metadata: Metadata = {
  title: "ఫోటో గ్యాలరీ | రాయలసీమ న్యూస్",
  description: "రాయలసీమ ప్రాంత తాజా ఫోటో గ్యాలరీలు - రాజకీయాలు, క్రీడలు, సాంస్కృతిక కార్యక్రమాలు, వార్తలు.",
  alternates: { canonical: `${SITE_URL}/gallery` },
  openGraph: {
    title: "ఫోటో గ్యాలరీ - రాయలసీమ న్యూస్",
    url: `${SITE_URL}/gallery`,
    type: "website",
    locale: "te_IN",
  },
};

interface GalleryRow {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  featuredImage: string | null;
  publishedAt: Date | null;
  payload: unknown;
}

function countPhotos(payload: unknown): number {
  if (!payload || typeof payload !== "object") return 0;
  const p = payload as { photos?: unknown };
  return Array.isArray(p.photos) ? p.photos.length : 0;
}

export default async function GalleryIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageRaw } = await searchParams;
  const page = Math.max(1, parseInt(pageRaw || "1", 10) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const [galleries, total, config] = await Promise.all([
    prisma.content.findMany({
      where: { type: "PHOTO_GALLERY", status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        featuredImage: true,
        publishedAt: true,
        payload: true,
      },
      take: PAGE_SIZE,
      skip,
    }),
    prisma.content.count({
      where: { type: "PHOTO_GALLERY", status: "PUBLISHED" },
    }),
    getSiteConfig(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen" style={{ background: "#fff" }}>
      <SiteHeader config={config} breakingNews={[]} />
      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "16px 12px 48px" }}>
        <h1
          style={{
            fontFamily: "var(--font-telugu-heading), serif",
            fontSize: 28,
            fontWeight: 800,
            color: "#111",
            marginBottom: 6,
          }}
        >
          ఫోటో గ్యాలరీ
        </h1>
        <p style={{ fontSize: 13, color: "#666", marginBottom: 18 }}>
          {total} {total === 1 ? "గ్యాలరీ" : "గ్యాలరీలు"}
        </p>

        {galleries.length === 0 ? (
          <p
            style={{
              textAlign: "center",
              color: "#888",
              padding: 60,
              fontSize: 14,
              fontFamily: "var(--font-telugu-body), sans-serif",
            }}
          >
            ప్రస్తుతం గ్యాలరీలు అందుబాటులో లేవు.
          </p>
        ) : (
          <div className="gi-grid">
            {(galleries as GalleryRow[]).map((g) => {
              const count = countPhotos(g.payload);
              return (
                <Link key={g.id} href={`/gallery/${g.slug}`} className="gi-item">
                  <div className="gi-img">
                    {g.featuredImage ? (
                      <img src={g.featuredImage} alt={g.title} loading="lazy" />
                    ) : (
                      <div className="gi-placeholder" aria-hidden="true">
                        <svg width="36" height="36" fill="#9ca3af" viewBox="0 0 24 24">
                          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                        </svg>
                      </div>
                    )}
                    <div className="gi-shade" />
                    {count > 0 && (
                      <span className="gi-count" aria-label={`${count} photos`}>
                        <svg width="11" height="11" fill="#fff" viewBox="0 0 24 24">
                          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                        </svg>
                        {count}
                      </span>
                    )}
                    <h3 className="gi-title">{g.title}</h3>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <nav
            aria-label="Pagination"
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 8,
              marginTop: 28,
              fontFamily: "var(--font-telugu-body), sans-serif",
            }}
          >
            {page > 1 && (
              <Link href={`/gallery?page=${page - 1}`} className="gi-pg">
                ← మునుపటి
              </Link>
            )}
            <span style={{ padding: "8px 14px", fontSize: 13, color: "#374151" }}>
              {page} / {totalPages}
            </span>
            {page < totalPages && (
              <Link href={`/gallery?page=${page + 1}`} className="gi-pg">
                తరువాతి →
              </Link>
            )}
          </nav>
        )}
      </main>

      <style>{`
        .gi-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }
        .gi-item { text-decoration: none; display: block; }
        .gi-img {
          position: relative;
          border-radius: 8px;
          overflow: hidden;
          background: #111;
        }
        .gi-img img {
          width: 100%;
          aspect-ratio: 4/3;
          object-fit: cover;
          display: block;
          transition: transform 0.5s ease;
        }
        .gi-item:hover .gi-img img { transform: scale(1.05); }
        .gi-placeholder {
          width: 100%;
          aspect-ratio: 4/3;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f3f4f6;
        }
        .gi-shade {
          position: absolute; inset: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 55%);
          pointer-events: none;
        }
        .gi-count {
          position: absolute; top: 8px; right: 8px;
          display: inline-flex; align-items: center; gap: 3px;
          background: rgba(0,0,0,0.7);
          color: #fff;
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 11px; font-weight: 700;
          padding: 2px 7px;
          border-radius: 3px;
        }
        .gi-title {
          position: absolute; bottom: 0; left: 0; right: 0;
          padding: 12px 12px 14px;
          font-family: var(--font-telugu-heading), serif;
          font-size: 15px; font-weight: 700;
          line-height: 1.35;
          color: #fff;
          text-shadow: 0 1px 3px rgba(0,0,0,0.7);
          margin: 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .gi-pg {
          padding: 8px 14px;
          font-size: 13px;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          color: #374151;
          text-decoration: none;
          background: #fff;
        }
        .gi-pg:hover { background: var(--brand-soft, #FFF1F1); border-color: var(--brand, #E01B1B); color: var(--brand, #E01B1B); }

        @media (max-width: 768px) { .gi-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 420px) { .gi-grid { grid-template-columns: 1fr; } }
      `}</style>

      <Footer config={config} />
    </div>
  );
}
