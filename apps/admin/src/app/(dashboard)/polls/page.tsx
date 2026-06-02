import { prisma } from "@rayalaseema/db";
import { PollsTable, type PollRow } from "./polls-table";

export default async function PollsPage() {
  const raw = await prisma.poll.findMany({
    orderBy: { createdAt: "desc" },
    include: { options: { orderBy: { id: "asc" } } },
  });
  // JSON round-trip flattens Date so it crosses the server → client boundary cleanly.
  const data: PollRow[] = JSON.parse(JSON.stringify(raw));

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111", marginBottom: 4 }}>Polls & Surveys</h1>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
          {data.length} poll{data.length === 1 ? "" : "s"} · WhatsApp-style, one vote per device
        </p>
        <PollsTable data={data} />
      </main>
    </div>
  );
}
