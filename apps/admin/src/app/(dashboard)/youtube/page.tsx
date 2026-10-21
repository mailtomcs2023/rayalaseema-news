import { Catalog } from "@/components/youtube/catalog";

// /youtube - the channel catalog with scores, stats and opportunities
// (spec 2026-10-22 §3.1). Data comes from the 30-minute channel sync.
export const dynamic = "force-dynamic";

export default function YouTubePage() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <div className="dashboard-header">
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111" }}>YouTube</h1>
            <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>Our channel: every upload with its score, stats and rank. Amber cards are opportunities.</p>
          </div>
        </div>
        <Catalog />
      </main>
    </div>
  );
}
