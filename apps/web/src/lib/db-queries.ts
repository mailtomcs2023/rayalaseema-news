// Spec #1 #110 - apps/web data layer reads from the unified Content table.
//
// Function signatures preserved so consumer components (above-fold, cinema-band,
// video-section, etc.) don't change. Per-type payload fields are projected to
// the top level of the returned row so consumers continue reading `v.videoUrl`
// or `c.rating` without knowing about the JSON payload column.
//
// Old per-table queries (prisma.article, prisma.video, prisma.webStory, etc.)
// are gone from this file. Those tables still exist in the DB but are dormant;
// they get dropped in #189 once every reader/writer has migrated.
import { prisma } from "@rayalaseema/db";
import { sanitizeAdHtml } from "./sanitize";

// Run admin-supplied ad markup through the sanitizer at the data layer so the
// client component can stop worrying about XSS. Centralising this also means
// any new caller that surfaces an Ad row is automatically safe.
function sanitizeAdRow<T extends { htmlContent?: string | null }>(ad: T): T {
  if (ad.htmlContent) {
    return { ...ad, htmlContent: sanitizeAdHtml(ad.htmlContent) };
  }
  return ad;
}

// Articles written before the new admin Content workspace existed are
// "old-style" - they should NOT appear on the homepage / category pages that
// were redesigned for the new template. Detail pages (/article/[slug]),
// search, tag, and author pages still surface them so existing links keep
// working. Bump this date if the cutover moment changes.
const NEW_TEMPLATE_ARTICLE_CUTOFF = new Date("2026-05-25T00:00:00.000Z");

// ---------- Helpers ----------

// Project ARTICLE-type payload fields onto the row so consumers can read
// `a.rating` / `a.reviewerName` directly (old Article had them as columns).
function projectArticle<T extends { payload?: unknown }>(row: T) {
  const p = (row.payload as Record<string, unknown> | null) || {};
  return {
    ...row,
    rating: typeof p.rating === "number" ? p.rating : null,
    reviewerName: typeof p.reviewerName === "string" ? p.reviewerName : null,
    // Old Article column moved into payload by the Spec #1 migration.
    imageCaption: typeof p.imageCaption === "string" ? p.imageCaption : null,
  };
}

// VIDEO payload projection - components want { thumbnailUrl, videoUrl, duration }
// at the top level. duration was a string ("12:45") on the old Video table; we
// keep it that way by formatting the integer seconds from the payload.
function projectVideo<T extends { featuredImage: string | null; viewCount: number; payload?: unknown }>(row: T) {
  const p = (row.payload as Record<string, unknown> | null) || {};
  const seconds = typeof p.duration === "number" ? p.duration : 0;
  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, "0");
  return {
    ...row,
    thumbnailUrl: (p.thumbnailUrl as string) || row.featuredImage || "",
    videoUrl: (p.videoUrl as string) || null,
    duration: seconds > 0 ? `${mm}:${ss}` : null,
    views: row.viewCount,
  };
}

// REEL payload - { clipUrl, duration }. views formatted as string for compat with
// the old Reel.views (string column like "2.5L").
function projectReel<T extends { featuredImage: string | null; viewCount: number; payload?: unknown }>(row: T) {
  const p = (row.payload as Record<string, unknown> | null) || {};
  return {
    ...row,
    thumbnailUrl: row.featuredImage || "",
    videoUrl: (p.clipUrl as string) || null,
    views: String(row.viewCount),
  };
}

// WEB_STORY - { slides: [{image, caption?}] }. imageUrl maps to featuredImage
// (cover image); category was a free-text string on the old WebStory.
function projectWebStory<T extends { featuredImage: string | null; payload?: unknown }>(row: T) {
  const p = (row.payload as Record<string, unknown> | null) || {};
  return {
    ...row,
    imageUrl: row.featuredImage || "",
    slides: Array.isArray(p.slides) ? p.slides : [],
    // `category` on old WebStory was a free-text string ("devotional" / "travel" /
    // ...). New Content uses the relational Category. Consumers read either; we
    // expose the relational slug as the string fallback.
    category: (row as any).category?.slug || null,
  };
}

// PHOTO_GALLERY - { photos: [{url, caption?}] }. Old _count.photos was the
// number of GalleryPhoto rows; we replace it with payload.photos.length.
function projectPhotoGallery<T extends { featuredImage: string | null; payload?: unknown }>(row: T) {
  const p = (row.payload as Record<string, unknown> | null) || {};
  const photos = Array.isArray(p.photos) ? (p.photos as Record<string, unknown>[]) : [];
  return {
    ...row,
    coverImage: row.featuredImage || "",
    photos,
    _count: { photos: photos.length },
  };
}

