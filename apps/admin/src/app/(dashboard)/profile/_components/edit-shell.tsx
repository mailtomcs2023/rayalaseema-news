import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// Shared chrome for every /profile/<section> edit page. Renders a card with
// a back button + title in the header and the section's form body below.
// Kept dumb on purpose so the per-section pages can plug whatever form
// markup they need without fighting layout.

export function EditShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <main
        style={{
          marginLeft: 240,
          flex: 1,
          padding: "24px 20px 40px",
          maxWidth: 720,
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <Link
            href="/profile"
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
            <h1 style={{ fontSize: 18, fontWeight: 800, color: "#111", margin: 0 }}>
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
      </main>
    </div>
  );
}
