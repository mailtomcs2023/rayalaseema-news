import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { AboveFold } from "@/components/above-fold";
import { VideoSection } from "@/components/video-section";
import { CinemaBand } from "@/components/cinema-band";
import { SectionBand } from "@/components/section-band";
import { CategoryColumn, CategoryPair } from "@/components/category-column";
import { PhotoGallery } from "@/components/photo-gallery";
import { AdBannerMid, AdInFeedBanner, AdLeaderboard, AdHeaderLeaderboard } from "@/components/ad-slots";
import { WebStories } from "@/components/web-stories";
import { ReturnVisitBanner } from "@/components/return-visit-banner";
import { getFullHomepageData, getCricketScores } from "@/lib/db-queries";
import { cookies } from "next/headers";

export default async function HomePage() {
  const cookieStore = await cookies();
  const myDistrictSlug = cookieStore.get("my-district")?.value || null;
  const [{ featured, breakingNews, articlesByCategory, categories, videos, galleries, webStories, reels, cartoons, ads, config, districtArticles }, cricketScores] =
    await Promise.all([getFullHomepageData(myDistrictSlug), getCricketScores()]);

  // ===== ABOVE-FOLD — regional: lead + district grid + breaking/latest rail =====
  const toAF = (a: any) => ({
    id: a.id,
    title: a.title,
    slug: a.slug,
    summary: a.summary || null,
    featuredImage: a.featuredImage || null,
    publishedAt: a.publishedAt?.toISOString() || null,
    category: { name: a.category.name, color: a.category.color || "#E01B1B", slug: a.category.slug },
  });

  const AF_EXCLUDE = new Set(["rasi-phalalu", "weather", "navyaseema"]);
  const afPool = Object.values(articlesByCategory)
    .flat()
    .filter((a) => !AF_EXCLUDE.has(a.category.slug))
    .sort((x, y) => (y.publishedAt?.getTime() || 0) - (x.publishedAt?.getTime() || 0));
  const afSeen = new Set<string>();
  const afUnique = afPool.filter((a) => (afSeen.has(a.id) ? false : afSeen.add(a.id)));

  const featuredHard = featured.find((a) => !AF_EXCLUDE.has(a.category.slug));
  const afLeadSrc = featuredHard || afUnique[0] || null;
  const afLead = afLeadSrc ? toAF(afLeadSrc) : null;
  const afLatest = afLead
    ? afUnique.filter((a) => a.id !== afLead.id).slice(0, 8).map(toAF)
    : [];

  const afDistricts = Object.values(districtArticles)
    .map((d) => ({
      name: d.district.name,
      slug: d.district.slug,
      articles: d.articles.map((a) => ({ id: a.id, title: a.title, slug: a.slug })),
    }))
    .sort((x, y) => y.articles.length - x.articles.length)
    .slice(0, 8);

  const afBreaking = breakingNews.map((b) => ({ id: b.id, text: b.headline }));

  // ===== CINEMA band — entertainment + movie-reviews, Tollywood-first =====
  const cinemaPool = [
    ...(articlesByCategory["entertainment"] || []),
    ...(articlesByCategory["movie-reviews"] || []),
  ].sort((x, y) => (y.publishedAt?.getTime() || 0) - (x.publishedAt?.getTime() || 0));
  const toCinema = (a: any) => ({
    id: a.id,
    title: a.title,
    slug: a.slug,
    summary: a.summary || null,
    featuredImage: a.featuredImage || null,
    label: a.category.name,
  });
  const cinemaLead = cinemaPool[0] ? toCinema(cinemaPool[0]) : null;
  const cinemaGrid = cinemaPool.slice(1, 5).map(toCinema);
  const cinemaReviews = (articlesByCategory["movie-reviews"] || [])
    .slice(0, 8)
    .map((a: any) => ({
      id: a.id,
      title: a.title,
      slug: a.slug,
      reviewerName: a.reviewerName ?? null,
      rating: typeof a.rating === "number" ? a.rating : null,
    }));

  const catName = (slug: string) => categories.find((c) => c.slug === slug)?.name || slug;

  // ===== FULL-WIDTH BANDS — politics + sports (like cinema) =====
  const toBand = (a: any) => ({
    id: a.id,
    title: a.title,
    slug: a.slug,
    summary: a.summary || null,
    featuredImage: a.featuredImage || null,
    label: a.category.name,
  });
  const bandData = (slug: string) => {
    const arts = articlesByCategory[slug] || [];
    if (!arts[0]) return null;
    return {
      lead: toBand(arts[0]),
      grid: arts.slice(1, 5).map(toBand),
      trending: [...arts]
        .sort((x: any, y: any) => (y.viewCount || 0) - (x.viewCount || 0))
        .slice(0, 6)
        .map((a: any) => ({ id: a.id, title: a.title, slug: a.slug, publishedAt: a.publishedAt?.toISOString() || null })),
    };
  };
  const politicsBand = bandData("politics");
  const sportsBand = bandData("sports");

  // Politics cartoon (latest), sports live scores
  const latestCartoon = cartoons[0]
    ? {
        title: cartoons[0].title,
        caption: cartoons[0].caption,
        image: cartoons[0].imageUrl,
        date: cartoons[0].date.toLocaleDateString("te-IN", { month: "long", day: "numeric" }),
      }
    : null;

  // ===== CATEGORY columns — IE 2-up compact pairs (politics/sports excluded — they're bands) =====
  const toCol = (a: any) => ({
    id: a.id,
    title: a.title,
    slug: a.slug,
    summary: a.summary || null,
    featuredImage: a.featuredImage || null,
  });
  const colData = (slug: string) => {
    const arts = articlesByCategory[slug] || [];
    if (!arts[0]) return null;
    return {
      title: catName(slug),
      slug,
      lead: toCol(arts[0]),
      items: arts.slice(1, 5).map(toCol),
    };
  };
  const COL_ORDER = [
    "national", "business", "crime", "technology",
    "agriculture", "international", "education", "health",
  ];
  const cols = COL_ORDER.map(colData).filter((c): c is NonNullable<typeof c> => c !== null);
  // Chunk into pairs of 2
  const colPairs: (typeof cols)[] = [];
  for (let i = 0; i < cols.length; i += 2) colPairs.push(cols.slice(i, i + 2));

  // ===== VIDEOS =====
  const videoItems = videos.map((v) => ({
    id: v.id,
    title: v.title,
    slug: v.slug,
    thumbnail: v.thumbnailUrl,
    videoUrl: v.videoUrl,
    duration: v.duration,
    views: v.views,
    category: (v as any).category?.name || null,
  }));

  const photoGalleryItems = galleries.map((g) => ({
    id: g.id,
    title: g.title,
    image: g.coverImage,
    count: g._count.photos,
  }));

  const adItems = ads.map((a) => ({ id: a.id, position: a.position, htmlContent: a.htmlContent, imageUrl: a.imageUrl, linkUrl: a.linkUrl, name: a.name }));

  return (
    <div className="min-h-screen bg-gray-100">
      <ReturnVisitBanner />
      <Header config={config} breakingNews={breakingNews.map((b) => ({ id: b.id, text: b.headline }))} />

      <AdHeaderLeaderboard ads={adItems} />

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "2px 8px 0" }}>
        {/* SECTION 1 — regional above-fold (only when at least one article exists) */}
        {afLead ? (
          <AboveFold lead={afLead} districts={afDistricts} breaking={afBreaking} latest={afLatest} />
        ) : (
          <div style={{ padding: "60px 16px", textAlign: "center", background: "#fff", border: "1px solid #eee", borderRadius: 8, margin: "12px 0" }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111", marginBottom: 8 }}>వార్తలు త్వరలో…</h2>
            <p style={{ fontSize: 14, color: "#666" }}>No published articles yet. Add content from the admin panel.</p>
          </div>
        )}

        {/* Ad */}
        <div style={{ marginTop: 8 }}><AdBannerMid ads={adItems} /></div>

        {/* SECTION 2 — Politics band */}
        {politicsBand && (
          <SectionBand
            brand="రాజకీయం"
            brandHref="/category/politics"
            tabs={[
              { label: "ఆంధ్రప్రదేశ్", href: "/category/politics" },
              { label: "జాతీయం", href: "/category/national" },
            ]}
            lead={politicsBand.lead}
            grid={politicsBand.grid}
            trending={politicsBand.trending}
            cartoon={latestCartoon}
          />
        )}

        {/* SECTION 3 — Cinema band */}
        {cinemaLead && <CinemaBand lead={cinemaLead} grid={cinemaGrid} reviews={cinemaReviews} />}

        {/* SECTION 4 — RE Videos */}
        {videos.length > 0 && <VideoSection videos={videoItems} />}

        {/* SECTION 5 — Sports band */}
        {sportsBand && (
          <SectionBand
            brand="క్రీడలు"
            brandHref="/category/sports"
            tabs={[
              { label: "క్రికెట్", href: "/category/sports" },
              { label: "ఐపీఎల్", href: "/category/sports" },
            ]}
            lead={sportsBand.lead}
            grid={sportsBand.grid}
            trending={sportsBand.trending}
            scores={cricketScores}
          />
        )}

        {/* SECTION 4 — Category pairs (IE 2-up) with an ad break midway */}
        {colPairs.map((pair, i) => (
          <div key={i}>
            <CategoryPair>
              {pair.map((c) => (
                <CategoryColumn key={c.slug} title={c.title} slug={c.slug} lead={c.lead} items={c.items} />
              ))}
            </CategoryPair>
            {i === 1 && <div style={{ marginTop: 8 }}><AdLeaderboard ads={adItems} /></div>}
          </div>
        ))}

        {/* SECTION 5 — Web stories (dedicated strip) + photo gallery */}
        {webStories.length > 0 && <WebStories items={webStories.map((s) => ({ id: s.id, title: s.title, image: s.imageUrl, category: s.category || "" }))} />}
        {galleries.length > 0 && <PhotoGallery photos={photoGalleryItems} />}
        <AdInFeedBanner ads={adItems} />
      </main>

      <Footer config={config} />
    </div>
  );
}
