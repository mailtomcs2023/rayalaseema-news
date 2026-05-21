import Link from "next/link";

/**
 * Shared IE-style section wrapper — serif title + black underline header,
 * optional count, optional "more" footer link. Used by web-stories, photo-gallery, etc.
 * Guarantees every secondary section matches the bands' visual language.
 */
export function SectionShell({
  title,
  count,
  moreHref,
  moreLabel = "మరిన్ని",
  children,
}: {
  title: string;
  count?: string | number;
  moreHref?: string;
  moreLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="ss">
      <div className="ss-head">
        <span className="ss-title">
          {title} <span aria-hidden="true">›</span>
        </span>
        {count != null && <span className="ss-count">{count}</span>}
      </div>
      {children}
      {moreHref && (
        <Link href={moreHref} className="ss-more">
          {moreLabel} →
        </Link>
      )}
      <style>{`
        .ss {
          background: #fff;
          border: 1px solid var(--paper-edge, rgba(0,0,0,0.06));
          border-radius: 8px;
          padding: 14px 18px 16px;
          margin-top: 8px;
        }
        .ss-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          padding-bottom: 10px;
          border-bottom: 2px solid var(--n-900, #111827);
          margin-bottom: 14px;
        }
        .ss-title {
          font-family: var(--font-telugu-heading), serif;
          font-size: 20px;
          font-weight: 800;
          color: var(--n-900, #111827);
        }
        .ss-title span { color: var(--brand, #E01B1B); }
        .ss-count {
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 12px;
          color: var(--n-500, #6b7280);
        }
        .ss-more {
          display: block;
          text-align: center;
          margin-top: 14px;
          padding-top: 12px;
          border-top: 1px solid var(--paper-edge, rgba(0,0,0,0.08));
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 13px;
          font-weight: 800;
          color: var(--brand, #E01B1B);
          text-decoration: none;
        }
        .ss-more:hover { text-decoration: underline; text-underline-offset: 3px; }
      `}</style>
    </section>
  );
}
