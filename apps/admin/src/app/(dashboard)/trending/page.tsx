import { Suspense } from "react";
import { TrendingTable } from "@/components/trending/trending-table";

// /trending - the trending desk (spec 12.11). Data comes from the 15-minute
// competitor poller; this page only renders it.
export const dynamic = "force-dynamic";

export default function TrendingPage() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <div className="dashboard-header">
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111" }}>Trending desk</h1>
            <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>What the big Telugu channels are publishing right now. Own footage only; use these as leads.</p>
          </div>
        </div>
        <Suspense fallback={<div style={{ color: "#6b7280" }}>Loading…</div>}>
          <TrendingTable />
        </Suspense>
      </main>
    </div>
  );
}
