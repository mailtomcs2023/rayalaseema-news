import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { prisma } from "@rayalaseema/db";
import { ConstituencyFilter } from "./filter";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const district = await prisma.district.findUnique({ where: { slug } });
  if (!district) return { title: "District not found" };
  const siteUrl = process.env.SITE_URL || "https://rayalaseemaexpress.com";
  return {
    title: `${district.name} (${district.nameEn}) | రాయలసీమ ఎక్స్‌ప్రెస్`,
    description: `${district.name} జిల్లా నుండి తాజా వార్తలు`,
    alternates: { canonical: `${siteUrl}/district/${slug}` },
    openGraph: { title: district.name, url: `${siteUrl}/district/${slug}`, type: "website", locale: "te_IN" },
  };
}

export default async function DistrictPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const district = await prisma.district.findUnique({
    where: { slug },
    include: {
      constituencies: {
        orderBy: { sortOrder: "asc" },
        include: { _count: { select: { mandals: true } } },
      },
    },
  });

  if (!district) return notFound();

  // Get articles that mention this district name in title or summary
  const articles = await prisma.article.findMany({
    where: {
      status: "PUBLISHED",
      OR: [
        { constituencyId: { in: district.constituencies.map((c) => c.id) } },
        { title: { contains: district.nameEn, mode: "insensitive" } },
        { title: { contains: district.name } },
        { summary: { contains: district.nameEn, mode: "insensitive" } },
      ],
    },
    include: {
      category: { select: { name: true, nameEn: true, slug: true, color: true } },
      author: { select: { name: true } },
      constituency: { select: { nameEn: true, name: true } },
    },
    orderBy: { publishedAt: "desc" },
    take: 20,
  });

  // If still no articles, show latest published articles (but label correctly)
  let displayArticles = articles;
  let showingGeneral = false;
  if (articles.length < 3) {
    showingGeneral = true;
    displayArticles = await prisma.article.findMany({
      where: { status: "PUBLISHED" },
      include: {
        category: { select: { name: true, nameEn: true, slug: true, color: true } },
        author: { select: { name: true } },
        constituency: { select: { nameEn: true, name: true } },
      },
      orderBy: { publishedAt: "desc" },
      take: 15,
    });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      {/* District Header */}
      <div style={{ background: "#fff", borderBottom: "3px solid var(--color-brand)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "16px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h1 style={{ fontSize: 32, fontWeight: 900, color: "var(--color-brand)" }}>{district.name}</h1>
              <p style={{ fontSize: 14, color: "#888", marginTop: 4 }}>
                {district.nameEn} District | {district.constituencies.length} Constituencies | {district.loksabhaSeats} Lok Sabha
              </p>
            </div>
            <ConstituencyFilter
              constituencies={district.constituencies.map((c) => ({
                id: c.id, name: c.name, nameEn: c.nameEn, slug: c.slug,
              }))}
            />
          </div>

          {/* Constituency pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            {district.constituencies.map((c) => (
              <Link key={c.id} href={`/constituency/${c.slug}`}
                style={{ padding: "5px 14px", borderRadius: 20, fontSize: 13, fontWeight: 700, background: "#f3f4f6", color: "#333", textDecoration: "none", border: "1px solid #e5e7eb" }}>
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "16px 12px" }}>
        {showingGeneral && (
          <div style={{ background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "#92400e" }}>
            {district.name} జిల్లా వార్తలు త్వరలో... ప్రస్తుతం తాజా వార్తలు చూపిస్తున్నాము.
          </div>
        )}

        <div style={{ display: "flex", gap: 20 }}>
          {/* Articles Grid */}
          <div style={{ flex: 1 }}>
            {/* Top 3 featured */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
              {displayArticles.slice(0, 3).map((article) => (
                <Link key={article.id} href={`/article/${article.slug}`} style={{ textDecoration: "none", display: "block" }}>
                  <div style={{ background: "#fff", borderRadius: 8, overflow: "hidden", border: "1px solid #eee" }}>
                    {article.featuredImage ? (
                      <img src={article.featuredImage} alt="" style={{ width: "100%", aspectRatio: "16/10", objectFit: "cover" }} />
                    ) : (
                      <div className="img-placeholder"><span>RE</span></div>
                    )}
                    <div style={{ padding: 12 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 3,
                        background: article.category.color || "var(--color-brand)", color: "#fff",
                      }}>
                        {article.category.name}
                      </span>
                      <h3 style={{ fontSize: 15, fontWeight: 800, color: "#000", lineHeight: 1.5, marginTop: 6 }}>
                        {article.title}
                      </h3>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Article list */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {displayArticles.slice(3).map((article) => (
                <Link key={article.id} href={`/article/${article.slug}`} style={{ textDecoration: "none", display: "flex", gap: 10, padding: 10, background: "#fff", borderRadius: 8, border: "1px solid #f3f4f6" }}>
                  <div style={{ width: 90, height: 65, borderRadius: 6, overflow: "hidden", flexShrink: 0, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {article.featuredImage ? (
                      <img src={article.featuredImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ color: "#ccc", fontWeight: 800, fontSize: 16 }}>RE</span>
                    )}
                  </div>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: article.category.color || "var(--color-brand)" }}>
                      {article.category.name}
                    </span>
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: "#111", lineHeight: 1.45 }}>
                      {article.title.substring(0, 60)}...
                    </h4>
                    <span style={{ fontSize: 10, color: "#aaa" }}>
                      {article.publishedAt ? new Date(article.publishedAt).toLocaleTimeString("te-IN", { hour: "2-digit", minute: "2-digit" }) : ""}
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            {displayArticles.length === 0 && (
              <div style={{ textAlign: "center", padding: 60, background: "#fff", borderRadius: 10, color: "#888" }}>
                <p style={{ fontSize: 18, fontWeight: 700 }}>{district.name} వార్తలు త్వరలో...</p>
                <p style={{ fontSize: 14, marginTop: 8 }}>Articles will appear here when tagged to this district.</p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <aside style={{ width: 300, flexShrink: 0 }}>
            <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #eee", padding: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: "#000", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--color-brand)" }}>
                నియోజకవర్గాలు
              </h3>
              {district.constituencies.map((c) => (
                <Link key={c.id} href={`/constituency/${c.slug}`} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f5f5f5", textDecoration: "none", fontSize: 14, fontWeight: 700, color: "#333" }}>
                  <span>{c.name}</span>
                  <span style={{ fontSize: 12, color: "#aaa" }}>{c._count.mandals} mandals</span>
                </Link>
              ))}
            </div>
          </aside>
        </div>
      </main>

      <Footer />
    </div>
  );
}
