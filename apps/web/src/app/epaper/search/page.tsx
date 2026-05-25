"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Hit {
  kind: "article" | "ocr";
  editionId: string;
  editionDate: string;
  edition: string;
  pageNumber: number;
  pageLabel: string;
  articleId?: string;
  articleSlug?: string;
  title: string;
  snippet: string;
}

function SearchInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const initialQ = sp.get("q") || "";
  const [q, setQ] = useState(initialQ);
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!initialQ || initialQ.length < 2) { setHits([]); return; }
    setLoading(true);
    fetch(`/api/epaper/search?q=${encodeURIComponent(initialQ)}`)
      .then((r) => r.json())
      .then((data) => setHits(data.hits || []))
      .catch(() => setHits([]))
      .finally(() => setLoading(false));
  }, [initialQ]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/epaper/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 14px 48px" }}>
      <h1 style={{ fontFamily: "var(--font-telugu-heading), serif", fontSize: 28, fontWeight: 800, marginBottom: 6, color: "#111" }}>
        పాత ఎడిషన్‌లలో వెతకండి
      </h1>
      <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 14 }}>
        Telugu or English. Searches headlines, summaries, and OCR'd legacy pages.
      </p>

      <form onSubmit={submit} style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input
          autoFocus type="text" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="ఉదా: చంద్రబాబు నాయుడు, IPL, RTC..."
          style={{ flex: 1, padding: "10px 14px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 15, fontFamily: "var(--font-telugu-body), sans-serif" }}
        />
        <button type="submit" style={{ padding: "10px 20px", background: "var(--brand, #E01B1B)", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          వెతుకు
        </button>
      </form>

      {loading && <p style={{ color: "#6b7280" }}>Searching…</p>}
      {!loading && initialQ && hits.length === 0 && (
        <div style={{ background: "#f9fafb", padding: 24, borderRadius: 8, textAlign: "center", color: "#6b7280" }}>
          No results for "<strong>{initialQ}</strong>".
        </div>
      )}

      {hits.length > 0 && (
        <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
          {hits.length} result{hits.length > 1 ? "s" : ""}
        </p>
      )}

      <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {hits.map((h, i) => (
          <li key={i} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 14 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
              <Link href={`/epaper?date=${h.editionDate}&edition=${h.edition}`}
                style={{ fontSize: 11, fontWeight: 700, color: "var(--brand, #E01B1B)", textDecoration: "none", textTransform: "uppercase", letterSpacing: 0.5 }}>
                {h.editionDate} · {h.edition === "main" ? "ప్రధాన" : h.edition} · Page {h.pageNumber}
              </Link>
              <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: h.kind === "ocr" ? "#fef3c7" : "#dbeafe", color: h.kind === "ocr" ? "#92400e" : "#1e40af", fontWeight: 700, textTransform: "uppercase" }}>
                {h.kind === "ocr" ? "OCR" : "Article"}
              </span>
            </div>
            <h3 style={{ fontFamily: "var(--font-telugu-heading), serif", fontSize: 17, fontWeight: 800, color: "#111", marginBottom: 4 }}>
              {h.articleSlug ? (
                <Link href={`/article/${h.articleSlug}`} style={{ color: "inherit", textDecoration: "none" }}>{h.title}</Link>
              ) : h.title}
            </h3>
            {h.snippet && (
              <p style={{ fontFamily: "var(--font-telugu-body), sans-serif", fontSize: 13, color: "#4b5563", lineHeight: 1.5 }}>{h.snippet}</p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}

export default function EpaperSearchPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Loading…</div>}>
      <SearchInner />
    </Suspense>
  );
}
