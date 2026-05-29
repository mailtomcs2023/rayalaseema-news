import { CrudTable } from "@/components/crud-table";
import { prisma } from "@rayalaseema/db";

// Library page for e-paper ad assets - DTP / ad-ops uploads creative here once,
// then drops it into any ad block on /epaper.
export default async function EpaperAdsPage() {
  const data = await prisma.epaperAdAsset.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <div style={{ marginBottom: 16, padding: 14, background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 8, fontSize: 13, color: "#3730a3" }}>
          <strong>Ad asset library.</strong> Upload creative + advertiser metadata once.
          Drag from the library panel on the right side of <code>/epaper</code> editor into any
          <code>ad</code> block to assign.
        </div>
        <CrudTable
          title="ePaper Ad Assets"
          apiPath="epaper/ad-assets"
          data={JSON.parse(JSON.stringify(data))}
          columns={[
            { key: "advertiser", label: "Advertiser" },
            { key: "imageUrl", label: "Image", type: "url" },
            { key: "linkUrl", label: "Click URL", type: "url" },
            { key: "validFrom", label: "From", type: "date" },
            { key: "validTo", label: "To", type: "date" },
            { key: "active", label: "Active", type: "boolean" },
          ]}
          fields={[
            { key: "advertiser", label: "Advertiser", type: "text", required: true },
            { key: "imageUrl", label: "Image URL (paste Azure Blob URL after upload)", type: "url", required: true },
            { key: "linkUrl", label: "Click-through URL", type: "url" },
            { key: "validFrom", label: "Valid from", type: "date" },
            { key: "validTo", label: "Valid to", type: "date" },
            { key: "price", label: "Price (paise/month)", type: "number" },
            { key: "notes", label: "Notes", type: "textarea" },
            { key: "active", label: "Active", type: "checkbox" },
          ]}
        />
      </main>
    </div>
  );
}
