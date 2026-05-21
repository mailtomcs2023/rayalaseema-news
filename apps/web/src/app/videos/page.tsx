import type { Metadata } from "next";
import { prisma } from "@rayalaseema/db";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { VideoGrid } from "@/components/video-grid";
import { getSiteConfig } from "@/lib/db-queries";

export const metadata: Metadata = {
  title: "వీడియోలు | రాయలసీమ ఎక్స్‌ప్రెస్",
  description:
    "రాయలసీమ ఎక్స్‌ప్రెస్ సొంత నిర్మాణ వీడియోలు — ఇంటర్వ్యూలు, గ్రౌండ్ రిపోర్ట్‌లు, ఎక్స్‌ప్లైనర్‌లు, జిల్లా కవరేజీ.",
};

export default async function VideosPage() {
  const [config, videos] = await Promise.all([
    getSiteConfig(),
    prisma.video.findMany({
      where: { active: true },
      orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
      take: 60,
      include: { category: { select: { name: true } } },
    }),
  ]);

  const items = videos.map((v) => ({
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
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "18px 12px 48px" }}>
        <div style={{ borderBottom: "2px solid var(--n-900, #111827)", paddingBottom: 10, marginBottom: 22 }}>
          <h1
            style={{
              fontFamily: "var(--font-telugu-heading), serif",
              fontSize: 28,
              fontWeight: 800,
              color: "var(--n-900, #111827)",
              margin: 0,
            }}
          >
            RE వీడియోలు
          </h1>
          <p
            style={{
              fontFamily: "var(--font-telugu-body), sans-serif",
              fontSize: 13,
              color: "var(--n-500, #6b7280)",
              margin: "4px 0 0",
            }}
          >
            సొంత నిర్మాణ సంస్థ — ఇంటర్వ్యూలు · గ్రౌండ్ రిపోర్ట్‌లు · ఎక్స్‌ప్లైనర్‌లు · జిల్లా కవరేజీ
          </p>
        </div>
        <VideoGrid videos={items} />
      </main>
      <Footer config={config} />
    </div>
  );
}