// CARTOON - { caption?, date ISO }. Old Cartoon table had imageUrl + caption +
// date columns; consumers read `.imageUrl`, `.caption`, `.date` directly.
function projectCartoon<T extends { featuredImage: string | null; payload?: unknown }>(row: T) {
  const p = (row.payload as Record<string, unknown> | null) || {};
  return {
    ...row,
    imageUrl: row.featuredImage || "",
    caption: (p.caption as string) || "",
    date: p.date ? new Date(p.date as string) : new Date(),
  };
}

// BREAKING_NEWS - { priority, expiresAt? }. Old BreakingNews used `headline`
// (we now use `title`) and had priority + expiresAt as columns.
function projectBreakingNews<T extends { title: string; payload?: unknown }>(row: T) {
  const p = (row.payload as Record<string, unknown> | null) || {};
  return {
    ...row,
    headline: row.title,
    priority: typeof p.priority === "number" ? p.priority : 0,
    expiresAt: p.expiresAt ? new Date(p.expiresAt as string) : null,
  };
}

// ---------- Site config ----------

export async function getSiteConfig(): Promise<Record<string, string>> {
  const configs = await prisma.siteConfig.findMany();
  const map: Record<string, string> = {};
  configs.forEach((c) => (map[c.key] = c.value));
  return map;
}

// ---------- Article queries (type=ARTICLE) ----------

export async function getFeaturedArticles(limit = 6) {
  const rows = await prisma.content.findMany({
    where: { type: "ARTICLE", status: "PUBLISHED", featured: true, createdAt: { gte: NEW_TEMPLATE_ARTICLE_CUTOFF } },
    include: {
      category: { select: { name: true, nameEn: true, slug: true, color: true } },
      author: { select: { name: true } },
      desk: { select: { name: true, nameEn: true } },
      // Constituency + district needed so articleHref() can build /[district]/[constituency]/<slug>-<id>
      constituency: { select: { slug: true, district: { select: { slug: true } } } },
    },
    orderBy: { publishedAt: "desc" },
    take: limit,
  });
  return rows.map(projectArticle);
}

export async function getLatestArticles(limit = 12) {
  return prisma.content.findMany({
    where: { type: "ARTICLE", status: "PUBLISHED", createdAt: { gte: NEW_TEMPLATE_ARTICLE_CUTOFF } },
    select: {
      id: true, title: true, slug: true, publishedAt: true,
      constituency: { select: { slug: true, district: { select: { slug: true } } } },
    },
    orderBy: { publishedAt: "desc" },
    take: limit,
  });
}

export async function getArticlesByCategory(categorySlug: string, limit = 5) {
  const rows = await prisma.content.findMany({
    where: { type: "ARTICLE", status: "PUBLISHED", category: { slug: categorySlug }, createdAt: { gte: NEW_TEMPLATE_ARTICLE_CUTOFF } },
    include: {
      category: { select: { name: true, nameEn: true, slug: true, color: true } },
      author: { select: { name: true } },
      desk: { select: { name: true, nameEn: true } },
      constituency: { select: { slug: true, district: { select: { slug: true } } } },
    },
    orderBy: { publishedAt: "desc" },
    take: limit,
  });
  return rows.map(projectArticle);
}

