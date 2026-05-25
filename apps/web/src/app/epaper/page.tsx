import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@rayalaseema/db";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { EpaperViewer } from "@/components/epaper-viewer";
import { getSiteConfig } from "@/lib/db-queries";

export const metadata: Metadata = {
  title: "ఈ-పేపర్ | రాయలసీమ ఎక్స్‌ప్రెస్",
  description: "రాయలసీమ ఎక్స్‌ప్రెస్ ఈ-పేపర్ — ప్రధాన + జిల్లా ఎడిషన్లు.",
};

const EDITION_NAMES: Record<string, string> = {
  main: "ప్రధాన ఎడిషన్",
  kurnool: "కర్నూలు", nandyal: "నంద్యాల", ananthapuramu: "అనంతపురం",
  "sri-sathya-sai": "శ్రీ సత్యసాయి", kadapa: "కడప", annamayya: "అన్నమయ్య",
  tirupati: "తిరుపతి", chittoor: "చిత్తూరు",
};

function teluguDate(d: Date): string {
  const months = ["జనవరి","ఫిబ్రవరి","మార్చి","ఏప్రిల్","మే","జూన్","జులై","ఆగస్టు","సెప్టెంబర్","అక్టోబర్","నవంబర్","డిసెంబర్"];
  const days = ["ఆదివారం","సోమవారం","మంగళవారం","బుధవారం","గురువారం","శుక్రవారం","శనివారం"];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${days[d.getUTCDay()]}`;
}

export default async function EpaperPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; edition?: string }>;
}) {
  const { date, edition } = await searchParams;
  const config = await getSiteConfig();
  const editionKey = edition || "main";

  // Ready editions, newest first. Explicitly exclude KILLED workflow state
  // even though killed editions have active=false too — defense in depth.
  const editions = await prisma.epaperEdition.findMany({
    where: { active: true, status: "ready", NOT: { workflowState: "KILLED" } },
    orderBy: { date: "desc" },
    select: { id: true, date: true, edition: true },
    take: 200,
  });

  const dates = [...new Set(editions.map((e) => e.date.toISOString().slice(0, 10)))];
  const selDate = date && dates.includes(date) ? date : dates[0];

  const selected = selDate
    ? await prisma.epaperEdition.findUnique({
        where: { date_edition: { date: new Date(selDate), edition: editionKey } },
        include: { pages: { orderBy: { pageNumber: "asc" } } },
      })
    : null;

  // Which editions exist for the selected date
  const editionsForDate = selDate
    ? editions.filter((e) => e.date.toISOString().slice(0, 10) === selDate).map((e) => e.edition)
    : [];

  const pill = (active: boolean) => ({
    fontFamily: "var(--font-telugu-body), sans-serif",
    fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 999,
    textDecoration: "none",
    background: active ? "var(--brand, #E01B1B)" : "#f3f4f6",
    color: active ? "#fff" : "#374151",
    border: "1px solid " + (active ? "var(--brand, #E01B1B)" : "#e5e7eb"),
  });

  return (
    <div className="min-h-screen" style={{ background: "#fff" }}>
      <Header config={config} breakingNews={[]} />

      <div style={{ background: "var(--brand, #E01B1B)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <span style={{ fontFamily: "var(--font-telugu-heading), serif", fontSize: 26, fontWeight: 800, color: "#fff" }}>
            ఈ-పేపర్
          </span>
          <Link href="/epaper/search" style={{ background: "#fff", color: "var(--brand, #E01B1B)", padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
            🔍 పాత ఎడిషన్‌లలో వెతుకు
          </Link>
        </div>
      </div>

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "18px 12px 48px" }}>
        {/* Date picker */}
        {dates.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {dates.map((ds) => (
              <Link key={ds} href={`/epaper?date=${ds}&edition=${editionKey}`} style={pill(ds === selDate)}>
                {teluguDate(new Date(ds))}
              </Link>
            ))}
          </div>
        )}

        {/* Edition switcher */}
        {editionsForDate.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {editionsForDate.map((ek) => (
              <Link key={ek} href={`/epaper?date=${selDate}&edition=${ek}`} style={pill(ek === editionKey)}>
                {EDITION_NAMES[ek] || ek}
              </Link>
            ))}
          </div>
        )}

        {selected && selected.pages.length > 0 ? (
          <EpaperViewer
            pages={selected.pages.map((p) => ({
              pageNumber: p.pageNumber,
              label: p.label,
              imageUrl: p.imageUrl,
              hotspots: (p.hotspots as any) || [],
            }))}
            pdfUrl={selected.pdfUrl}
            editionId={selected.id}
            dateLabel={`${teluguDate(selected.date)} · ${EDITION_NAMES[editionKey] || editionKey}`}
          />
        ) : (
          <div
            style={{
              background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8,
              padding: 60, textAlign: "center",
              fontFamily: "var(--font-telugu-body), sans-serif", color: "#6b7280",
            }}
          >
            ఈ ఎడిషన్ త్వరలో అందుబాటులోకి వస్తుంది.
          </div>
        )}
      </main>

      <Footer config={config} />
    </div>
  );
}
