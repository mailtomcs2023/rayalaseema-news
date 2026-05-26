import { articleHref } from "@/lib/article-href";
interface OpinionArticle {
  id: string;
  title: string;
  summary: string;
  slug: string;
  featuredImage: string | null;
  publishedAt: string;
  author: { name: string };
  desk?: { name: string; nameEn: string } | null;
}

export function OpinionSection({ articles }: { articles: OpinionArticle[] }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="text-telugu-lg font-bold text-gray-900 mb-4 font-telugu border-b-2 border-orange-500 pb-2 flex items-center gap-2">
        <svg className="w-5 h-5 text-orange-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 12h-2v-2h2v2zm0-4h-2V6h2v4z" />
        </svg>
        సంపాదకీయం & అభిప్రాయం
      </h3>
      <div className="space-y-4">
        {articles.map((article) => (
          <a
            key={article.id}
            href={articleHref(article)}
            className="block group py-3 border-b border-gray-50 last:border-0"
          >
            <h4 className="text-sm font-semibold text-gray-900 font-telugu group-hover:text-orange-600 transition-colors line-clamp-2 leading-relaxed">
              {article.title}
            </h4>
            <div className="flex items-center gap-2 mt-1.5">
              <div className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center">
                <span className="text-xs text-orange-600 font-bold">
                  {(article.desk?.name ?? article.author.name)[0]}
                </span>
              </div>
              <span className="text-xs text-gray-500 font-telugu">{article.desk?.name ?? article.author.name}</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
