import { AdsManager, type AdRow } from "@/components/ads-manager";
import { prisma } from "@rayalaseema/db";

export default async function AdsPage() {
  const data = await prisma.ad.findMany({ orderBy: { createdAt: "desc" } });

  // Serialize Date instances for the client boundary.
  const initialAds: AdRow[] = data.map((a) => ({
    id: a.id,
    name: a.name,
    position: a.position,
    targetPath: a.targetPath,
    imageUrl: a.imageUrl,
    linkUrl: a.linkUrl,
    htmlContent: a.htmlContent,
    bgColor: a.bgColor,
    textColor: a.textColor,
    active: a.active,
    startDate: a.startDate ? a.startDate.toISOString() : null,
    endDate: a.endDate ? a.endDate.toISOString() : null,
    clicks: a.clicks,
    impressions: a.impressions,
  }));

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <AdsManager initialAds={initialAds} />
      </main>
    </div>
  );
}
