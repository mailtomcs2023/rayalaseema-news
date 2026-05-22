import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { prisma } from "@rayalaseema/db";

export default async function AuthorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const author = await prisma.user.findFirst({
    where: { id: slug, active: true },
    select: { id: true, name: true, bio: true, avatar: true, role: true },
  });

  if (!author) return notFound();

  const articles = await prisma.article.findMany({
    where: { authorId: author.id, status: "PUBLISHED" },
    include: { category: { select: { name: true, nameEn: true, slug: true, color: true } } },
    orderBy: { publishedAt: "desc" },
    take: 30,
  });

  const totalArticles = await prisma.article.count({ where: { authorId: author.id, status: "PUBLISHED" } });

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "30px 16px" }}>
        {/* Author Card */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 32, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", marginBottom: 24, display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{
            width: 80, height: 80, borderRadius: "50%", background: "var(--color-brand)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 32, fontWeight: 900, flexShrink: 0,
            overflow: "hidden",
          }}>
            {author.avatar ? (
              <img src={author.avatar} alt={author.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              author.name.charAt(0)
            )}
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111" }}>{author.name}</h1>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 4,
              background: author.role === "ADMIN" ? "#fef3c7" : author.role !== "REPORTER" ? "#dbeafe" : "#dcfce7",
              color: author.role === "ADMIN" ? "#92400e" : author.role !== "REPORTER" ? "#1e40af" : "#166534",
            }}>
              {author.role}
            </span>
            {author.bio && <p style={{ fontSize: 14, color: "#666", marginTop: 8, lineHeight: 1.7 }}>{author.bio}</p>}
            <p style={{ fontSize: 13, color: "#888", marginTop: 6 }}>{totalArticles} articles published</p>
          </div>
        </div>

        {/* Articles */}
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, color: "#111" }}>Published Articles</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {articles.map((a) => (
            <Link key={a.id} href={`/article/${a.slug}`} style={{ textDecoration: "none" }}>
              <div style={{
                background: "#fff", borderRadius: 8, padding: "12px 16px", boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                display: "flex", alignItems: "center", gap: 14, transition: "box-shadow 0.15s",
              }} className="hover:shadow-md">
                {a.featuredImage && (
                  <img src={a.featuredImage} alt="" style={{ width: 80, height: 55, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</h3>
                  <div style={{ display: "flex", gap: 10, marginTop: 4, alignItems: "center" }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#fff", background: a.category.color || "#888", padding: "1px 6px", borderRadius: 3 }}>
                      {a.category.nameEn}
                    </span>
                    <span style={{ fontSize: 11, color: "#888" }}>
                      {a.publishedAt ? new Date(a.publishedAt).toLocaleDateString("te-IN") : ""}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
