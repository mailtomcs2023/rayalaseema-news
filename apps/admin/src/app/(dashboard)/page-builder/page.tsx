// Page Builder (Spec #2) - landing shell that fans out to the three
// sub-sections: Templates, Assignments, Composite Blocks. Each card links
// to its own list page (D2/D3/D4). Restricted to ADMIN + EDITOR by the
// (dashboard) auth wrapper + canVisit() guard.

import Link from "next/link";
import { Sidebar } from "@/components/sidebar";
import { prisma } from "@rayalaseema/db";

// Don't prerender - counts must reflect live DB state, and prod DB connection
// is unavailable at build time in CI. Without this Next 16 attempts static
// generation and crashes the build.
export const dynamic = "force-dynamic";

interface Card {
  href: string;
  title: string;
  blurb: string;
  count: number;
  icon: string;
}

export default async function PageBuilderHome() {
  let tplCount = 0, assignCount = 0, compCount = 0;
  try {
    [tplCount, assignCount, compCount] = await Promise.all([
      prisma.template.count(),
      prisma.templateAssignment.count({ where: { active: true } }),
      prisma.compositeBlock.count(),
    ]);
  } catch {
    // Schema may be in flux on first deploy after a migration; degrade gracefully.
  }

  const cards: Card[] = [
    {
      href: "/page-builder/templates",
      title: "Templates",
      blurb: "Named layouts of stacked blocks. Edit on the visual canvas; publish promotes the draft live.",
      count: tplCount,
      icon: "M4 5a2 2 0 012-2h12a2 2 0 012 2v3H4V5zM4 10h16v9a2 2 0 01-2 2H6a2 2 0 01-2-2v-9z",
    },
    {
      href: "/page-builder/assignments",
      title: "Assignments",
      blurb: "URL-pattern rules that bind templates to public routes. Higher priority wins.",
      count: assignCount,
      icon: "M13 7H7v6h6V7z M3 3v18h18V3H3zm16 16H5V5h14v14z",
    },
    {
      href: "/page-builder/composites",
      title: "Composite Blocks",
      blurb: "Reusable named groups of blocks (e.g. Election Day hero) usable inside any template.",
      count: compCount,
      icon: "M3 3h7v7H3V3zm0 11h7v7H3v-7zm11-11h7v7h-7V3zm0 11h7v7h-7v-7z",
    },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: "24px 28px" }}>
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>Page Builder</h1>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
            Admin-editable layouts for the public homepage and every <code>/category/&lt;slug&gt;</code> page.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {cards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              style={{
                display: "block",
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: "18px 20px",
                textDecoration: "none",
                color: "inherit",
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <svg width="22" height="22" fill="none" stroke="#FF2C2C" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d={c.icon} />
                </svg>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "#111827" }}>{c.title}</h3>
                <span
                  style={{
                    marginLeft: "auto",
                    background: "#FEF2F2",
                    color: "#B91C1C",
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 999,
                  }}
                >
                  {c.count}
                </span>
              </div>
              <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5, margin: 0 }}>{c.blurb}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
