import { CrudTable } from "@/components/crud-table";
import { prisma } from "@rayalaseema/db";

export default async function AdsPage() {
  const data = await prisma.ad.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <CrudTable
          title="Advertisements"
          apiPath="ads"
          data={JSON.parse(JSON.stringify(data))}
          columns={[
            { key: "name", label: "Name" },
            { key: "position", label: "Position" },
            { key: "clicks", label: "Clicks" },
            { key: "impressions", label: "Impressions" },
            { key: "active", label: "Status", type: "boolean" },
          ]}
          fields={[
            { key: "name", label: "Ad Name", type: "text", required: true },
            { key: "position", label: "Position", type: "select", required: true, options: [
              { value: "HEADER_LEFT", label: "Header Left" }, { value: "HEADER_RIGHT", label: "Header Right" },
              { value: "BANNER_MID", label: "Banner Mid" }, { value: "SIDEBAR_SQUARE", label: "Sidebar Square" },
              { value: "SIDEBAR_TALL", label: "Sidebar Tall" }, { value: "LEADERBOARD", label: "Leaderboard" },
              { value: "IN_FEED", label: "In-Feed" }, { value: "VERTICAL_STRIP", label: "Vertical Strip" },
            ]},
            { key: "imageUrl", label: "Image URL", type: "url" },
            { key: "linkUrl", label: "Click URL", type: "url" },
            { key: "htmlContent", label: "Custom HTML", type: "textarea" },
            { key: "bgColor", label: "Background Color", type: "color" },
            { key: "active", label: "Active", type: "checkbox", placeholder: "Ad is active" },
          ]}
        />
      </main>
    </div>
  );
}
