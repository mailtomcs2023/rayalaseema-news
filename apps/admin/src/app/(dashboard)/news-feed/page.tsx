"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";

interface NewsItem {
  externalId: string;
  title: string;
  description: string;
  imageUrl: string;
  sourceUrl: string;
  source: string;
  language: string;
  category: string;
  publishedAt: string;
  keywords: string[];
}

export default function NewsFeedPage() {
  const router = useRouter();
  const [articles, setArticles] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("Rayalaseema OR Kurnool OR Anantapur OR Kadapa OR Tirupati");
  const [language, setLanguage] = useState("te,en");
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  const fetchNews = useCallback(async (searchQuery?: string) => {
    const q = (typeof searchQuery === "string" ? searchQuery : "") || query;
    if (!q || !q.trim()) return;
    setLoading(true);
    setError("");
    try {
      const url = `/api/fetch-news?q=${encodeURIComponent(q)}&language=${language}&size=10`;
      console.log("Fetching:", url);
      const res = await fetch(url);
      if (!res.ok) {
        setError(`API error: ${res.status}`);
        setLoading(false);
        return;
      }
      const data = await res.json();
      console.log("Got", data.articles?.length, "articles");
      setArticles(data.articles || []);
      if (data.articles?.length === 0) setError("No results found. Try different keywords.");
    } catch (e: any) {
      console.error("Fetch error:", e);
      setError(e.message || "Failed to fetch news");
    }
    setLoading(false);
  }, [query, language]);

  // Auto-load on page open
  useEffect(() => {
    fetchNews("Rayalaseema");
  }, []);

  const importArticle = async (article: NewsItem) => {
    setImporting(article.externalId);
    const res = await fetch("/api/fetch-news", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: article.title,
        description: article.description,
        imageUrl: article.imageUrl,
        sourceUrl: article.sourceUrl,
      }),
    });
    if (res.ok) {
      setImported((prev) => new Set(prev).add(article.externalId));
    }
    setImporting(null);
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111" }}>News Feed</h1>
          <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>Browse latest Telugu & AP news. Import as draft articles.</p>
        </div>

        {/* Search bar */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20, background: "#fff", padding: 16, borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search keywords..."
            style={{ flex: "1 1 220px", minWidth: 0, padding: "10px 14px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, outline: "none" }}
            onKeyDown={(e) => e.key === "Enter" && fetchNews()}
          />
          <select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ padding: "10px 14px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14 }}>
            <option value="te,en">Telugu + English</option>
            <option value="te">Telugu Only</option>
            <option value="en">English Only</option>
          </select>
          <button onClick={() => fetchNews()} disabled={loading} style={{ padding: "10px 24px", background: "#FF2C2C", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        {/* Quick search buttons */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {["Kurnool", "Anantapur", "Kadapa", "Tirupati", "Chittoor", "Nandyal", "AP Politics", "Rayalaseema", "Telugu Cinema", "IPL Cricket"].map((q) => (
            <button key={q} onClick={() => { setQuery(q); fetchNews(q); }} style={{ padding: "5px 12px", background: "#fff", border: "1px solid #ddd", borderRadius: 16, fontSize: 12, fontWeight: 600, color: "#555", cursor: "pointer" }}>
              {q}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 16px", marginBottom: 12, fontSize: 13, color: "#dc2626" }}>
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: 40, background: "#fff", borderRadius: 10, color: "#888" }}>
            <p style={{ fontSize: 16 }}>Searching news...</p>
          </div>
        )}

        {/* Results */}
        {articles.length === 0 && !loading && !error && (
          <div style={{ textAlign: "center", padding: 60, background: "#fff", borderRadius: 10, color: "#aaa" }}>
            <p style={{ fontSize: 16 }}>Loading latest Rayalaseema news...</p>
            <p style={{ fontSize: 13, marginTop: 8 }}>Powered by NewsData.io API</p>
          </div>
        )}

        <div className="admin-card-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {articles.map((article) => (
            <div key={article.externalId} style={{ background: "#fff", borderRadius: 10, overflow: "hidden", border: "1px solid #eee", display: "flex", flexDirection: "column" }}>
              {article.imageUrl && (
                <img src={article.imageUrl} alt="" style={{ width: "100%", height: 180, objectFit: "cover" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              )}
              <div style={{ padding: 14, flex: 1, display: "flex", flexDirection: "column" }}>
                {/* Source + language */}
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: article.language === "telugu" ? "#FF2C2C" : "#3b82f6", padding: "2px 8px", borderRadius: 3 }}>
                    {article.language === "telugu" ? "తెలుగు" : "EN"}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#888" }}>{article.source}</span>
                  <span style={{ fontSize: 10, color: "#aaa", marginLeft: "auto" }}>
                    {new Date(article.publishedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>

                {/* Title */}
                <h3 style={{ fontSize: 15, fontWeight: 800, color: "#111", lineHeight: 1.5, marginBottom: 6 }}>
                  {article.title}
                </h3>

                {/* Description */}
                <p style={{ fontSize: 12, color: "#666", lineHeight: 1.6, flex: 1 }}>
                  {article.description?.substring(0, 200)}...
                </p>

                {/* Keywords */}
                {article.keywords?.length > 0 && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                    {article.keywords.slice(0, 5).map((k, i) => (
                      <span key={i} style={{ fontSize: 10, padding: "2px 6px", background: "#f3f4f6", borderRadius: 3, color: "#888" }}>{k}</span>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <a href={article.sourceUrl} target="_blank" style={{ padding: "6px 12px", background: "#f3f4f6", borderRadius: 6, fontSize: 12, fontWeight: 600, color: "#555", textDecoration: "none" }}>
                    View Original
                  </a>
                  {imported.has(article.externalId) ? (
                    <span style={{ padding: "6px 12px", background: "#dcfce7", borderRadius: 6, fontSize: 12, fontWeight: 600, color: "#166534" }}>
                      Imported as Draft
                    </span>
                  ) : (
                    <button
                      onClick={() => importArticle(article)}
                      disabled={importing === article.externalId}
                      style={{ padding: "6px 12px", background: "#FF2C2C", borderRadius: 6, fontSize: 12, fontWeight: 700, color: "#fff", border: "none", cursor: "pointer" }}
                    >
                      {importing === article.externalId ? "Importing..." : "Import as Draft"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
