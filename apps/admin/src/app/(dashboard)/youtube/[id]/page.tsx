import { RunWorkspace } from "@/components/youtube/run-workspace";

// /youtube/[id] - one run: progress, then the Video IQ workspace, then publish
// follow-ups (spec 2026-10-22 §3.3).
export const dynamic = "force-dynamic";

export default async function YouTubeRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <RunWorkspace runId={id} />
      </main>
    </div>
  );
}
