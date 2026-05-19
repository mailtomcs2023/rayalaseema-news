import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { NewsSlider } from "@/components/news-slider";
import { LatestNewsSidebar } from "@/components/latest-news-sidebar";
import { NewsGrid } from "@/components/news-grid";
import { DistrictNewsGrid } from "@/components/district-news-grid";
import { VideoWidget } from "@/components/video-widget";
import { PhotoGallery } from "@/components/photo-gallery";
import {
  AdSidebarSquare,
  AdBannerMid,
  AdInFeedBanner,
  AdLeaderboard,
  AdHeaderLeaderboard,
  AdSidebarSticky,
} from "@/components/ad-slots";
import { MovieGallery, TrendingReels } from "@/components/movie-gallery";
import { YettetaCartoon } from "@/components/yetteta-cartoon";
import { WebStories } from "@/components/web-stories";
import { ReturnVisitBanner } from "@/components/return-visit-banner";
import { SidebarWidgetsTabs } from "@/components/sidebar-widgets-tabs";
import { getFullHomepageData } from "@/lib/db-queries";
import { cookies } from "next/headers";

export default async function HomePage() {
  const cookieStore = await cookies();
  const myDistrictSlug = cookieStore.get("my-district")?.value || null;
  // Fetch ALL data from PostgreSQL - articles, videos, galleries, reels, stories, cartoons, ads
  const { featured, latest, breakingNews, articlesByCategory, categories, videos, galleries, webStories, reels, cartoons, ads, config, districtArticles } = await getFullHomepageData(myDistrictSlug);

  // Map DB articles to slider format
  const sliderItems = featured.map((a) => ({
    id: a.id,
    title: a.title,
    summary: a.summary || "",
    slug: a.slug,
    category: { name: a.category.name, color: a.category.color || "#FF2C2C", slug: a.category.slug },
    featuredImage: a.featuredImage || "",
    publishedAt: a.publishedAt?.toISOString() || new Date().toISOString(),
    author: { name: a.author.name },
  }));

  // Map DB articles to news grid format (take first 8)
  const allDbArticles = Object.values(articlesByCategory).flat();
  const newsGridItems = allDbArticles.slice(0, 8).map((a) => ({
    id: a.id,
    title: a.title,
    slug: a.slug,
    summary: a.summary || "",
    featuredImage: a.featuredImage,
    label: a.category.name,
  }));

  // Map DB articles to latest news sidebar
  const latestNewsItems = latest.map((a) => ({
    id: a.id,
    title: a.title,
    slug: a.slug,
  }));

  // Helper to get articles for a category (from DB or empty)
  const catArticles = (slug: string) =>
    (articlesByCategory[slug] || []).map((a) => ({
      id: a.id,
      title: a.title,
      slug: a.slug,
      summary: a.summary || "",
      featuredImage: a.featuredImage,
      publishedAt: a.publishedAt?.toISOString() || new Date().toISOString(),
      viewCount: a.viewCount,
    }));

  // Map DB videos to component format
  const videoItems = videos.map((v) => ({
    id: v.id,
    title: v.title,
    thumbnail: v.thumbnailUrl,
    duration: v.duration || "",
    views: v.views,
  }));

  // Helper to get category Telugu name from DB
  const catName = (slug: string) => {
    const cat = categories.find((c) => c.slug === slug);
    return cat?.name || slug;
  };

  // Helper to get category color from DB (falls back to brand red)
  const catColor = (slug: string) => {
    const cat = categories.find((c) => c.slug === slug);
    return cat?.color || "#FF2C2C";
  };

  // Map DB galleries to component format
  const photoGalleryItems = galleries.map((g) => ({
    id: g.id,
    title: g.title,
    image: g.coverImage,
    count: g._count.photos,
  }));

  // Serialize ads for client components
  const adItems = ads.map((a) => ({ id: a.id, position: a.position, htmlContent: a.htmlContent, imageUrl: a.imageUrl, linkUrl: a.linkUrl, name: a.name }));

  return (
    <div className="min-h-screen bg-gray-100">
      <ReturnVisitBanner />
      <Header config={config} breakingNews={breakingNews.map((b) => ({ id: b.id, text: b.headline }))} />

      <AdHeaderLeaderboard ads={adItems} />

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "2px 8px 0" }}>
        {/* ===== SECTION 1: Slider + తాజా వార్తలు ===== */}
        <div className="home-section-1">
          {/* Left: Slider + News Grid */}
          <div className="panel home-main">
            <NewsSlider items={sliderItems} />
            <AdBannerMid ads={adItems} />
            <DistrictNewsGrid districts={Object.values(districtArticles).map((d) => ({
              district: d.district,
              articles: d.articles.map((a) => ({
                ...a,
                publishedAt: a.publishedAt?.toISOString() || null,
              })),
            }))} />
          </div>
          {/* Right: Latest News sidebar — widgets grouped into tabs to reduce scroll */}
          <div className="panel home-sidebar">
            <LatestNewsSidebar items={latestNewsItems} />
            <SidebarWidgetsTabs />
            <AdSidebarSquare ads={adItems} />
          </div>
        </div>

        {/* ===== SECTION 2: Video + Movies + Reels (only if content exists) ===== */}
        {(videos.length > 0 || webStories.length > 0 || reels.length > 0) && (
          <div className="home-section-media">
            {videos.length > 0 && <div className="category-card"><VideoWidget videos={videoItems} /></div>}
            {webStories.length > 0 && <div className="category-card"><MovieGallery items={webStories.slice(0, 6).map((s) => ({ id: s.id, title: s.title, image: s.imageUrl, tag: s.category || "", tagColor: "#DB2777", subtitle: s.category || "" }))} /></div>}
            {reels.length > 0 && <div className="category-card"><TrendingReels items={reels.map((r) => ({ id: r.id, title: r.title, image: r.thumbnailUrl, views: r.views }))} /></div>}
          </div>
        )}

        {/* ===== BELOW FOLD: 3-col category grid (filtered) + cartoon right sidebar (lg+) ===== */}
        <div className="home-section-content">
          {/* LEFT: cards + media flow */}
          <div className="home-content-left">
            {(() => {
              const allCats = [
                "politics", "sports", "entertainment",
                "national", "business", "agriculture",
                "international", "crime", "technology",
              ];
              const populated = allCats
                .map((slug) => ({ slug, title: catName(slug), color: catColor(slug), articles: catArticles(slug) }))
                .filter((c) => c.articles.length > 0);

              const half = Math.ceil(populated.length / 2);
              const top = populated.slice(0, half);
              const bottom = populated.slice(half);

              return (
                <>
                  {top.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {top.map((c) => <CategoryCard key={c.slug} {...c} />)}
                    </div>
                  )}

                  <AdLeaderboard ads={adItems} />

                  {bottom.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {bottom.map((c) => <CategoryCard key={c.slug} {...c} />)}
                    </div>
                  )}

                  {webStories.length > 0 && <WebStories items={webStories.map((s) => ({ id: s.id, title: s.title, image: s.imageUrl, category: s.category || "" }))} />}

                  {galleries.length > 0 && <PhotoGallery photos={photoGalleryItems} />}

                  <AdInFeedBanner ads={adItems} />
                </>
              );
            })()}
          </div>

          {/* RIGHT: Yetteta cartoon (lg+ only, sticky scroll) */}
          {cartoons.length > 0 && (
            <aside className="home-content-right hidden lg:block">
              <div className="cartoon-sticky">
                <YettetaCartoon items={cartoons.map((c) => ({ id: c.id, title: c.title, caption: c.caption, image: c.imageUrl, date: c.date.toLocaleDateString("te-IN", { month: "long", day: "numeric" }) }))} />
              </div>
            </aside>
          )}
        </div>
      </main>

      <Footer config={config} />
    </div>
  );
}

