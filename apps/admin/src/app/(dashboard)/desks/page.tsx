import { DesksTable, type DeskRow } from "./desks-table";
import { prisma } from "@rayalaseema/db";

export default async function DesksPage() {
  // Newest-first - admins almost always want to see "what did I just add?"
  // at the top. The auto-seed scripts (scripts/seed-desks.ts) populate
  // createdAt on insert too, so existing rows still group reasonably.
  const data = await prisma.desk.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { contents: true } } },
  });

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <div style={{ marginBottom: 16, padding: 14, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, fontSize: 13, color: "#9a3412" }}>
          <strong>Desks</strong> = byline groupings used on web + e-paper.
          Most desks are auto-seeded from districts, constituencies, and categories
          (run <code>scripts/seed-desks.ts</code> after adding a new one). Only create new
          desks here for EDITORIAL branches or one-off bureaus.
        </div>
        {/* DesksTable is the dedicated client component (TanStack + shadcn)
            with row selection, inline bulk actions, and the Branch/Status
            facets - replaces the generic CrudTable so the toolbar UX
            matches /categories and /users. */}
        <DesksTable data={JSON.parse(JSON.stringify(data)) as DeskRow[]} />
      </main>
    </div>
  );
}
