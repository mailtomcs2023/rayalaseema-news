import { prisma } from "@rayalaseema/db";

// Fetch site config from database
export async function getSiteConfig(): Promise<Record<string, string>> {
  const configs = await prisma.siteConfig.findMany();
  const map: Record<string, string> = {};
  configs.forEach((c) => (map[c.key] = c.value));
  return map;
}

// Fetch featured/slider articles
export async function getFeaturedArticles(limit = 6) {
  return prisma.article.findMany({
    where: { status: "PUBLISHED", featured: true },
    include: {
      category: { select: { name: true, nameEn: true, slug: true, color: true } },
      author: { select: { name: true } },
    },
    orderBy: { publishedAt: "desc" },
    take: limit,
  });
}

// Fetch latest articles (for sidebar)
export async function getLatestArticles(limit = 12) {
  return prisma.article.findMany({
    where: { status: "PUBLISHED" },
    select: { id: true, title: true, slug: true, publishedAt: true },
    orderBy: { publishedAt: "desc" },
    take: limit,
  });
}

// Fetch articles by category slug
export async function getArticlesByCategory(categorySlug: string, limit = 5) {
  return prisma.article.findMany({
    where: { status: "PUBLISHED", category: { slug: categorySlug } },
    include: {
      category: { select: { name: true, nameEn: true, slug: true, color: true } },
      author: { select: { name: true } },
    },
    orderBy: { publishedAt: "desc" },
    take: limit,
  });
}

// Fetch all published articles grouped by category (for homepage)
export async function getHomepageData() {
  const [
    featured,
    latest,
    breakingNews,
    categories,
    allArticles,
  ] = await Promise.all([
    getFeaturedArticles(6),
    getLatestArticles(12),
    prisma.breakingNews.findMany({
      where: {
        active: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { priority: "asc" },
    }),
    prisma.category.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.article.findMany({
      where: { status: "PUBLISHED" },
      include: {
        category: { select: { name: true, nameEn: true, slug: true, color: true } },
        author: { select: { name: true } },
      },
      orderBy: { publishedAt: "desc" },
      // Window must exceed total article count so every category is represented
      // on the homepage. TODO: switch to per-category queries once volume grows.
      take: 600,
    }),
  ]);

  // Group articles by category slug
  const articlesByCategory: Record<string, typeof allArticles> = {};
  for (const article of allArticles) {
    const slug = article.category.slug;
    if (!articlesByCategory[slug]) articlesByCategory[slug] = [];
    articlesByCategory[slug].push(article);
  }

  return {
    featured,
    latest,
    breakingNews,
    categories,
    articlesByCategory,
  };
}

// Fetch single article by slug
export async function getArticleBySlug(slug: string) {
  return prisma.article.findUnique({
    where: { slug },
    include: {
      category: { select: { name: true, nameEn: true, slug: true, color: true } },
      author: { select: { id: true, name: true, bio: true, avatar: true } },
      tags: { include: { tag: true } },
    },
  });
}

// Fetch trending articles (most viewed)
export async function getTrendingArticles(limit = 10) {
  return prisma.article.findMany({
    where: { status: "PUBLISHED" },
    select: { id: true, title: true, slug: true, viewCount: true, publishedAt: true },
    orderBy: { viewCount: "desc" },
    take: limit,
  });
}

// Increment article view count
export async function incrementViewCount(articleId: string) {
  return prisma.article.update({
    where: { id: articleId },
    data: { viewCount: { increment: 1 } },
  });
}

// ========== MULTIMEDIA QUERIES ==========

// Live cricket scores — RapidAPI "Cricket API Free Data" (cricbuzz-format).
// Live matches first; falls back to upcoming fixtures. Returns [] when unavailable.
export interface CricketMatch {
  id: string;
  name: string;
  status: string;
  teams: [string, string];
  score: { team: string; runs: number; wickets: number; overs: number }[];
  venue?: string;
  time?: string;
  isLive: boolean;
}

const RAPID_HOST = "cricket-api-free-data.p.rapidapi.com";

async function rapidGet(path: string) {
  const key = process.env.RAPIDAPI_CRICKET_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://${RAPID_HOST}${path}`, {
      headers: { "x-rapidapi-key": key, "x-rapidapi-host": RAPID_HOST },
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 120 },
    });
    const data = await res.json();
    return data?.status === "success" ? data.response : null;
  } catch {
    return null;
  }
}

// Map a cricbuzz-style innings score object to our flat shape.
function mapInnings(teamName: string, sc: any): { team: string; runs: number; wickets: number; overs: number } {
  const i = sc?.inngs1 || sc || {};
  return { team: teamName, runs: i.runs || 0, wickets: i.wickets || 0, overs: i.overs || 0 };
}

