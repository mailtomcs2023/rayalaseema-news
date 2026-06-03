"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { articleHref } from "@/lib/article-href";

interface Article {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  featuredImage: string | null;
  publishedAt: string | null;
  category: { name: string; nameEn: string; slug: string; color: string };
}

// Google Transliteration API - type English, get Telugu suggestions
async function transliterate(word: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://inputtools.google.com/request?text=${encodeURIComponent(word)}&itc=te-t-i0-und&num=5&cp=0&cs=1&ie=utf-8&oe=utf-8&app=demopage`
    );
    const data = await res.json();
    if (data[0] === "SUCCESS" && data[1]?.[0]?.[1]?.length > 0) {
      return data[1][0][1];
    }
  } catch {}
  return [];
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [teluguQuery, setTeluguQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Auto-transliterate as user types English
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setSuggestions([]); return; }

    // If query is already Telugu (non-ASCII), skip transliteration
    if (/[^\x00-\x7F]/.test(query)) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const words = query.trim().split(/\s+/);
      const lastWord = words[words.length - 1];
      if (lastWord && /^[a-zA-Z]+$/.test(lastWord)) {
        const results = await transliterate(lastWord);
        setSuggestions(results.slice(0, 5));
      }
    }, 300);
  }, [query]);

  const doSearch = async (searchQuery: string, p = 1) => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setSearched(true);
    setTeluguQuery(searchQuery);
    const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&page=${p}`);
    const data = await res.json();
    setArticles(data.articles || []);
    setTotal(data.total || 0);
    setPage(p);
    setLoading(false);
    setSuggestions([]);

    // Save to recent searches
    const recent = JSON.parse(localStorage.getItem("recent-searches") || "[]");
    const updated = [searchQuery, ...recent.filter((s: string) => s !== searchQuery)].slice(0, 8);
    localStorage.setItem("recent-searches", JSON.stringify(updated));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      doSearch(query);
    }
  };

  const pickSuggestion = (s: string) => {
    const words = query.trim().split(/\s+/);
    words[words.length - 1] = s;
    const newQuery = words.join(" ");
    setQuery(newQuery);
    setSuggestions([]);
    doSearch(newQuery);
  };

  const recentSearches: string[] = typeof window !== "undefined"
    ? JSON.parse(localStorage.getItem("recent-searches") || "[]")
    : [];

  const totalPages = Math.ceil(total / 15);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "30px 16px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111", marginBottom: 4 }}>వార్తలు వెతకండి</h1>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>Search in Telugu or English - type in English and get Telugu suggestions</p>

        {/* Search Input */}
        <div style={{ position: "relative", marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="కర్నూలు వార్తలు... or type 'kurnool' for Telugu"
              autoFocus
              style={{
                flex: 1, padding: "14px 18px", fontSize: 16, border: "2px solid #e5e7eb", borderRadius: 12,
                outline: "none", fontFamily: "'Noto Sans Telugu', sans-serif",
              }}
            />
            <button onClick={() => doSearch(query)} disabled={loading} style={{
              padding: "14px 28px", background: "var(--color-brand)", color: "#fff", border: "none",
              borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer",
            }}>
              {loading ? "..." : "Search"}
            </button>
          </div>

          {/* Telugu Transliteration Suggestions */}
          {suggestions.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 80, marginTop: 4,
              background: "#fff", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", zIndex: 50,
              padding: 8,
            }}>
              <p style={{ fontSize: 11, color: "#888", padding: "4px 8px" }}>Telugu suggestions:</p>
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => pickSuggestion(s)} style={{
                  display: "block", width: "100%", textAlign: "left", padding: "8px 12px",
                  border: "none", background: "transparent", cursor: "pointer", fontSize: 16,
                  borderRadius: 6, fontFamily: "'Noto Sans Telugu', sans-serif",
                }} className="hover:bg-gray-100">
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recent Searches */}
        {!searched && recentSearches.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Recent searches:</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {recentSearches.map((s, i) => (
                <button key={i} onClick={() => { setQuery(s); doSearch(s); }} style={{
                  padding: "6px 14px", background: "#f3f4f6", border: "none", borderRadius: 20,
                  fontSize: 13, cursor: "pointer", color: "#555",
                }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {searched && (
          <div>
            <p style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>
              {loading ? "Searching..." : `${total} results for "${teluguQuery}"`}
            </p>

            {articles.map((a) => (
              <Link key={a.id} href={articleHref(a)} style={{ textDecoration: "none" }}>
                <div style={{
                  display: "flex", gap: 16, padding: 16, background: "#fff", borderRadius: 10,
                  marginBottom: 10, boxShadow: "0 1px 2px rgba(0,0,0,0.04)", transition: "box-shadow 0.15s",
                }} className="hover:shadow-md">
                  {a.featuredImage && (
                    <img src={a.featuredImage} alt="" style={{ width: 120, height: 80, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#fff", background: a.category.color, padding: "1px 6px", borderRadius: 3 }}>
                      {a.category.name}
                    </span>
                    <h3 style={{ fontSize: 16, fontWeight: 800, color: "#111", marginTop: 4, lineHeight: 1.4 }}>{a.title}</h3>
                    {a.summary && (
                      <p style={{ fontSize: 13, color: "#666", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.summary}</p>
                    )}
                    <p style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
                      {a.publishedAt ? new Date(a.publishedAt).toLocaleDateString("te-IN") : ""}
                    </p>
                  </div>
                </div>
              </Link>
            ))}

            {articles.length === 0 && !loading && (
              <div style={{ textAlign: "center", padding: 60, color: "#aaa" }}>
                <p style={{ fontSize: 40, marginBottom: 12 }}>🔍</p>
                <p style={{ fontSize: 16, fontWeight: 600 }}>ఫలితాలు లేవు</p>
                <p style={{ fontSize: 13 }}>No results found. Try different keywords.</p>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 20 }}>
                {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 10).map((p) => (
                  <button key={p} onClick={() => doSearch(teluguQuery, p)} style={{
                    padding: "6px 12px", borderRadius: 6, border: "1px solid #ddd",
                    background: p === page ? "var(--color-brand)" : "#fff",
                    color: p === page ? "#fff" : "#333", fontWeight: p === page ? 700 : 400, cursor: "pointer",
                  }}>
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
