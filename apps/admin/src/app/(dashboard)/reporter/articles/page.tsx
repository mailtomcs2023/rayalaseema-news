import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@rayalaseema/db";
import { ReporterShell } from "@/components/reporter/reporter-shell";
import { KycBanner } from "@/components/reporter/kyc-banner";
import { ArticlesClient } from "@/components/reporter/articles-client";

// Reporter Articles - mirrors the Expo ArticlesScreen.
// Status filter chips + advanced filter/sort sheet (search, sort, categories,
// date range, photo filter). The status chip lives in the URL so a reload
// keeps the chosen tab; everything else is client-side filter state.
//
// Articles for the *active* status are fetched server-side so the first paint
// is meaningful; the client uses them as the base list and applies the rest
// of the filters in-memory.

export default async function ReporterArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = (session.user as any).id as string | undefined;
  const role = (session.user as any).role as string | undefined;
  if (role && role !== "REPORTER") redirect("/");
  if (!userId) redirect("/login");

  const sp = await searchParams;
  const VALID = ["SUBMITTED", "IN_REVIEW", "APPROVED", "REJECTED", "PUBLISHED", "DRAFT"];
  const status = sp.status && VALID.includes(sp.status) ? sp.status : "SUBMITTED";

  const [articles, counts, categories, profile] = await Promise.all([
    prisma.content.findMany({
      where: { type: "ARTICLE", authorId: userId, status: status as any },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        title: true,
        status: true,
        featuredImage: true,
        rejectionNote: true,
        viewCount: true,
        createdAt: true,
        categoryId: true,
        category: { select: { name: true, nameEn: true, color: true } },
      },
    }),
    prisma.content.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: { type: "ARTICLE", authorId: userId },
    }),
    prisma.category.findMany({
      where: { active: true },
      select: { id: true, name: true, nameEn: true, color: true },
      orderBy: { name: "asc" },
    }),
    prisma.reporterProfile.findUnique({
      where: { userId },
      select: { kycStatus: true },
    }),
  ]);
  const kycStatus = (profile?.kycStatus ?? "PENDING") as "PENDING" | "SUBMITTED" | "VERIFIED" | "REJECTED";

  const countByStatus: Record<string, number> = {};
  for (const c of counts) countByStatus[c.status] = c._count._all;

  // Convert Date to ISO string so we can pass plain JSON to the client.
  const serialised = articles.map((a) => ({
    ...a,
    createdAt: a.createdAt.toISOString(),
  }));

  return (
    <ReporterShell kycStatus={kycStatus}>
      <KycBanner userId={userId} />
      <ArticlesClient
        articles={serialised}
        countByStatus={countByStatus}
        categories={categories}
      />
    </ReporterShell>
  );
}
