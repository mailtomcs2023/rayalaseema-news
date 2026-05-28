// Root global error boundary - catches errors that happen in the root
// layout itself or before any route-level boundary mounts. Next.js requires
// this file to render its own <html><body> because the root layout has
// already failed.
//
// Almost always the (dashboard)/error.tsx catches first; this is the
// last-resort fallback for "the whole app is broken" scenarios.
"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error-boundary]", error);
  }, [error]);

  return (
    <html>
      <body
        style={{
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          margin: 0,
          background: "#f9fafb",
        }}
      >
        <div
          style={{
            maxWidth: 560,
            margin: "120px auto",
            padding: 32,
            background: "#fff",
            border: "1px solid #fecaca",
            borderRadius: 12,
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "#991b1b",
              margin: 0,
              marginBottom: 8,
            }}
          >
            Application crashed
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "#6b7280",
              lineHeight: 1.55,
              margin: 0,
              marginBottom: 16,
            }}
          >
            Something failed at the top level. Reloading usually clears it.
            If it keeps happening, contact the admin team.
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: 12,
                color: "#9ca3af",
                fontFamily: "monospace",
                margin: 0,
                marginBottom: 16,
              }}
            >
              Error ID: {error.digest}
            </p>
          )}
          <button
            onClick={() => reset()}
            type="button"
            style={{
              padding: "10px 18px",
              background: "#dc2626",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
