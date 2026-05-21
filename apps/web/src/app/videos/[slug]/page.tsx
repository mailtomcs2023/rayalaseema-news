import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@rayalaseema/db";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { VideoGrid } from "@/components/video-grid";
import { getSiteConfig } from "@/lib/db-queries";

function ytId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const video = await prisma.video.findUnique({ where: { slug } });
  if (!video) return { title: "వీడియో దొరకలేదు | రాయలసీమ ఎక్స్‌ప్రెస్" };
  return {
    title: `${video.title} | రాయలసీమ ఎక్స్‌ప్రెస్`,
    description: video.description?.substring(0, 160) || video.title,
    openGraph: {
      title: video.title,
      images: video.thumbnailUrl ? [video.thumbnailUrl] : [],
      type: "video.other",
    },
  };
}

export default async function VideoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [config, video] = await Promise.all([
    getSiteConfig(),
    prisma.video.findUnique({ where: { slug }, include: { category: true } }),
  ]);

  if (!video || !video.active) notFound();

  const vid = ytId(video.videoUrl);

  // Related — same category, else latest
  const relatedRaw = await prisma.video.findMany({
    where: {
      active: true,
      slug: { not: slug },
      ...(video.categoryId ? { categoryId: video.categoryId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { category: { select: { name: true } } },
  });
  const related = relatedRaw.map((v) => ({
    id: v.id,
    title: v.title,
    slug: v.slug,
    thumbnail: v.thumbnailUrl,
    videoUrl: v.videoUrl,
    duration: v.duration,
    views: v.views,
    category: v.category?.name || null,
  }));

  return (
    <div className="min-h-screen" style={{ background: "#fff" }}>
      <Header config={config} breakingNews={[]} />
      <main style={{ maxWidth: 980, margin: "0 auto", padding: "18px 12px 48px" }}>
        {/* Player */}
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "16/9",
            borderRadius: 8,
            overflow: "hidden",
            background: "#000",
          }}
        >
          {vid ? (
            <iframe
              src={`https://www.youtube.com/embed/${vid}?rel=0`}
              title={video.title}
              allow="accelerated-fullscreen; autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
            />
          ) : (
            <img
              src={video.thumbnailUrl}
              alt={video.title}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}
        </div>

        {/* Meta */}
        <div style={{ padding: "16px 0", borderBottom: "1px solid var(--paper-edge, rgba(0,0,0,0.08))" }}>
          {video.category && (
            <span
              style={{
                fontFamily: "var(--font-telugu-body), sans-serif",
                fontSize: 11,
                fontWeight: 800,
                color: "var(--brand, #E01B1B)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {video.category.name}
            </span>
          )}
          <h1
            style={{
              fontFamily: "var(--font-telugu-heading), serif",
              fontSize: 24,
              fontWeight: 800,
              lineHeight: 1.3,
              color: "var(--n-900, #111827)",
              margin: "6px 0 8px",
            }}
          >
            {video.title}
          </h1>
          <span
            style={{
              fontFamily: "var(--font-telugu-body), sans-serif",
              fontSize: 13,
              color: "var(--n-500, #6b7280)",
            }}
          >
            {video.views.toLocaleString("en-IN")} వీక్షణలు
          </span>
          {video.description && (
            <p
              style={{
                fontFamily: "var(--font-telugu-body), sans-serif",
                fontSize: 15,
                lineHeight: 1.7,
                color: "var(--n-700, #374151)",
                marginTop: 12,
                whiteSpace: "pre-line",
              }}
            >
              {video.description}
            </p>
          )}
        </div>

        {/* Related */}
        {related.length > 0 && (
          <section style={{ marginTop: 24 }}>
            <h2
              style={{
                fontFamily: "var(--font-telugu-heading), serif",
                fontSize: 18,
                fontWeight: 800,
                color: "var(--n-900, #111827)",
                marginBottom: 16,
              }}
            >
              మరిన్ని వీడియోలు
            </h2>
            <VideoGrid videos={related} />
          </section>
        )}
      </main>
      <Footer config={config} />
    </div>
  );
}
