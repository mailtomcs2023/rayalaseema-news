import { articleHref } from "@/lib/article-href";
import { categoryHref } from "@/lib/category-href";
import { BullionStrip, ForexStrip } from "@/components/market-strips-server";
import Link from "next/link";
import { Children } from "react";

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
      <div className="cc-head-row">
        <Link href={categoryHref(slug)} className="cc-head">
          {title} <span aria-hidden="true">›</span>
        </Link>
        {/* Contextual price strip: Business → bullion, National → forex.
            (Replaces the retired top ticker bar.) */}
        {slug === "business" ? <BullionStrip /> : slug === "national" ? <ForexStrip /> : null}
      </div>

      {/* LEAD - image on top, headline below (vertical card for 4-up rows) */}
      <Link href={articleHref(lead)} className="cc-lead-img" aria-label={lead.title}>
        {lead.featuredImage ? (
          <img src={lead.featuredImage} alt={lead.title} loading="lazy" />
        ) : (
          <div className="cc-noimg">RE</div>
        )}
      </Link>
      <Link href={articleHref(lead)} className="cc-lead-link">
        <h3 className="cc-lead-title">{lead.title}</h3>
      </Link>

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
        .cc-head-row {
          display: flex; align-items: baseline; justify-content: space-between;
          gap: 12px; margin-bottom: 12px; flex-wrap: wrap;
        }
        .cc-head {
          display: block;
          font-family: var(--font-telugu-heading), serif;
          font-size: 14px;
          font-weight: 800;
          color: var(--n-900, #111827);
          text-transform: none;
          letter-spacing: 0.02em;
          text-decoration: none;
        }
        .cc-head span { color: var(--brand, #E01B1B); }

        /* image on top of the card */
        .cc-lead-img {
          display: block;
          overflow: hidden;
          border-radius: 4px;
          background: var(--n-100, #f3f4f6);
          margin-bottom: 9px;
        }
        .cc-lead-img img {
          width: 100%;
          aspect-ratio: 16/9;
          object-fit: cover;
          display: block;
          transition: transform 0.4s ease;
        }
        .cc-lead-img:hover img { transform: scale(1.03); }
        .cc-noimg {
          width: 100%;
          aspect-ratio: 16/9;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-telugu-heading), serif;
          font-weight: 800; font-size: 24px;
          color: var(--n-300, #d1d5db);
        }
        .cc-lead-link { display: block; text-decoration: none; }
        .cc-lead-title {
          font-family: var(--font-telugu-heading), serif;
          font-size: 15px;
          font-weight: 800;
          line-height: 1.3;
          color: var(--n-900, #111827);
          margin: 0 0 8px;
        }
        .cc-lead-link:hover .cc-lead-title { color: var(--brand-dark, #B91414); }

        /* sub-headlines as a single-column list (fits the narrow 4-up card) */
        .cc-grid {
          display: flex;
          flex-direction: column;
          border-top: 1px solid var(--paper-edge, rgba(0,0,0,0.1));
        }
        .cc-grid-item {
          font-family: var(--font-telugu-heading), serif;
          font-size: 13px;
          font-weight: 700;
          line-height: 1.35;
          color: var(--n-900, #111827);
          text-decoration: none;
          padding: 9px 0;
          border-bottom: 1px solid var(--paper-edge, rgba(0,0,0,0.08));
        }
        .cc-grid-item:last-child { border-bottom: none; }
        .cc-grid-item:hover { color: var(--brand-dark, #B91414); }

        @media (max-width: 600px) {
          .cc-lead-title { font-size: 15px; }
        }
      `}</style>
    </div>
  );
}

/** Two CategoryColumns side by side with a vertical divider - the IE 2-up unit. */
export function CategoryPair({ children }: { children: React.ReactNode }) {
  // A lone column would otherwise stretch full-width because auto-fit collapses
  // empty tracks - cap it so a single configured (or single non-empty) category
  // renders as a normal half-width card instead of full bleed.
  const single = Children.count(children) === 1;
  return (
    <div className={single ? "cp cp--single" : "cp"}>
      {children}
      <style>{`
        /* N-across responsive grid: 4 category cards fit in a row on desktop;
           collapses to 2 then 1 on narrower screens. auto-fit adapts to the
           number of columns the block is configured with. */
        .cp {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
          gap: 20px 24px;
          background: #fff;
          border: 1px solid var(--paper-edge, rgba(0,0,0,0.06));
          border-radius: 8px;
          padding: 16px 20px;
          margin-top: 8px;
        }
        /* Single-column block: don't let it span the full row. Cap to a card
           width and left-align so it reads as intentional, not stretched. */
        .cp--single {
          grid-template-columns: minmax(210px, 480px);
          justify-content: start;
        }
        @media (max-width: 700px) {
          .cp { grid-template-columns: 1fr 1fr; gap: 18px; }
        }
        @media (max-width: 430px) {
          .cp { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
