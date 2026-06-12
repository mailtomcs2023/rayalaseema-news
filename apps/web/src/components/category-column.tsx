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
            (Replaces the retired top ticker bar.) Rendered as a single-line,
            always-scrolling marquee that fills the leftover heading width - the
            row stays a FIXED single-line height so every card's lead image
            starts at the same Y and the images align across the row.
            The strip is rendered twice so the -50% translate loops seamlessly. */}
        {slug === "business" || slug === "national" ? (
          <div className="cc-head-strip">
            <div className="cc-head-strip-track">
              {slug === "business" ? (
                <>
                  <BullionStrip />
                  <BullionStrip />
                </>
              ) : (
                <>
                  <ForexStrip />
                  <ForexStrip />
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* LEAD - image on top, headline below (vertical card for 4-up rows) */}
      <Link href={articleHref(lead)} className="cc-lead-img" aria-label={lead.title}>
        {lead.featuredImage ? (
          <img src={lead.featuredImage} alt={lead.title} loading="lazy" />
        ) : (
          <div className="cc-noimg"><img src="/logo-icon.png" alt="రాయలసీమ న్యూస్" loading="lazy" /></div>
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
        /* District-grid look: NO boxes - columns sit on one white panel,
           separated by vertical dividers, with a red heading + red ▸ bullets
           on the sub-headlines. (Mirrors the రాయలసీమ జిల్లాలు grid.) */
        .cc {
          min-width: 0;
          display: flex;
          flex-direction: column;
          padding: 2px 18px;
          border-right: 1px solid var(--paper-edge, rgba(0,0,0,0.10));
        }
        .cc:first-child { padding-left: 0; }
        .cc:last-child { border-right: none; padding-right: 0; }

        /* Heading: red category name (no bar / box). FIXED single-line height
           so the price strip can never grow it - that keeps every card's lead
           image at the same Y, aligning the images across the whole row. */
        .cc-head-row {
          display: flex; align-items: center;
          gap: 10px; flex-wrap: nowrap;
          height: 24px;
          margin-bottom: 9px;
          overflow: hidden;
        }
        .cc-head {
          flex: 0 0 auto;
          display: inline-flex; align-items: center; gap: 5px;
          white-space: nowrap;
          font-family: var(--font-telugu-heading), serif;
          font-size: 14px; font-weight: 800;
          color: var(--brand, #E01B1B);
          letter-spacing: 0.01em;
          text-decoration: none;
        }
        .cc-head span { color: var(--brand, #E01B1B); opacity: 0.6; }
        .cc-head:hover { color: var(--brand-dark, #B91414); }

        /* Contextual price strip - fills the leftover heading width, clipped to
           one line, auto-scrolling continuously. Two copies of the strip sit in
           the track; translateX(-50%) scrolls exactly one copy, so the loop is
           seamless. Edges are softened with a mask so chips fade in/out. */
        .cc-head-strip {
          flex: 1 1 0; min-width: 0; overflow: hidden;
          -webkit-mask-image: linear-gradient(90deg, transparent, #000 14px, #000 calc(100% - 14px), transparent);
          mask-image: linear-gradient(90deg, transparent, #000 14px, #000 calc(100% - 14px), transparent);
        }
        .cc-head-strip-track {
          display: inline-flex; width: max-content;
          animation: cc-marq 20s linear infinite;
        }
        .cc-head-strip:hover .cc-head-strip-track { animation-play-state: paused; }
        /* Each copy must stay on ONE line (the base .hdr-strip wraps). */
        .cc-head-strip-track .hdr-strip { flex-wrap: nowrap; padding-left: 14px; }
        @keyframes cc-marq {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .cc-head-strip-track { animation: none; }
        }

        /* Lead image. */
        .cc-lead-img {
          display: block;
          overflow: hidden;
          border-radius: 4px;
          background: var(--n-100, #f3f4f6);
          margin-bottom: 8px;
        }
        .cc-lead-img img {
          width: 100%;
          /* FIXED height (not aspect-ratio) so the image height never depends on
             the column width. A block that ends up 3-up (e.g. a category got
             dropped for having no articles) has wider columns than a 4-up block,
             and width-based 16/9 would make those images taller. A fixed height
             keeps every lead image identical across all blocks. */
          height: 165px;
          object-fit: cover;
          display: block;
        }
        .cc-noimg {
          width: 100%;
          height: 165px;
          display: flex; align-items: center; justify-content: center;
          background: var(--n-100, #f3f4f6);
          border-radius: 4px;
        }
        .cc-noimg img { width: 64px; height: auto; object-fit: contain; opacity: 0.5; }

        .cc-lead-link { display: block; text-decoration: none; }
        .cc-lead-title {
          font-family: var(--font-telugu-heading), serif;
          font-size: 14px;
          font-weight: 700;
          line-height: 1.35;
          color: var(--n-900, #111827);
          margin: 0;
        }
        .cc-lead-link:hover .cc-lead-title { color: var(--brand-dark, #B91414); }

        /* Sub-headlines: red ▸ bullet + thin top separator (district style). */
        .cc-grid {
          display: flex;
          flex-direction: column;
          flex: 1 1 auto;
          margin-top: 8px;
        }
        .cc-grid-item {
          display: flex; align-items: flex-start; gap: 6px;
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 12.5px;
          font-weight: 600;
          line-height: 1.42;
          color: var(--n-700, #374151);
          text-decoration: none;
          padding: 7px 0;
          border-top: 1px solid #e5e7eb;
        }
        .cc-grid-item::before {
          content: "▸";
          color: var(--brand, #E01B1B);
          font-size: 11px;
          line-height: 1.42;
          flex-shrink: 0;
        }
        .cc-grid-item:hover { color: var(--brand-dark, #B91414); }
        .cc-grid-item:hover::before { color: var(--brand-dark, #B91414); }

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
          gap: 0;
          margin-top: 12px;
          /* One white panel behind the whole group; columns touch (gap:0) so the
             per-column border-right reads as a clean vertical divider. */
          background: #fff;
          border: 1px solid var(--paper-edge, rgba(0,0,0,0.08));
          border-radius: 10px;
          padding: 12px 18px;
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
