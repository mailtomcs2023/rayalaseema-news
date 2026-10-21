import { NewRunForm } from "@/components/youtube/new-run-form";

// /youtube/new - upload a video and start Video IQ (spec 2026-10-22 §3.2).
export const dynamic = "force-dynamic";

export default function NewYouTubeRunPage() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <div className="dashboard-header">
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111" }}>New YouTube upload</h1>
            <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>Upload, add the desk context, start. The workspace opens when the analysis is ready.</p>
          </div>
        </div>
        <NewRunForm />
      </main>
    </div>
  );
}
