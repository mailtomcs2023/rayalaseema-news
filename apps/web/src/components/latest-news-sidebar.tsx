import { articleHref } from "@/lib/article-href";
import Link from "next/link";

interface NewsItem {
  id: string;
  title: string;
  slug: string;
}

const IconClock = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 7v5l3 2"/>
  </svg>
);

export function LatestNewsSidebar({ items }: { items: NewsItem[] }) {
  return (
    <div className="bg-white">
      {/* Left-aligned section head - was: centered title with em-dashes */}
      <div className="section-head">
        <span className="section-head__icon"><IconClock /></span>
        <span className="section-head__label">తాజా వార్తలు</span>
        <span className="section-head__tail">latest</span>
      </div>

      <div style={{ padding: "var(--sp-2) var(--sp-3)" }}>
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {items.map((item) => (
            <li key={item.id} style={{ borderBottom: "1px solid var(--paper-edge)" }}>
              <Link
                href={articleHref(item)}
                className="group hover-brand"
                style={{ display: "flex", alignItems: "flex-start", gap: "var(--sp-2)", padding: "var(--sp-2) 0" }}
              >
                <span className="news-bullet-dot" style={{ marginTop: 9 }} />
                <span className="news-headline-bullet group-hover:text-[var(--color-brand)]" style={{ transition: "color var(--dur-fast) var(--ease)" }}>
                  {item.title}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
