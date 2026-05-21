import Link from "next/link";

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
  articles: { id: string; title: string; slug: string }[];
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
 * Regional above-fold for Rayalaseema Express:
 *  - LEAD: biggest hard-news story (headline + dek + hero image)
 *  - DISTRICT GRID: 2x4, one cell per Rayalaseema district — local-first identity
 *  - RAIL: breaking news pinned on top + latest news below
 */
export function AboveFold({
  lead,
  districts,
  breaking,
  latest,
}: {
  lead: AFArticle;
  districts: AFDistrict[];
  breaking: AFBreaking[];
  latest: AFArticle[];
}) {
  return (
    <section className="af">
      <div className="af-body">
        {/* MAIN — lead + district grid */}
        <div className="af-main">
          {/* LEAD */}
          <div className="af-lead">
            <Link href={`/article/${lead.slug}`} className="af-lead-img" aria-label={lead.title}>
              {lead.featuredImage ? (
                <img src={lead.featuredImage} alt={lead.title} loading="eager" />
              ) : (
                <div className="af-noimg">RE</div>
              )}
            </Link>
            <div className="af-lead-text">
              <Link href={`/category/${lead.category.slug}`} className="af-cat">
                {lead.category.name}
              </Link>
              <Link href={`/article/${lead.slug}`} className="af-lead-link">
                <h2 className="af-lead-title">{lead.title}</h2>
              </Link>
              {lead.summary && <p className="af-lead-dek">{lead.summary}</p>}
            </div>
          </div>

          {/* DISTRICT GRID — 2x4, local-first */}
          <div className="af-dist-head">
            రాయలసీమ జిల్లాలు <span aria-hidden="true">›</span>
          </div>
          <div className="af-dist-grid">
            {districts.map((d) => {
              const top = d.articles[0];
              return (
                <div key={d.slug} className="af-dist-cell">
                  <Link href={`/district/${d.slug}`} className="af-dist-name">
                    {d.name}
                  </Link>
                  {top ? (
                    <>
                      <Link href={`/article/${top.slug}`} className="af-dist-lead">
                        <h3>{top.title}</h3>
                      </Link>
                      {d.articles.slice(1, 3).map((a) => (
                        <Link key={a.id} href={`/article/${a.slug}`} className="af-dist-sub">
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

        {/* RAIL — breaking + latest */}
        <aside className="af-rail">
          {breaking.length > 0 && (
            <div className="af-breaking">
              <div className="af-breaking-head">⚡ బ్రేకింగ్</div>
              {breaking.slice(0, 4).map((b) => (
                <div key={b.id} className="af-breaking-item">{b.text}</div>
              ))}
            </div>
          )}

          <div className="af-rail-head">
            తాజా వార్తలు <span aria-hidden="true">›</span>
          </div>
          {latest.map((a) => (
            <Link key={a.id} href={`/article/${a.slug}`} className="af-rail-item">
              <div className="af-rail-meta">
                {timeAgo(a.publishedAt) && <span className="af-rail-time">{timeAgo(a.publishedAt)}</span>}
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
        .af-dist-lead { text-decoration: none; }
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
          display: block;
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 12px;
          font-weight: 600;
          line-height: 1.4;
          color: var(--n-600, #4b5563);
          text-decoration: none;
          padding: 4px 0 0;
          border-top: 1px dotted var(--paper-edge, rgba(0,0,0,0.12));
          margin-top: 4px;
        }
        .af-dist-sub:hover { color: var(--brand-dark, #B91414); }
        .af-dist-empty {
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 12px;
          color: var(--n-500, #6b7280);
          font-style: italic;
        }

        /* RAIL — breaking */
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

        /* RAIL — latest */
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
