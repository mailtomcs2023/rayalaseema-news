// Dashboard-route-group error boundary.
//
// Next.js applies this to every route under (dashboard) - categories, users,
// content, review, etc. When a server component or client component below
// this throws, instead of a hard-crash white screen the user sees an
// in-place error card with a "Try again" button that calls reset().
//
// Why route-group level rather than per-route: 90% of crashes here are
// data-shape mismatches and would render the same UI anyway. One file
// covers ~25 routes.
"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error to whatever observability we have (currently the
    // browser console; Sentry hooks in here in PR 26).
    console.error("[dashboard-error-boundary]", error);

    // ChunkLoadError = this tab was loaded from a PREVIOUS build whose hashed
    // chunk files were replaced by a deploy, so a lazy-loaded chunk now 404s.
    // Self-heal by reloading once to pull the current build. The timestamp
    // guard prevents a reload loop if the chunk is genuinely missing, while
    // still allowing a fresh reload after a future deploy (>10s later).
    const isChunkError =
      error?.name === "ChunkLoadError" ||
      /ChunkLoadError|Loading chunk|Failed to load chunk/i.test(error?.message || "");
    if (isChunkError && typeof window !== "undefined") {
      const KEY = "chunk-reload-ts";
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last > 10000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        window.location.reload();
      }
    }
  }, [error]);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <main style={{ flex: 1, padding: 32 }}>
        <div
          style={{
            maxWidth: 560,
            margin: "80px auto",
            padding: 32,
            background: "#fff",
            border: "1px solid #fecaca",
            borderRadius: 12,
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#991b1b", margin: 0, marginBottom: 8 }}>
            Something broke on this page
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.55, margin: 0, marginBottom: 16 }}>
            We hit an unexpected error rendering this view. The rest of the
            admin is still working - try again, or head back to the dashboard
            and we&apos;ll keep an eye on it.
          </p>
          {error.digest && (
            <p style={{ fontSize: 12, color: "#9ca3af", fontFamily: "monospace", margin: 0, marginBottom: 16 }}>
              Error ID: {error.digest}
            </p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => reset()}
              type="button"
              style={{
                padding: "8px 16px",
                background: "#dc2626",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <Link
              href="/"
              style={{
                padding: "8px 16px",
                background: "#fff",
                color: "#374151",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
