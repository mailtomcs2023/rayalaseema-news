import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ReporterShell } from "@/components/reporter/reporter-shell";

// Reporter-portal edit shell. Wraps every /reporter/profile/<section> page
// in the standard ReporterShell (red header + bottom tab bar) and renders
// a back-arrow header + white content card matching the visual language of
// /reporter/profile itself.

export function ReporterEditShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <ReporterShell>
      <div style={{ paddingTop: 14 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <Link
            href="/reporter/profile"
            aria-label="Back to profile"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "#fff",
              color: "#111",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              textDecoration: "none",
            }}
          >
            <ArrowLeft size={18} />
          </Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: "#111",
                margin: 0,
              }}
            >
              {title}
            </h1>
            {subtitle ? (
              <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            borderRadius: 14,
            padding: 20,
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          {children}
        </div>
      </div>
    </ReporterShell>
  );
}
