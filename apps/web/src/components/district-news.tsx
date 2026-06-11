import { articleHref } from "@/lib/article-href";
import { Badge } from "@rayalaseema/ui";

interface DistrictArticle {
  id: string;
  title: string;
  slug: string;
  summary: string;
  featuredImage: string | null;
  publishedAt: string;
  viewCount?: number;
}

function formatTimeAgo(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return `${Math.floor(diff / 60000)} ని. క్రితం`;
  if (hours < 24) return `${hours} గం. క్రితం`;
  return `${Math.floor(hours / 24)} రోజుల క్రితం`;
}

export function DistrictNews({ articles }: { articles: DistrictArticle[] }) {
  const districts = [
    { name: "కర్నూలు", slug: "kurnool", active: true },
    { name: "నంద్యాల", slug: "nandyal", active: false },
    { name: "అనంతపురం", slug: "anantapur", active: false },
    { name: "శ్రీ సత్యసాయి", slug: "sri-sathya-sai", active: false },
    { name: "వై.యస్.ఆర్", slug: "ysr", active: false },
    { name: "తిరుపతి", slug: "tirupati", active: false },
    { name: "అన్నమయ్య", slug: "annamayya", active: false },
    { name: "చిత్తూరు", slug: "chittoor", active: false },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="text-telugu-lg font-bold text-gray-900 mb-3 font-telugu border-b-2 border-orange-500 pb-2">
        జిల్లా వార్తలు
      </h3>

      {/* District Tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {districts.map((d) => (
          <button
            key={d.slug}
            className={`px-2.5 py-1 text-xs rounded-full font-telugu transition-colors ${
              d.active
                ? "bg-primary-500 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {d.name}
          </button>
        ))}
      </div>

      {/* Articles */}
      <div className="space-y-3">
        {articles.map((article) => (
          <a
            key={article.id}
            href={articleHref(article)}
            className="flex gap-3 group py-2 border-b border-gray-50 last:border-0"
          >
            <div className="w-20 h-16 shrink-0 rounded-lg overflow-hidden">
              {article.featuredImage ? (
                <img
                  src={article.featuredImage}
                  alt={article.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full bg-gray-50 flex items-center justify-center">
                  {/* No featured image - show the brand logo instead of "RE" text */}
                  <img src="/logo-icon.png" alt="Rayalaseema News" className="h-9 w-auto object-contain opacity-60" loading="lazy" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-semibold text-gray-800 font-telugu line-clamp-2 leading-relaxed group-hover:text-primary-500 transition-colors">
                {article.title}
              </h4>
              <span className="text-[10px] text-gray-400 mt-1 block">
                {formatTimeAgo(article.publishedAt)}
              </span>
            </div>
          </a>
        ))}
      </div>

      <a
        href="/district-news"
        className="block text-center text-sm text-primary-500 font-medium mt-3 hover:underline"
      >
        మరిన్ని జిల్లా వార్తలు →
      </a>
    </div>
  );
}
