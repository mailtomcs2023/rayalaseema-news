// Spec #1 A1C (#189) — legacy /videos/[slug] route reads Content where
// type=VIDEO. The newer canonical path is /video/[slug] (D1 #111); this
// page stays for backward-compat with any links that point at /videos/...
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

async function getVideoBySlug(slug: string) {
  const row = await prisma.content.findUnique({
    where: { slug },
    include: { category: { select: { name: true } } },
  });
  if (!row || row.type !== "VIDEO" || row.status !== "PUBLISHED") return null;
  const p = (row.payload as Record<string, unknown> | null) || {};
  return {
    id: row.id,
    title: row.title,
    slug: row.slug || "",
    description: row.summary,
    thumbnailUrl: (p.thumbnailUrl as string) || row.featuredImage || "",
    videoUrl: (p.videoUrl as string) || null,
    views: row.viewCount,
    categoryId: row.categoryId,
    category: row.category,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const video = await getVideoBySlug(slug);
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
  const [config, video] = await Promise.all([getSiteConfig(), getVideoBySlug(slug)]);
  if (!video) notFound();
  const vid = ytId(video.videoUrl);

  // Related — same category, else latest. Shape the rows to VideoGrid's expected shape.
  const relatedRaw = await prisma.content.findMany({
    where: {
      type: "VIDEO",
      status: "PUBLISHED",
      slug: { not: slug },
      ...(video.categoryId ? { categoryId: video.categoryId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { category: { select: { name: true } } },
  });
  const related = relatedRaw.map((v) => {
    const p = (v.payload as Record<string, unknown> | null) || {};
    const seconds = typeof p.duration === "number" ? p.duration : 0;
    const mm = Math.floor(seconds / 60);
    const ss = String(seconds % 60).padStart(2, "0");
    return {
      id: v.id,
      title: v.title,
      slug: v.slug || "",
      thumbnail: (p.thumbnailUrl as string) || v.featuredImage || "",
      videoUrl: (p.videoUrl as string) || null,
      duration: seconds > 0 ? `${mm}:${ss}` : null,
      views: v.viewCount,
      category: v.category?.name || null,
    };
  });

  return (
    <div className="min-h-screen" style={{ background: "#fff" }}>
      <Header config={config} breakingNews={[]} />
      <main style={{ maxWidth: 980, margin: "0 auto", padding: "18px 12px 48px" }}>
        <div
          style={{
            position: "relative", width: "100%", aspectRatio: "16/9",
            borderRadius: 8, overflow: "hidden", background: "#000",
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

        <div style={{ padding: "16px 0", borderBottom: "1px solid var(--paper-edge, rgba(0,0,0,0.08))" }}>
          {video.category && (
            <span style={{ fontFamily: "var(--font-telugu-body), sans-serif", fontSize: 11, fontWeight: 800, color: "var(--brand, #E01B1B)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {video.category.name}
            </span>
          )}
          <h1 style={{ fontFamily: "var(--font-telugu-heading), serif", fontSize: 24, fontWeight: 800, lineHeight: 1.3, color: "var(--n-900, #111827)", margin: "6px 0 8px" }}>
            {video.title}
          </h1>
          <span style={{ fontFamily: "var(--font-telugu-body), sans-serif", fontSize: 13, color: "var(--n-500, #6b7280)" }}>
            {video.views.toLocaleString("en-IN")} వీక్షణలు
          </span>
          {video.description && (
            <p style={{ fontFamily: "var(--font-telugu-body), sans-serif", fontSize: 15, lineHeight: 1.7, color: "var(--n-700, #374151)", marginTop: 12, whiteSpace: "pre-line" }}>
              {video.description}
            </p>
          )}
        </div>

        {related.length > 0 && (
          <section style={{ marginTop: 24 }}>
            <h2 style={{ fontFamily: "var(--font-telugu-heading), serif", fontSize: 18, fontWeight: 800, color: "var(--n-900, #111827)", marginBottom: 16 }}>
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
