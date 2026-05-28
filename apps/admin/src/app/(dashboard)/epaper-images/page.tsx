import { Sidebar } from "@/components/sidebar";
import { CrudTable } from "@/components/crud-table";
import { prisma } from "@rayalaseema/db";

// Generic image library - cartoons, classifieds, masthead variants, photos.
// `image` blocks in EpaperPage layouts can reference these via assetId.
export default async function EpaperImagesPage() {
  const data = await prisma.epaperImageAsset.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <div style={{ marginBottom: 16, padding: 14, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, fontSize: 13, color: "#166534" }}>
          <strong>Image library.</strong> Upload cartoons, classifieds, masthead variants,
          photos once; the editor pulls from here when placing into <code>image</code> blocks.
        </div>
        <CrudTable
          title="ePaper Images"
          apiPath="epaper/image-assets"
          data={JSON.parse(JSON.stringify(data))}
          columns={[
            { key: "category", label: "Category" },
            { key: "title", label: "Title" },
            { key: "imageUrl", label: "Image", type: "url" },
            { key: "tags", label: "Tags" },
            { key: "active", label: "Active", type: "boolean" },
          ]}
          fields={[
            { key: "category", label: "Category", type: "select", required: true, options: [
              { value: "CARTOON", label: "Cartoon" },
              { value: "CLASSIFIED", label: "Classified" },
              { value: "MASTHEAD", label: "Masthead variant" },
              { value: "PHOTO", label: "Photo" },
              { value: "GRAPHIC", label: "Graphic" },
              { value: "OTHER", label: "Other" },
            ] },
            { key: "title", label: "Title", type: "text", required: true },
            { key: "imageUrl", label: "Image URL", type: "url", required: true },
            { key: "caption", label: "Caption (optional)", type: "text" },
            { key: "tags", label: "Tags (comma-separated)", type: "text" },
            { key: "active", label: "Active", type: "checkbox" },
          ]}
        />
      </main>
    </div>
  );
}
