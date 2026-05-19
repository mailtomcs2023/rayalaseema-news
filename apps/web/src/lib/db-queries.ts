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
      take: 150,
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

// Fetch videos
export async function getVideos(limit = 3) {
  return prisma.video.findMany({
    where: { active: true },
    orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
    take: limit,
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
