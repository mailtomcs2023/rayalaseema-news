// Page Builder block: LatestNews - a card grid of the newest published
// articles (optionally scoped to a category). The grid auto-fits the available
// width, so it works full-bleed or inside a Columns block. Data comes from
// fetchLatestNews; this component is presentational.

import Link from "next/link";

export interface LatestNewsArticle {
  id: string;
  title: string;
  href: string;
  featuredImage: string | null;
  categoryName: string | null;
  publishedAtIso: string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "ఇప్పుడే";
  if (m < 60) return `${m} నిమి. క్రితం`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} గం. క్రితం`;
  return `${Math.floor(h / 24)} రోజుల క్రితం`;
}

export function LatestNews({ articles }: { articles: LatestNewsArticle[] }) {
  if (!articles || articles.length === 0) return null;
  return (
    <div className="ln-block">
      <div className="ln-grid">
        {articles.map((a) => (
          <Link key={a.id} href={a.href} className="ln-card">
            <span className="ln-thumb">
              {a.featuredImage ? (
                <img src={a.featuredImage} alt="" loading="lazy" />
              ) : (
                <span className="ln-noimg">RN</span>
              )}
            </span>
            <span className="ln-body">
              <span className="ln-meta">
                {a.categoryName && <span className="ln-cat">{a.categoryName}</span>}
                {a.publishedAtIso && <span className="ln-time">{timeAgo(a.publishedAtIso)}</span>}
              </span>
              <span className="ln-title">{a.title}</span>
            </span>
          </Link>
        ))}
      </div>
      <style>{`
        .ln-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
        .ln-card {
          display: flex; gap: 12px; padding: 10px;
          background: #fff; border: 1px solid #eef0f2; border-radius: 10px;
          text-decoration: none; transition: border-color 0.15s;
        }
        .ln-card:hover { border-color: #d1d5db; }
        .ln-thumb {
          flex: 0 0 104px; width: 104px; height: 74px; border-radius: 8px;
          overflow: hidden; background: #f3f4f6; display: block;
        }
        .ln-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .ln-noimg {
          width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
          font-family: var(--font-telugu-heading), serif; font-weight: 800; font-size: 16px; color: #cbd5e1;
        }
        .ln-body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
        .ln-meta { display: flex; align-items: center; gap: 8px; }
        .ln-cat {
          font-size: 10px; font-weight: 800; color: var(--brand, #E01B1B);
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .ln-time { font-size: 11px; color: #9aa3af; font-weight: 600; }
        .ln-title {
          font-family: var(--font-telugu-heading), serif;
          font-size: 14px; font-weight: 700; line-height: 1.45; color: #111827;
          display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
        }
        .ln-card:hover .ln-title { color: var(--brand-dark, #B91414); }
      `}</style>
    </div>
  );
}
