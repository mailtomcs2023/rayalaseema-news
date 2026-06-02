import { articleHref } from "@/lib/article-href";
import { categoryHref } from "@/lib/category-href";
import Link from "next/link";

interface ColArticle {
  id: string;
  title: string;
  slug: string;
  summary?: string | null;
  featuredImage?: string | null;
}

/**
 * IE-style compact category column - lead (headline + image) + 2x2 text-headline grid.
 * No rail. Designed to sit two-up: <CategoryPair> renders two side by side.
 */
export function CategoryColumn({
  title,
  slug,
  lead,
  items,
}: {
  title: string;
  slug: string;
  lead: ColArticle;
  items: ColArticle[];
}) {
  return (
    <div className="cc">
      <Link href={categoryHref(slug)} className="cc-head">
        {title} <span aria-hidden="true">›</span>
      </Link>

      {/* LEAD - headline left, image right */}
      <div className="cc-lead">
        <Link href={articleHref(lead)} className="cc-lead-link">
          <h3 className="cc-lead-title">{lead.title}</h3>
        </Link>
        <Link href={articleHref(lead)} className="cc-lead-img" aria-label={lead.title}>
          {lead.featuredImage ? (
            <img src={lead.featuredImage} alt={lead.title} loading="lazy" />
          ) : (
            <div className="cc-noimg">RE</div>
          )}
        </Link>
      </div>

      {/* 2x2 text headlines */}
      {items.length > 0 && (
        <div className="cc-grid">
          {items.map((a) => (
            <Link key={a.id} href={articleHref(a)} className="cc-grid-item">
              {a.title}
            </Link>
          ))}
        </div>
      )}

      <style>{`
        .cc { min-width: 0; }
        .cc-head {
          display: block;
          font-family: var(--font-telugu-heading), serif;
          font-size: 14px;
          font-weight: 800;
          color: var(--n-900, #111827);
          text-transform: none;
          letter-spacing: 0.02em;
          text-decoration: none;
          margin-bottom: 12px;
        }
        .cc-head span { color: var(--brand, #E01B1B); }

        .cc-lead {
          display: flex;
          gap: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--paper-edge, rgba(0,0,0,0.1));
        }
        .cc-lead-link { flex: 1 1 50%; min-width: 0; text-decoration: none; }
        .cc-lead-title {
          font-family: var(--font-telugu-heading), serif;
          font-size: 19px;
          font-weight: 800;
          line-height: 1.25;
          color: var(--n-900, #111827);
          margin: 0;
        }
        .cc-lead-link:hover .cc-lead-title { color: var(--brand-dark, #B91414); }
        .cc-lead-img {
          flex: 1 1 50%;
          display: block;
          overflow: hidden;
          border-radius: 4px;
          background: var(--n-100, #f3f4f6);
          align-self: flex-start;
        }
        .cc-lead-img img {
          width: 100%;
          aspect-ratio: 16/11;
          object-fit: cover;
          display: block;
          transition: transform 0.4s ease;
        }
        .cc-lead-img:hover img { transform: scale(1.03); }
        .cc-noimg {
          width: 100%;
          aspect-ratio: 16/11;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-telugu-heading), serif;
          font-weight: 800; font-size: 26px;
          color: var(--n-300, #d1d5db);
        }

        .cc-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
        }
        .cc-grid-item {
          font-family: var(--font-telugu-heading), serif;
          font-size: 14px;
          font-weight: 700;
          line-height: 1.4;
          color: var(--n-900, #111827);
          text-decoration: none;
          padding: 12px 14px;
          border-bottom: 1px solid var(--paper-edge, rgba(0,0,0,0.08));
          border-right: 1px solid var(--paper-edge, rgba(0,0,0,0.08));
        }
        .cc-grid-item:nth-child(2n) { border-right: none; padding-right: 0; }
        .cc-grid-item:nth-child(2n+1) { padding-left: 0; }
        .cc-grid-item:nth-child(n+3) { border-bottom: none; }
        .cc-grid-item:hover { color: var(--brand-dark, #B91414); }

        @media (max-width: 600px) {
          .cc-lead-title { font-size: 17px; }
        }
      `}</style>
    </div>
  );
}

/** Two CategoryColumns side by side with a vertical divider - the IE 2-up unit. */
export function CategoryPair({ children }: { children: React.ReactNode }) {
  return (
    <div className="cp">
      {children}
      <style>{`
        .cp {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 32px;
          background: #fff;
          border: 1px solid var(--paper-edge, rgba(0,0,0,0.06));
          border-radius: 8px;
          padding: 16px 20px;
          margin-top: 8px;
          position: relative;
        }
        .cp::before {
          content: "";
          position: absolute;
          top: 16px; bottom: 16px;
          left: 50%;
          width: 1px;
          background: var(--paper-edge, rgba(0,0,0,0.1));
        }
        @media (max-width: 768px) {
          .cp { grid-template-columns: 1fr; gap: 24px; }
          .cp::before { display: none; }
        }
      `}</style>
    </div>
  );
}
