import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@rayalaseema/db";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { getSiteConfig } from "@/lib/db-queries";

export const metadata: Metadata = {
  title: "సవరణలు & ఉపసంహరణలు | రాయలసీమ ఎక్స్‌ప్రెస్",
  description: "Published ePaper editions that were retracted, with the reason on record.",
};

export const revalidate = 300;

function teluguDate(d: Date): string {
  const months = ["జనవరి","ఫిబ్రవరి","మార్చి","ఏప్రిల్","మే","జూన్","జులై","ఆగస్టు","సెప్టెంబర్","అక్టోబర్","నవంబర్","డిసెంబర్"];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export default async function EpaperCorrectionsPage() {
  const config = await getSiteConfig();
  const killed = await prisma.epaperEdition.findMany({
    where: { workflowState: "KILLED" },
    orderBy: { killedAt: "desc" },
    select: {
      id: true, date: true, edition: true, title: true,
      killedAt: true, killedReason: true,
    },
    take: 200,
  });

  return (
    <div className="min-h-screen" style={{ background: "#fff" }}>
      <Header config={config} breakingNews={[]} />
      <div style={{ background: "var(--brand, #E01B1B)" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: "12px" }}>
          <span style={{ fontFamily: "var(--font-telugu-heading), serif", fontSize: 24, fontWeight: 800, color: "#fff" }}>
            సవరణలు & ఉపసంహరణలు
          </span>
        </div>
      </div>

      <main style={{ maxWidth: 980, margin: "0 auto", padding: "24px 12px 48px" }}>
        <p style={{ fontFamily: "var(--font-telugu-body), sans-serif", fontSize: 14, color: "#4b5563", marginBottom: 18 }}>
          ప్రచురించిన ఎడిషన్‌లు ఏదైనా కారణం వల్ల ఉపసంహరించబడితే ఇక్కడ నమోదు చేయబడతాయి.
          ఇది మా జవాబుదారీతనం కోసం బహిరంగ రికార్డ్.
        </p>

        {killed.length === 0 ? (
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 30, textAlign: "center", fontFamily: "var(--font-telugu-body), sans-serif", color: "#6b7280" }}>
            ఇప్పటివరకు ఏ ఎడిషన్ ఉపసంహరించబడలేదు.
          </div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {killed.map((k) => (
              <li key={k.id} style={{ background: "#fff", border: "1px solid #fee2e2", borderRadius: 8, padding: 14 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--font-telugu-heading), serif", fontWeight: 800, fontSize: 16, color: "#991b1b" }}>
                    {teluguDate(k.date)} · {k.edition === "main" ? "ప్రధాన ఎడిషన్" : k.edition}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Retracted
                  </span>
                  {k.killedAt && (
                    <span style={{ fontSize: 12, color: "#6b7280", marginLeft: "auto" }}>
                      {k.killedAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                    </span>
                  )}
                </div>
                {k.killedReason && (
                  <p style={{ marginTop: 8, fontFamily: "var(--font-telugu-body), sans-serif", fontSize: 14, color: "#374151" }}>
                    <strong>కారణం:</strong> {k.killedReason}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <Link href="/epaper" style={{ display: "inline-block", marginTop: 20, color: "var(--brand, #E01B1B)", fontWeight: 700, textDecoration: "none" }}>
          ← ఈ-పేపర్‌కి తిరిగి వెళ్ళండి
        </Link>
      </main>

      <Footer config={config} />
    </div>
  );
}
