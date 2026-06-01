import { prisma } from "@rayalaseema/db";

// Dashboard stats - Spec #1 A1C (#189): every count reads Content with a type
// filter. Replaces the per-table counts (prisma.article.count, prisma.video.count, ...).
export async function getDashboardStats() {
  const [
    totalArticles,
    publishedArticles,
    draftArticles,
    inReviewArticles,
    totalCategories,
    totalUsers,
    breakingNewsCount,
    totalVideos,
    totalStories,
    totalReels,
    totalCartoons,
    totalAds,
  ] = await Promise.all([
    prisma.content.count({ where: { type: "ARTICLE" } }),
    prisma.content.count({ where: { type: "ARTICLE", status: "PUBLISHED" } }),
    prisma.content.count({ where: { type: "ARTICLE", status: "DRAFT" } }),
    prisma.content.count({ where: { type: "ARTICLE", status: "IN_REVIEW" } }),
    prisma.category.count(),
    prisma.user.count(),
    prisma.content.count({ where: { type: "BREAKING_NEWS", status: "PUBLISHED" } }),
    prisma.content.count({ where: { type: "VIDEO" } }),
    prisma.content.count({ where: { type: "WEB_STORY" } }),
    prisma.content.count({ where: { type: "REEL" } }),
    prisma.content.count({ where: { type: "CARTOON" } }),
    prisma.ad.count({ where: { active: true } }),
  ]);

  const recentArticles = await prisma.content.findMany({
    where: { type: "ARTICLE" },
    include: {
      // Include category.color so the dashboard table can render each
      // category badge in its own admin-configured colour instead of
      // every chip looking identical.
      category: { select: { name: true, nameEn: true, slug: true, color: true } },
      author: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return {
    totalArticles,
    publishedArticles,
    draftArticles,
    inReviewArticles,
    totalCategories,
    totalUsers,
    breakingNewsCount,
    totalVideos,
    totalStories,
    totalReels,
    totalCartoons,
    totalAds,
    recentArticles,
  };
}

export async function getAllCategories() {
  return prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { contents: true } } },
  });
}

export async function getAllArticles(page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const [articles, total] = await Promise.all([
    prisma.content.findMany({
      where: { type: "ARTICLE" },
      include: {
        category: { select: { name: true, nameEn: true, slug: true, color: true } },
        author: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.content.count({ where: { type: "ARTICLE" } }),
  ]);
  return { articles, total, page, limit };
}

// Breaking ticker list for admin dashboard - reads Content where type=BREAKING_NEWS,
// sorts by payload.priority ASC (matches old BreakingNews.priority).
export async function getBreakingNewsList() {
  const rows = await prisma.content.findMany({
    where: { type: "BREAKING_NEWS" },
    orderBy: { createdAt: "desc" },
  });
  return rows
    .map((r) => {
      const p = (r.payload as Record<string, unknown> | null) || {};
      return {
        id: r.id,
        headline: r.title,
        priority: typeof p.priority === "number" ? p.priority : 0,
        active: r.status === "PUBLISHED",
        expiresAt: p.expiresAt ? new Date(p.expiresAt as string) : null,
        createdAt: r.createdAt,
      };
    })
    .sort((a, b) => a.priority - b.priority);
}