/* ---- Category Card — unified skeleton, design tokens, equal-height grid ---- */
function CategoryCard({
  title,
  slug,
  color,
  articles,
}: {
  title: string;
  slug: string;
  color?: string;
  articles: any[];
}) {
  if (!articles || articles.length === 0) return null;

  const tabColor = color || "var(--brand-dark)";
  const lead = articles[0];

  return (
    <article className="category-card" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Image — full-bleed top */}
      <a href={`/article/${lead.slug}`} className="block group" style={{ overflow: "hidden", background: "var(--n-100)" }}>
        {lead.featuredImage ? (
          <img
            src={lead.featuredImage}
            alt={lead.title}
            width={400}
            height={250}
            loading="lazy"
            decoding="async"
            style={{ aspectRatio: "16/10", objectFit: "cover", display: "block", width: "100%" }}
          />
        ) : (
          <div className="img-placeholder">
            <span>RE</span>
          </div>
        )}
      </a>

      {/* Category kicker — 3px rule + uppercase label (uniform regardless of text length) */}
      <div style={{ padding: "var(--sp-3) var(--sp-4) 0", position: "relative" }}>
        <span
          aria-hidden="true"
          style={{ display: "block", width: 32, height: 3, background: tabColor, marginBottom: 6 }}
        />
        <a
          href={`/category/${slug}`}
          style={{
            fontSize: "var(--t-xs)",
            fontWeight: 800,
            color: "var(--n-900)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            textDecoration: "none",
          }}
        >
          {title}
        </a>
      </div>

      {/* Lead title — fixed 2 lines for grid alignment */}
      <div style={{ padding: "var(--sp-2) var(--sp-3) var(--sp-1)" }}>
        <a href={`/article/${lead.slug}`} className="link-hover" style={{ textDecoration: "none", color: "inherit" }}>
          <h3 className="h-feature line-clamp-2" style={{ margin: 0, minHeight: "calc(1.3em * 2)" }}>
            {lead.title}
          </h3>
        </a>
      </div>

      {/* Bullet headlines — push to fill remaining height */}
      <ul style={{ listStyle: "none", margin: 0, padding: "var(--sp-2) var(--sp-3) var(--sp-3)", flex: 1 }}>
        {articles.slice(1, 4).map((article: any) => (
          <li key={article.id} style={{ marginBottom: "var(--sp-2)" }}>
            <a
              href={`/article/${article.slug}`}
              className="link-hover"
              style={{ display: "flex", alignItems: "flex-start", gap: "var(--sp-2)", textDecoration: "none", color: "inherit" }}
            >
              <span className="news-bullet-dot" style={{ marginTop: 8 }} />
              <span className="h-bullet line-clamp-2">{article.title}</span>
            </a>
          </li>
        ))}
      </ul>
    </article>
  );
}
