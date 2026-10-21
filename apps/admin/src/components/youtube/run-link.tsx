"use client";
// In the Content editor: a one-line pointer to the YouTube run behind a video
// article (spec 2026-10-22 §3.4). Renders nothing when there is none.
import { useEffect, useState } from "react";
import Link from "next/link";

export function YoutubeRunLink({ videoId }: { videoId?: string }) {
  const [run, setRun] = useState<{ id: string; status: string; score: number | null } | null>(null);
  useEffect(() => {
    if (!videoId) return;
    fetch(`/api/youtube/runs?videoId=${encodeURIComponent(videoId)}`).then((r) => (r.ok && r.status !== 204 ? r.json() : null)).then(setRun).catch(() => {});
  }, [videoId]);
  if (!run) return null;
  return (
    <div style={{ fontSize: 13, color: "#374151", margin: "4px 0 10px" }}>
      YouTube run: <b>{run.status}</b>{run.score != null ? ` · score ${run.score}` : ""} · <Link href={`/youtube/${run.id}`} style={{ color: "#dc2626" }}>open in YouTube</Link>
    </div>
  );
}
