import Link from "next/link";
import { Badge } from "@rayalaseema/ui";

interface Article {
  id: string;
  title: string;
  slug: string;
  summary: string;
  featuredImage: string | null;
  publishedAt: string;
  updatedAt?: string;
  viewCount?: number;
  desk?: { name: string } | null;
}

interface CategorySectionProps {
  category: { name: string; nameEn: string; slug: string; color: string };
  articles: Article[];
  layout?: "featured" | "grid" | "list";
}

function formatTimeAgo(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/** Newest of publishedAt vs updatedAt — newspaper convention: card shows
 *  whichever was most recent so readers can spot freshly-edited stories. */
function effectiveTime(a: Article): string {
  if (a.updatedAt && a.publishedAt) {
    return new Date(a.updatedAt).getTime() > new Date(a.publishedAt).getTime()
      ? a.updatedAt
      : a.publishedAt;
  }
  return a.publishedAt || a.updatedAt || "";
}

/** Compact byline: shows desk name + relative timestamp (with Telugu dot separator). */
function byline(a: Article): string {
  const t = formatTimeAgo(effectiveTime(a));
  return a.desk?.name ? `${a.desk.name} · ${t}` : t;
}

function ArticleCardLarge({ article, color }: { article: Article; color: string }) {
  return (
    <Link href={`/article/${article.slug}`} className="group block">
      <div className="relative aspect-[16/10] rounded-xl overflow-hidden mb-3">
        {article.featuredImage ? (
          <img
            src={article.featuredImage}
            alt={article.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
            <span className="text-gray-300 text-4xl font-bold">RE</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <h3 className="text-telugu-lg font-bold text-gray-900 font-telugu line-clamp-2 group-hover:text-primary-500 transition-colors">
        {article.title}
      </h3>
      <p className="text-telugu-sm text-gray-500 font-telugu line-clamp-2 mt-1.5">
        {article.summary}
      </p>
      <div className="flex items-center gap-2 mt-2 text-xs text-gray-400 font-telugu">
        <span>{byline(article)}</span>
        {article.viewCount && (
          <>
            <span>•</span>
            <span>{article.viewCount.toLocaleString()} views</span>
          </>
        )}
      </div>
    </Link>
  );
}

function ArticleCardSmall({ article, color }: { article: Article; color: string }) {
  return (
    <Link href={`/article/${article.slug}`} className="group block">
      <div className="relative aspect-video rounded-lg overflow-hidden mb-2.5">
        {article.featuredImage ? (
          <img
            src={article.featuredImage}
            alt={article.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
            <span className="text-gray-300 text-2xl font-bold">RE</span>
          </div>
        )}
      </div>
      <h3 className="text-telugu-base font-semibold text-gray-900 font-telugu line-clamp-2 group-hover:text-primary-500 transition-colors">
        {article.title}
      </h3>
      <p className="text-telugu-sm text-gray-500 font-telugu line-clamp-2 mt-1">
        {article.summary}
      </p>
      <span className="text-xs text-gray-400 mt-1.5 block font-telugu">
        {byline(article)}
      </span>
    </Link>
  );
}

function ArticleCardList({ article, color }: { article: Article; color: string }) {
  return (
    <Link
      href={`/article/${article.slug}`}
      className="group flex gap-4 py-4 border-b border-gray-100 last:border-0"
    >
      <div className="w-36 h-24 shrink-0 rounded-lg overflow-hidden">
        {article.featuredImage ? (
          <img
            src={article.featuredImage}
            alt={article.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center rounded-lg">
            <span className="text-gray-300 text-xl font-bold">RE</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-telugu-base font-semibold text-gray-900 font-telugu line-clamp-2 group-hover:text-primary-500 transition-colors">
          {article.title}
        </h3>
        <p className="text-telugu-sm text-gray-500 font-telugu line-clamp-1 mt-1">
          {article.summary}
        </p>
        <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400 font-telugu">
          <span>{byline(article)}</span>
          {article.viewCount && (
            <>
              <span>•</span>
              <span>{article.viewCount.toLocaleString()} views</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

export function CategorySection({ category, articles, layout = "grid" }: CategorySectionProps) {
  if (articles.length === 0) return null;

  return (
    <section>
      {/* Category Header */}
      <div className="flex items-center justify-between mb-5 border-b-2 pb-3" style={{ borderColor: category.color }}>
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-7 rounded-full" style={{ backgroundColor: category.color }} />
          <h2 className="text-telugu-xl font-bold text-gray-900 font-telugu">
            {category.name}
          </h2>
          <span className="text-sm text-gray-400 font-medium">{category.nameEn}</span>
        </div>
        <Link
          href={`/category/${category.slug}`}
          className="text-sm font-medium hover:underline transition-colors"
          style={{ color: category.color }}
        >
          అన్నీ చూడండి →
        </Link>
      </div>

      {/* Featured Layout: 1 big + rest small */}
      {layout === "featured" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ArticleCardLarge article={articles[0]} color={category.color} />
          <div className="space-y-5">
            {articles.slice(1).map((article) => (
              <ArticleCardList key={article.id} article={article} color={category.color} />
            ))}
          </div>
        </div>
      )}

      {/* Grid Layout */}
      {layout === "grid" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {articles.map((article) => (
            <ArticleCardSmall key={article.id} article={article} color={category.color} />
          ))}
        </div>
      )}

      {/* List Layout */}
      {layout === "list" && (
        <div>
          {articles.map((article) => (
            <ArticleCardList key={article.id} article={article} color={category.color} />
          ))}
        </div>
      )}
    </section>
  );
}