export async function getCricketScores(): Promise<CricketMatch[]> {
  // 1. Live matches
  const live = await rapidGet("/cricket-livescores");
  if (Array.isArray(live) && live.length > 0) {
    return live.slice(0, 4).map((m: any) => {
      const info = m.matchInfo || m;
      const t1 = info.team1?.teamSName || info.team1?.teamName || "T1";
      const t2 = info.team2?.teamSName || info.team2?.teamName || "T2";
      const ms = m.matchScore || {};
      const score = [
        ms.team1Score ? mapInnings(t1, ms.team1Score) : null,
        ms.team2Score ? mapInnings(t2, ms.team2Score) : null,
      ].filter(Boolean) as CricketMatch["score"];
      return {
        id: String(info.matchId || m.matchId || `${t1}-${t2}`),
        name: `${t1} vs ${t2}`,
        status: info.status || info.stateTitle || "లైవ్",
        teams: [t1, t2] as [string, string],
        score,
        venue: info.venueInfo ? [info.venueInfo.ground, info.venueInfo.city].filter(Boolean).join(", ") : undefined,
        isLive: true,
      };
    });
  }

  // 2. Fallback — next upcoming fixtures from schedule
  const sched = await rapidGet("/cricket-schedule");
  const out: CricketMatch[] = [];
  const days = sched?.schedules || [];
  for (const day of days) {
    const list = day?.scheduleAdWrapper?.matchScheduleList || [];
    for (const s of list) {
      for (const info of s.matchInfo || []) {
        const t1 = info.team1?.teamSName || info.team1?.teamName || "T1";
        const t2 = info.team2?.teamSName || info.team2?.teamName || "T2";
        const when = info.startDate ? new Date(Number(info.startDate)) : null;
        out.push({
          id: String(info.matchId),
          name: `${t1} vs ${t2}`,
          status: info.matchDesc || info.matchFormat || "షెడ్యూల్",
          teams: [t1, t2] as [string, string],
          score: [],
          venue: info.venueInfo ? [info.venueInfo.ground, info.venueInfo.city].filter(Boolean).join(", ") : undefined,
          time: when
            ? when.toLocaleString("te-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
            : undefined,
          isLive: false,
        });
        if (out.length >= 4) return out;
      }
    }
  }
  return out;
}

// Fetch videos (with category for the cinematic video section)
export async function getVideos(limit = 5) {
  return prisma.video.findMany({
    where: { active: true },
    orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: { category: { select: { name: true } } },
  });
}

// Fetch photo galleries
export async function getPhotoGalleries(limit = 4) {
  return prisma.photoGallery.findMany({
    where: { active: true },
    include: { _count: { select: { photos: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

// Fetch web stories
export async function getWebStories(limit = 12) {
  return prisma.webStory.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

// Fetch reels
export async function getReels(limit = 6) {
  return prisma.reel.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

// Fetch cartoons
export async function getCartoons(limit = 5) {
  return prisma.cartoon.findMany({
    where: { active: true },
    orderBy: { date: "desc" },
    take: limit,
  });
}

// Fetch ads by position
export async function getAdsByPosition(position: string) {
  return prisma.ad.findMany({
    where: {
      position: position as any,
      active: true,
      OR: [
        { endDate: null },
        { endDate: { gt: new Date() } },
      ],
    },
    take: 1,
  });
}

// Fetch all active ads
export async function getAllAds() {
  return prisma.ad.findMany({
    where: {
      active: true,
      OR: [
        { endDate: null },
        { endDate: { gt: new Date() } },
      ],
    },
  });
}

// Fetch district-wise latest articles for homepage
// myDistrictSlug: the user's preferred district (from cookie) - gets more articles
export async function getDistrictArticles(myDistrictSlug?: string | null) {
  const districts = await prisma.district.findMany({
    where: { active: true },
    select: { id: true, name: true, nameEn: true, slug: true },
    orderBy: { sortOrder: "asc" },
  });

  // Single query for all constituencies
  const allConstituencies = await prisma.constituency.findMany({
    where: { districtId: { in: districts.map((d) => d.id) } },
    select: { id: true, districtId: true },
  });

  // Group constituency IDs by district
  const constByDistrict: Record<string, string[]> = {};
  for (const c of allConstituencies) {
    if (!constByDistrict[c.districtId]) constByDistrict[c.districtId] = [];
    constByDistrict[c.districtId].push(c.id);
  }

  // Build OR conditions for all districts
  const allConstIds = allConstituencies.map((c) => c.id);

  // Single query for all district articles
  const allArticles = await prisma.article.findMany({
    where: {
      status: "PUBLISHED",
      OR: [
        { constituencyId: { in: allConstIds } },
        ...districts.flatMap((d) => [
          { title: { contains: d.name } },
          { title: { contains: d.nameEn, mode: "insensitive" as const } },
        ]),
      ],
    },
    select: {
      id: true, title: true, slug: true, summary: true,
      featuredImage: true, publishedAt: true, constituencyId: true,
      category: { select: { name: true, color: true } },
    },
    orderBy: { publishedAt: "desc" },
    take: 150,
  });

  // Group articles by district in memory
  const districtArticles: Record<string, { district: typeof districts[0]; articles: typeof allArticles }> = {};

  for (const d of districts) {
    const constIds = new Set(constByDistrict[d.id] || []);
    const nameL = d.name;
    const nameEnL = d.nameEn.toLowerCase();

    const articles = allArticles
      .filter((a) =>
        (a.constituencyId && constIds.has(a.constituencyId)) ||
        a.title.includes(nameL) ||
        a.title.toLowerCase().includes(nameEnL)
      )
      .slice(0, d.slug === myDistrictSlug ? 8 : 3);

    districtArticles[d.slug] = { district: d, articles };
  }

  return districtArticles;
}

// Fetch complete homepage data including multimedia
export async function getFullHomepageData(myDistrictSlug?: string | null) {
  const [base, videos, galleries, webStories, reels, cartoons, ads, config, districtArticles] = await Promise.all([
    getHomepageData(),
    getVideos(),
    getPhotoGalleries(),
    getWebStories(),
    getReels(),
    getCartoons(),
    getAllAds(),
    getSiteConfig(),
    getDistrictArticles(myDistrictSlug),
  ]);

  return { ...base, videos, galleries, webStories, reels, cartoons, ads, config, districtArticles };
}