// Homepage articles grouped by category. Returns all-Article window since
// homepage layout assumes each category has its own rail.
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
    // Breaking news now lives in Content with type=BREAKING_NEWS. Project to
    // the old BreakingNews shape so the ticker doesn't have to change.
    prisma.content.findMany({
      where: { type: "BREAKING_NEWS", status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
    }).then((rows) => {
      const now = new Date();
      return rows
        .map(projectBreakingNews)
        .filter((b) => !b.expiresAt || b.expiresAt > now)
        .sort((a, b) => a.priority - b.priority);
    }),
    prisma.category.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.content.findMany({
      where: { type: "ARTICLE", status: "PUBLISHED", createdAt: { gte: NEW_TEMPLATE_ARTICLE_CUTOFF } },
      include: {
        category: { select: { name: true, nameEn: true, slug: true, color: true } },
        author: { select: { name: true } },
        constituency: { select: { slug: true, district: { select: { slug: true } } } },
      },
      orderBy: { publishedAt: "desc" },
      // Window must exceed total content count so every category is represented
      // on the homepage. TODO: switch to per-category queries once volume grows.
      take: 600,
    }),
  ]);

  // Group articles by category slug. Each row gets payload projected so
  // consumers can still read .rating / .reviewerName for movie reviews.
  const projected = allArticles.map(projectArticle);
  const articlesByCategory: Record<string, typeof projected> = {};
  for (const article of projected) {
    const slug = article.category?.slug;
    if (!slug) continue;
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

export async function getArticleBySlug(slug: string) {
  const row = await prisma.content.findUnique({
    where: { slug },
    include: {
      category: { select: { name: true, nameEn: true, slug: true, color: true } },
      // Author fields extended (Spec #4 B1 #197) so the NewsArticle JSON-LD
      // generator can build a full Person entity with sameAs + expertise.
      author: { select: { id: true, name: true, bio: true, avatar: true, publicProfileSlug: true, twitterHandle: true, linkedinUrl: true, facebookUrl: true, expertise: true, affiliations: true, role: true } },
      desk: { select: { name: true, nameEn: true, branch: true } },
      tags: { include: { tag: true } },
      // Full constituency + district shape (name + lat/lng) so the schema
      // generator can emit contentLocation/spatialCoverage as a Place with
      // GeoCoordinates.
      constituency: { select: { slug: true, name: true, nameEn: true, lat: true, lng: true, district: { select: { slug: true, name: true, nameEn: true, lat: true, lng: true } } } },
    },
  });
  if (!row || row.type !== "ARTICLE") return null;
  return projectArticle(row);
}

// Generic detail-page helpers per ContentType (Spec #1 #111). Each returns
// null when the slug isn't found, the type doesn't match, or the row isn't
// PUBLISHED - so the calling page can render a clean notFound().

export async function getVideoBySlug(slug: string) {
  const row = await prisma.content.findUnique({
    where: { slug },
    include: { category: { select: { name: true, slug: true, color: true } }, author: { select: { name: true } } },
  });
  if (!row || row.type !== "VIDEO" || row.status !== "PUBLISHED") return null;
  return projectVideo(row);
}

export async function getReelBySlug(slug: string) {
  const row = await prisma.content.findUnique({
    where: { slug },
    include: { category: { select: { name: true, slug: true, color: true } }, author: { select: { name: true } } },
  });
  if (!row || row.type !== "REEL" || row.status !== "PUBLISHED") return null;
  return projectReel(row);
}

export async function getWebStoryBySlug(slug: string) {
  const row = await prisma.content.findUnique({
    where: { slug },
    include: { category: { select: { name: true, slug: true } } },
  });
  if (!row || row.type !== "WEB_STORY" || row.status !== "PUBLISHED") return null;
  return projectWebStory(row);
}

export async function getPhotoGalleryBySlug(slug: string) {
  const row = await prisma.content.findUnique({
    where: { slug },
    include: { category: { select: { name: true, slug: true, color: true } } },
  });
  if (!row || row.type !== "PHOTO_GALLERY" || row.status !== "PUBLISHED") return null;
  return projectPhotoGallery(row);
}

export async function getCartoonBySlug(slug: string) {
  const row = await prisma.content.findUnique({
    where: { slug },
    include: { category: { select: { name: true, slug: true, color: true } } },
  });
  if (!row || row.type !== "CARTOON" || row.status !== "PUBLISHED") return null;
  return projectCartoon(row);
}

export async function getTrendingArticles(limit = 10) {
  return prisma.content.findMany({
    where: { type: "ARTICLE", status: "PUBLISHED" },
    select: {
      id: true, title: true, slug: true, viewCount: true, publishedAt: true,
      constituency: { select: { slug: true, district: { select: { slug: true } } } },
    },
    orderBy: { viewCount: "desc" },
    take: limit,
  });
}

export async function incrementViewCount(contentId: string) {
  return prisma.content.update({
    where: { id: contentId },
    data: { viewCount: { increment: 1 } },
  });
}

// ========== MULTIMEDIA QUERIES ==========

// Live cricket scores - RapidAPI "Cricket API Free Data" (cricbuzz-format).
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

function mapInnings(teamName: string, sc: any): { team: string; runs: number; wickets: number; overs: number } {
  const i = sc?.inngs1 || sc || {};
  return { team: teamName, runs: i.runs || 0, wickets: i.wickets || 0, overs: i.overs || 0 };
}

// ESPN Cricinfo unofficial JSON - no key required. Same endpoint that
// cricinfo.com/live-cricket-scores fetches client-side. Returns the
// current page of matches (live + recent + upcoming). When this works we
// skip the paid RapidAPI tier; we fall back to it only on outage.
async function espnGetCurrentMatches(): Promise<CricketMatch[] | null> {
  try {
    const res = await fetch(
      "https://hs-consumer-api.espncricinfo.com/v1/pages/matches/current?lang=en&latest=true",
      {
        signal: AbortSignal.timeout(6000),
        next: { revalidate: 60 },
        headers: { "User-Agent": "RayalaseemaExpress/1.0 (+web)" },
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const matches: any[] = Array.isArray(data?.matches) ? data.matches : [];
    if (matches.length === 0) return null;
    const live = matches.filter((m) => m?.state === "LIVE" || m?.statusType === "LIVE");
    const pool = live.length > 0 ? live : matches;
    return pool.slice(0, 4).map((m: any) => {
      const teams = Array.isArray(m?.teams) ? m.teams : [];
      const t1 = teams[0]?.team?.abbreviation || teams[0]?.team?.shortName || teams[0]?.team?.name || "T1";
      const t2 = teams[1]?.team?.abbreviation || teams[1]?.team?.shortName || teams[1]?.team?.name || "T2";
      const score = teams
        .filter((t: any) => t?.score)
        .map((t: any) => ({
          team: t?.team?.abbreviation || t?.team?.shortName || "",
          runs: Number(t?.score?.runs ?? 0),
          wickets: Number(t?.score?.wickets ?? 0),
          overs: Number(t?.score?.overs ?? 0),
        }));
      const isLive = m?.state === "LIVE" || m?.statusType === "LIVE";
      const when = m?.startTime ? new Date(m.startTime) : null;
      return {
        id: String(m?.objectId || m?.id || `${t1}-${t2}`),
        name: m?.title || `${t1} vs ${t2}`,
        status: m?.statusText || m?.status || (isLive ? "లైవ్" : "షెడ్యూల్"),
        teams: [t1, t2] as [string, string],
        score,
        venue: m?.ground?.longName || m?.ground?.name || undefined,
        time: !isLive && when
          ? when.toLocaleString("te-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
          : undefined,
        isLive,
      };
    });
  } catch {
    return null;
  }
}

export async function getCricketScores(): Promise<CricketMatch[]> {
  // Try the free ESPN feed first; only fall through to RapidAPI on failure.
  const espn = await espnGetCurrentMatches();
  if (espn && espn.length > 0) return espn;

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

// ---------- Per-type Content queries (Video, Reel, WebStory, Gallery, Cartoon) ----------

export async function getVideos(limit = 5) {
  const rows = await prisma.content.findMany({
    where: { type: "VIDEO", status: "PUBLISHED" },
    orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: { category: { select: { name: true } } },
  });
  return rows.map(projectVideo);
}

export async function getPhotoGalleries(limit = 4) {
  const rows = await prisma.content.findMany({
    where: { type: "PHOTO_GALLERY", status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(projectPhotoGallery);
}

export async function getWebStories(limit = 12) {
  const rows = await prisma.content.findMany({
    where: { type: "WEB_STORY", status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { category: { select: { slug: true } } },
  });
  return rows.map(projectWebStory);
}

export async function getReels(limit = 6) {
  const rows = await prisma.content.findMany({
    where: { type: "REEL", status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(projectReel);
}

export async function getCartoons(limit = 5) {
  const rows = await prisma.content.findMany({
    where: { type: "CARTOON", status: "PUBLISHED" },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
  return rows.map(projectCartoon);
}

// ---------- Ads (unchanged - Ad is its own table, not unified) ----------

export async function getAdsByPosition(position: string) {
  const rows = await prisma.ad.findMany({
    where: {
      position: position as any,
      active: true,
      OR: [{ endDate: null }, { endDate: { gt: new Date() } }],
    },
    take: 1,
  });
  return rows.map(sanitizeAdRow);
}

export async function getAllAds() {
  const rows = await prisma.ad.findMany({
    where: {
      active: true,
      OR: [{ endDate: null }, { endDate: { gt: new Date() } }],
    },
  });
  return rows.map(sanitizeAdRow);
}

// ---------- District-wise articles (type=ARTICLE filtered) ----------

// myDistrictSlug: the user's preferred district (from cookie) - gets more articles
export async function getDistrictArticles(myDistrictSlug?: string | null) {
  const districts = await prisma.district.findMany({
    where: { active: true },
    select: { id: true, name: true, nameEn: true, slug: true },
    orderBy: { sortOrder: "asc" },
  });

  const allConstituencies = await prisma.constituency.findMany({
    where: { districtId: { in: districts.map((d) => d.id) } },
    select: { id: true, districtId: true },
  });

  const constByDistrict: Record<string, string[]> = {};
  for (const c of allConstituencies) {
    if (!constByDistrict[c.districtId]) constByDistrict[c.districtId] = [];
    constByDistrict[c.districtId].push(c.id);
  }

  const allConstIds = allConstituencies.map((c) => c.id);

  const allArticles = await prisma.content.findMany({
    where: {
      type: "ARTICLE",
      status: "PUBLISHED",
      createdAt: { gte: NEW_TEMPLATE_ARTICLE_CUTOFF },
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
