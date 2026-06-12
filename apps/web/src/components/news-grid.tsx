import { articleHref } from "@/lib/article-href";
import Link from "next/link";

interface NewsGridItem {
  id: string;
  title: string;
  slug: string;
  summary: string;
  featuredImage: string | null;
  label?: string;
  isLive?: boolean;
  isAd?: boolean;
}

export function NewsGrid({ items }: { items: NewsGridItem[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
      {items.map((item) => (
        <div
          key={item.id}
          className="border-b border-r border-gray-200 bg-white p-2.5 news-card"
        >
          <Link
            href={articleHref(item)}
            className="flex gap-3 group"
          >
            {/* Thumbnail */}
            <div className="w-[130px] h-[90px] shrink-0 overflow-hidden rounded">
              {item.featuredImage ? (
                <img
                  src={item.featuredImage}
                  alt={item.title}
                  className="w-full h-full object-cover news-card-img transition-transform duration-300"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full bg-gray-50 flex items-center justify-center">
                  <img src="/logo-icon.png" alt="రాయలసీమ న్యూస్" className="h-8 w-auto object-contain opacity-50" loading="lazy" />
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {item.isLive && (
                <span className="inline-flex items-center gap-1 text-[11px] text-[#FF2C2C] mb-0.5 fw-extrabold">
                  <span className="w-1.5 h-1.5 bg-[#FF2C2C] rounded-full animate-pulse" />
                  లైవ్ అప్‌డేట్స్:
                </span>
              )}
              {item.isAd && (
                <span className="text-[10px] text-gray-400 fw-bold">(ADVT)</span>
              )}
              {item.label && !item.isLive && (
                <span className="text-[11px] text-[#FF2C2C] block mb-0.5 fw-extrabold">
                  {item.label}
                </span>
              )}

              <h3
                className="leading-[1.55] line-clamp-3 group-hover:text-[#FF2C2C] transition-colors"
                style={{ fontSize: "var(--fs-body)", color: "#000" }}
              >
                {item.title}
              </h3>
              <p
                className="leading-[1.6] mt-1 line-clamp-1"
                style={{ fontSize: "var(--fs-body-sm)", color: "#555" }}
              >
                {item.summary}
              </p>
            </div>
          </Link>
        </div>
      ))}
    </div>
  );
}
