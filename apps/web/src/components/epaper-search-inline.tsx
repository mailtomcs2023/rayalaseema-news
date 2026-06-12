"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Inline e-paper search: lives on the /epaper page itself. Typing searches the
// edition index live (same /api/epaper/search the old standalone page used) and
// drops results in a panel right here - no navigation to a separate page.
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

export function EpaperSearchInline() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [searched, setSearched] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Debounced live search. Fires once typing settles and the term is >= 2 chars.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setSearched(false);
      return;
    }
    const t = setTimeout(() => {
      setLoading(true);
      setOpen(true);
      fetch(`/api/epaper/search?q=${encodeURIComponent(term)}`)
        .then((r) => r.json())
        .then((data) => setHits(data.hits || []))
        .catch(() => setHits([]))
        .finally(() => {
          setLoading(false);
          setSearched(true);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  // Close the results panel on an outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "min(440px, 100%)" }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim().length >= 2) setOpen(true);
        }}
        style={{ display: "flex", alignItems: "stretch", gap: 8 }}
      >
        <div style={{ position: "relative", flex: 1 }}>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--brand)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, pointerEvents: "none" }}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <Input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => { if (q.trim().length >= 2) setOpen(true); }}
            placeholder="పాత ఎడిషన్‌లలో వెతుకు…"
            className="h-9 rounded-full border-transparent bg-white pr-3 pl-9 text-[13px] text-foreground shadow-sm"
            style={{ fontFamily: "var(--font-telugu-body), sans-serif" }}
          />
        </div>
        <Button
          type="submit"
          className="h-9 rounded-full px-4 font-bold text-white"
          style={{ background: "var(--brand)", fontFamily: "var(--font-telugu-body), sans-serif" }}
        >
          వెతుకు
        </Button>
      </form>

      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0, left: 0,
            background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
            boxShadow: "0 12px 32px rgba(0,0,0,0.18)", maxHeight: 440,
            overflowY: "auto", zIndex: 50,
          }}
        >
          {loading && (
            <div style={{ padding: 16, fontSize: 13, color: "#6b7280", textAlign: "center", fontFamily: "var(--font-telugu-body), sans-serif" }}>
              వెతుకుతోంది…
            </div>
          )}
          {!loading && searched && hits.length === 0 && (
            <div style={{ padding: 16, fontSize: 13, color: "#6b7280", textAlign: "center", fontFamily: "var(--font-telugu-body), sans-serif" }}>
              ఫలితాలు లేవు.
            </div>
          )}
          {!loading && hits.length > 0 && (
            <ul style={{ listStyle: "none", margin: 0, padding: 6 }}>
              {hits.map((h, i) => (
                <li key={i}>
                  <Link
                    href={h.articleSlug ? `/article/${h.articleSlug}` : `/epaper?date=${h.editionDate}&edition=${h.edition}`}
                    onClick={() => setOpen(false)}
                    className="ep-search-hit"
                    style={{ display: "block", padding: "10px 12px", borderRadius: 8, textDecoration: "none", color: "inherit" }}
                  >
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--brand)", textTransform: "uppercase", letterSpacing: 0.4 }}>
                        {h.editionDate} · {h.edition === "main" ? "ప్రధాన" : h.edition} · పేజీ {h.pageNumber}
                      </span>
                      <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: h.kind === "ocr" ? "#fef3c7" : "#dbeafe", color: h.kind === "ocr" ? "#92400e" : "#1e40af", fontWeight: 700, textTransform: "uppercase" }}>
                        {h.kind === "ocr" ? "OCR" : "Article"}
                      </span>
                    </div>
                    <div style={{ fontFamily: "var(--font-telugu-heading), serif", fontSize: 15, fontWeight: 700, color: "#111", lineHeight: 1.3 }}>
                      {h.title}
                    </div>
                    {h.snippet && (
                      <div style={{ fontFamily: "var(--font-telugu-body), sans-serif", fontSize: 12, color: "#6b7280", lineHeight: 1.45, marginTop: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {h.snippet}
                      </div>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <style>{`.ep-search-hit:hover { background: #f9fafb; }`}</style>
    </div>
  );
}
