import { articleHref } from "@/lib/article-href";
import { MandiStrip } from "@/components/market-strips-server";
import Link from "next/link";
import Image from "next/image";
import { FeaturedCarousel } from "@/components/featured-carousel";

interface AFArticle {
  id: string;
  title: string;
  slug: string;
  summary?: string | null;
  featuredImage?: string | null;
  publishedAt?: string | null;
  category: { name: string; color?: string; slug: string };
}

interface AFDistrict {
  name: string;
  slug: string;
  articles: {
    id: string;
    title: string;
    slug: string;
    featuredImage?: string | null;
    constituency?: { slug: string; district: { slug: string } } | null;
  }[];
}

interface AFBreaking {
  id: string;
  text: string;
}

// Relative Telugu timestamp.
function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ఇప్పుడే";
  if (m < 60) return `${m} నిమి.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} గం.`;
  return `${Math.floor(h / 24)} రోజులు`;
}

/**
 * Regional above-fold for Rayalaseema News:
 *  - LEAD: biggest hard-news story (headline + dek + hero image)
 *  - DISTRICT GRID: 2x4, one cell per Rayalaseema district - local-first identity
 *  - RAIL: breaking news pinned on top + latest news below
 */
export function AboveFold({
  featured,
  districts,
  breaking,
  latest,
}: {
  featured: AFArticle[];
  districts: AFDistrict[];
  breaking: AFBreaking[];
  latest: AFArticle[];
}) {
  // Carousel slide 0 IS the LCP. Earlier this component emitted a
  // manual <link rel="preload"> for the exact URL, but next/image's
  // priority prop on the slide now emits its own preload (Next 16
  // behavior). Two preloads for the same image were racing each
  // other and one was returning 400 in the Chrome console. Removed
  // the manual one - next/image handles it.
  return (
    <section className="af">
      <div className="af-body">
        {/* MAIN - lead + district grid */}
        <div className="af-main">
          {/* HERO - manual carousel of editor-featured stories. Renders a
              plain single hero when only one story is featured. */}
          <FeaturedCarousel items={featured} />

          {/* DISTRICT GRID - 2x4, local-first */}
          <div className="af-dist-head">
            రాయలసీమ జిల్లాలు <span aria-hidden="true">›</span>
            {/* Mandi prices strip (auto-scrolls) - replaces the retired ticker bar. */}
            <div className="af-dist-head-mandi"><MandiStrip /></div>
          </div>
          <div className="af-dist-grid">
            {districts.map((d) => {
              const top = d.articles[0];
              return (
                <div key={d.slug} className="af-dist-cell">
                  <Link href={`/${d.slug}`} className="af-dist-name">
                    {d.name}
                  </Link>
                  {top ? (
                    <>
                      <Link href={articleHref(top)} className="af-dist-lead">
                        {top.featuredImage ? (
                          <Image
                            src={top.featuredImage}
                            alt=""
                            width={400}
                            height={250}
                            sizes="(max-width: 768px) 50vw, 240px"
                            quality={70}
                            loading="lazy"
                            className="af-dist-thumb"
                            style={{ width: "100%", height: "auto" }}
                          />
                        ) : (
                          <div className="af-dist-thumb af-dist-fallback">
                            <Image
                              src="/logo-icon.png"
                              alt=""
                              width={120}
                              height={120}
                              quality={70}
                              loading="lazy"
                              className="af-dist-fallback-img"
                            />
                          </div>
                        )}
                        <h3>{top.title}</h3>
                      </Link>
                      {d.articles.slice(1, 3).map((a) => (
                        <Link key={a.id} href={articleHref(a)} className="af-dist-sub">
                          {a.title}
                        </Link>
                      ))}
                    </>
                  ) : (
                    <span className="af-dist-empty">వార్తలు త్వరలో…</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* RAIL - breaking + latest */}
        <aside className="af-rail">
          {breaking.length > 0 && (
            <div className="af-breaking">
              <div className="af-breaking-head">బ్రేకింగ్</div>
              {breaking.slice(0, 4).map((b) => (
                <div key={b.id} className="af-breaking-item">{b.text}</div>
              ))}
            </div>
          )}

          <div className="af-rail-head">
            తాజా వార్తలు <span aria-hidden="true">›</span>
          </div>
          {latest.map((a) => (
            <Link key={a.id} href={articleHref(a)} className="af-rail-item">
              <div className="af-rail-meta">
                {/* Newspaper front-page convention: no timestamps in the trending rail.
                    Stale "40 రోజులు" labels on every item read as misleading. */}
                <span className="af-rail-cat">{a.category.name}</span>
              </div>
              <h4 className="af-rail-title">{a.title}</h4>
            </Link>
          ))}
        </aside>
      </div>

      <style>{`
        .af {
          background: #fff;
          border: 1px solid var(--paper-edge, rgba(0,0,0,0.06));
          border-radius: 8px;
          padding: 16px 18px;
        }
        .af-body { display: flex; gap: 24px; }
        .af-main { flex: 1 1 auto; min-width: 0; }
        .af-rail {
          flex: 0 0 290px;
          border-left: 1px solid var(--paper-edge, rgba(0,0,0,0.08));
          padding-left: 20px;
        }

        /* category label */
        .af-cat {
          display: inline-block;
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 11px;
          font-weight: 800;
          color: var(--brand, #E01B1B);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          text-decoration: none;
          margin-bottom: 6px;
        }

        /* LEAD */
        .af-lead {
          display: flex;
          gap: 22px;
          padding-bottom: 16px;
          border-bottom: 2px solid var(--n-900, #111827);
        }
        .af-lead-img {
          flex: 1 1 56%;
          display: block;
          overflow: hidden;
          border-radius: 4px;
          background: var(--n-100, #f3f4f6);
        }
        .af-lead-img img {
          width: 100%;
          aspect-ratio: 16/10;
          object-fit: cover;
          display: block;
          transition: transform 0.4s ease;
        }
        .af-lead-img:hover img { transform: scale(1.03); }
        .af-noimg {
          width: 100%;
          aspect-ratio: 16/10;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-telugu-heading), serif;
          font-weight: 800;
          font-size: 36px;
          color: var(--n-300, #d1d5db);
        }
        .af-lead-text { flex: 1 1 44%; min-width: 0; }
        .af-lead-link { text-decoration: none; }
        .af-lead-title {
          font-family: var(--font-telugu-heading), serif;
          font-size: 26px;
          font-weight: 800;
          line-height: 1.25;
          color: var(--n-900, #111827);
          margin: 0 0 10px;
        }
        .af-lead-link:hover .af-lead-title { color: var(--brand-dark, #B91414); }
        .af-lead-dek {
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 14px;
          line-height: 1.6;
          color: var(--n-600, #4b5563);
          margin: 0;
        }

        /* HERO CAROUSEL (Swiper, manual nav). The carousel wrapper owns the
           bottom rule so slides don't each draw one; arrows + dots themed to
           brand red; dots sit in normal flow below the slide (no overlap). */
        .af-carousel {
          position: relative;
          padding-bottom: 16px;
          border-bottom: 2px solid var(--n-900, #111827);
        }
        .af-carousel .af-lead { border-bottom: none; padding-bottom: 0; }

        /* Custom lucide arrow buttons (SVG ships in SSR HTML - no flash). */
        .af-nav {
          position: absolute;
          top: 38%;
          transform: translateY(-50%);
          z-index: 3;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          border: none;
          border-radius: 999px;
          color: #fff;
          background: var(--brand, #E01B1B);
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.28);
          cursor: pointer;
          transition: background 0.15s ease, opacity 0.15s ease, transform 0.15s ease;
        }
        .af-nav:not([aria-disabled="true"]):hover { background: var(--brand-dark, #B91414); }
        .af-nav:not([aria-disabled="true"]):active { transform: translateY(-50%) scale(0.94); }
        .af-nav-prev { left: 8px; }
        .af-nav-next { right: 8px; }
        .af-nav[aria-disabled="true"] {
          opacity: 0.35;
          cursor: not-allowed;
        }

        /* Slide counter pill (current / total), top-right of the hero. */
        .af-carousel-count {
          position: absolute;
          top: 10px;
          right: 10px;
          z-index: 3;
          display: inline-flex;
          align-items: center;
          gap: 3px;
          /* Asymmetric vertical padding (5px top / 2px bottom) optically
             centers the digits - Noto Sans Telugu's large descent reserve
             otherwise leaves them sitting high in the pill. */
          padding: 5px 10px 2px;
          border-radius: 999px;
          background: rgba(17, 24, 39, 0.78);
          color: #fff;
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 12px;
          font-weight: 700;
          line-height: 1;
          letter-spacing: 0.02em;
          backdrop-filter: blur(2px);
        }
        .af-carousel-count-sep { opacity: 0.6; margin: 0 1px; }

        /* Custom dots - server-rendered (in HTML from first paint, no flash)
           and in normal flow so they reserve their own height (no layout
           shift when the page settles). */
        .af-dots {
          display: flex;
          justify-content: center;
          gap: 7px;
          margin-top: 12px;
        }
        .af-dot {
          width: 8px;
          height: 8px;
          padding: 0;
          border: none;
          border-radius: 999px;
          background: var(--n-300, #d1d5db);
          cursor: pointer;
          transition: background 0.15s ease, transform 0.15s ease;
        }
        .af-dot:hover { background: var(--n-400, #9ca3af); }
        .af-dot-active {
          background: var(--brand, #E01B1B);
          transform: scale(1.25);
        }

        /* DISTRICT GRID */
        .af-dist-head, .af-rail-head {
          font-family: var(--font-telugu-heading), serif;
          font-size: 14px;
          font-weight: 800;
          color: var(--n-900, #111827);
          padding: 14px 0 8px;
          margin-bottom: 8px;
          border-bottom: 1px solid var(--paper-edge, rgba(0,0,0,0.12));
          display: flex; align-items: baseline; gap: 6px;
        }
        .af-dist-head span, .af-rail-head span { color: var(--brand, #E01B1B); }
        /* District header carries the mandi strip on the right - center-align
           (override the shared baseline) and let the marquee fill the gap. */
        .af-dist-head { align-items: center; }
        .af-dist-head-mandi { margin-left: auto; min-width: 0; flex: 0 1 auto; max-width: 70%; }
        .af-dist-head-mandi span { color: inherit; }
        .af-dist-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0;
        }
        .af-dist-cell {
          padding: 12px 14px;
          border-right: 1px solid var(--paper-edge, rgba(0,0,0,0.08));
          border-bottom: 1px solid var(--paper-edge, rgba(0,0,0,0.08));
        }
        .af-dist-cell:nth-child(4n) { border-right: none; padding-right: 0; }
        .af-dist-cell:nth-child(4n+1) { padding-left: 0; }
        .af-dist-cell:nth-child(n+5) { border-bottom: none; }
        .af-dist-name {
          display: block;
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 11px;
          font-weight: 800;
          color: var(--brand, #E01B1B);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          text-decoration: none;
          margin-bottom: 6px;
        }
        .af-dist-lead { text-decoration: none; display: block; }
        .af-dist-thumb {
          display: block;
          width: 100%;
          aspect-ratio: 16/10;
          object-fit: cover;
          border-radius: 4px;
          margin-bottom: 6px;
          background: var(--n-100, #f3f4f6);
          transition: transform 0.25s ease;
        }
        .af-dist-lead:hover .af-dist-thumb { transform: scale(1.02); }
        /* Logo fallback when article has no featuredImage - soft gradient,
           subtle inset shadow, square brand icon at low opacity. */
        .af-dist-fallback {
          background: linear-gradient(135deg, #f8f9fa 0%, #eef0f2 60%, #e5e7eb 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -1px 2px rgba(0,0,0,0.05);
        }
        .af-dist-fallback-img {
          width: 40%;
          max-width: 60px;
          height: auto;
          opacity: 0.55;
          filter: grayscale(15%) drop-shadow(0 1px 2px rgba(0,0,0,0.1));
          transition: opacity 0.18s, transform 0.18s;
        }
        .af-dist-lead:hover .af-dist-fallback-img {
          opacity: 0.78;
          transform: scale(1.04);
        }
        .af-dist-lead h3 {
          font-family: var(--font-telugu-heading), serif;
          font-size: 14px;
          font-weight: 700;
          line-height: 1.35;
          color: var(--n-900, #111827);
          margin: 0 0 6px;
        }
        .af-dist-lead:hover h3 { color: var(--brand-dark, #B91414); }
        .af-dist-sub {
          /* flex so the bullet prefix sits next to the headline as a
             clear separator - without it the supporting headlines blurred
             into a paragraph that looked like a single excerpt under the
             lead story. */
          display: flex;
          align-items: flex-start;
          gap: 6px;
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 12.5px;
          font-weight: 600;
          line-height: 1.42;
          color: var(--n-700, #374151);
          text-decoration: none;
          padding: 7px 0;
          border-top: 1px solid #e5e7eb;
          margin-top: 6px;
        }
        .af-dist-sub:hover { color: var(--brand-dark, #B91414); }
        /* Bullet glyph stays the brand-red even when the headline text is
           grey, so the reader's eye snaps to it as a list marker. */
        .af-dist-sub::before {
          content: "▸";
          color: var(--brand, #E01B1B);
          font-size: 11px;
          line-height: 1.42;
          flex-shrink: 0;
        }
        .af-dist-sub:hover::before {
          color: var(--brand-dark, #B91414);
        }
        .af-dist-empty {
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 12px;
          color: var(--n-500, #6b7280);
          font-style: italic;
        }

        /* RAIL - breaking */
        .af-breaking {
          background: var(--brand-soft, #FFF1F1);
          border: 1px solid var(--brand, #E01B1B);
          border-radius: 6px;
          padding: 10px 12px;
          margin-bottom: 14px;
        }
        .af-breaking-head {
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 12px;
          font-weight: 800;
          color: var(--brand, #E01B1B);
          letter-spacing: 0.05em;
          margin-bottom: 6px;
        }
        .af-breaking-item {
          font-family: var(--font-telugu-heading), serif;
          font-size: 13px;
          font-weight: 700;
          line-height: 1.4;
          color: var(--n-900, #111827);
          padding: 5px 0;
          border-top: 1px solid rgba(224,27,27,0.2);
        }
        .af-breaking-item:first-of-type { border-top: none; }

        /* RAIL - latest */
        .af-rail-head { border-bottom: 2px solid var(--n-900, #111827); }
        .af-rail-item {
          display: block;
          text-decoration: none;
          padding: 11px 0;
          border-bottom: 1px solid var(--paper-edge, rgba(0,0,0,0.08));
        }
        .af-rail-item:last-child { border-bottom: none; }
        .af-rail-meta { display: flex; gap: 8px; align-items: baseline; margin-bottom: 4px; }
        .af-rail-time {
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 10px; font-weight: 700;
          color: var(--n-500, #6b7280);
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .af-rail-cat {
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 10px; font-weight: 800;
          color: var(--brand, #E01B1B);
          text-transform: uppercase; letter-spacing: 0.05em;
        }
        .af-rail-title {
          font-family: var(--font-telugu-heading), serif;
          font-size: 15px; font-weight: 700;
          line-height: 1.35;
          color: var(--n-900, #111827);
          margin: 0;
        }
        .af-rail-item:hover .af-rail-title { color: var(--brand-dark, #B91414); }

        @media (max-width: 1024px) {
          .af-rail { flex-basis: 250px; }
          .af-lead-title { font-size: 22px; }
          .af-dist-grid { grid-template-columns: repeat(2, 1fr); }
          .af-dist-cell:nth-child(4n) { border-right: 1px solid var(--paper-edge, rgba(0,0,0,0.08)); }
          .af-dist-cell:nth-child(2n) { border-right: none; padding-right: 0; }
          .af-dist-cell:nth-child(2n+1) { padding-left: 0; }
          .af-dist-cell:nth-child(n+5) { border-bottom: 1px solid var(--paper-edge, rgba(0,0,0,0.08)); }
          .af-dist-cell:nth-child(n+7) { border-bottom: none; }
        }
        @media (max-width: 768px) {
          .af-body { flex-direction: column; gap: 16px; }
          .af-rail {
            flex-basis: auto; border-left: none;
            border-top: 1px solid var(--paper-edge, rgba(0,0,0,0.08));
            padding-left: 0; padding-top: 12px;
          }
          .af-lead { flex-direction: column; gap: 12px; }
          .af-lead-text, .af-lead-img { flex-basis: auto; }
          .af-lead-title { font-size: 21px; }
          .af-dist-grid { grid-template-columns: 1fr; }
          .af-dist-cell {
            border-right: none !important;
            padding-left: 0 !important; padding-right: 0 !important;
            border-bottom: 1px solid var(--paper-edge, rgba(0,0,0,0.08)) !important;
          }
        }
      `}</style>
    </section>
  );
}
