// News Feed - restored after H1 #131 cleanup. Browse free news sources
// (NewsData.io + Google News RSS) and import a result as a draft Content
// row in one click. The new draft drops into /content list for further
// AI translation / editing.
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { WithTooltip } from "@/components/ui/tooltip";
import { useKycGate } from "@/components/kyc-gated-link";

interface NewsItem {
  externalId: string;
  title: string;
  description: string;
  imageUrl: string | null;
  sourceUrl: string;
  source: string;
  language: string;
  category: string;
  publishedAt: string;
  keywords: string[];
  // PTI-only - other providers leave these undefined.
  byline?: string;
  edNote?: string;
}

const PTI_CATEGORIES = [
  { value: "", label: "All categories" },
  { value: "NATIONAL", label: "National" },
  { value: "BUSINESS", label: "Business" },
  { value: "SPORTS", label: "Sports" },
  { value: "FOREIGN", label: "Foreign" },
  { value: "INTERNATIONAL", label: "International" },
  { value: "INDIA", label: "India" },
];

type Provider = "newsdata" | "googlenews" | "pti";

const PROVIDERS: { value: Provider; label: string; note: string }[] = [
  { value: "newsdata", label: "NewsData.io", note: "API key - Telugu + English, image URLs included" },
  { value: "googlenews", label: "Google News RSS", note: "No key - wider sources, no image URLs (use image search after import)" },
  { value: "pti", label: "PTI Wire", note: "Centercode - PTI editorial feed (English wire copy, last 24h, no images, q filters post-fetch)" },
];

export default function NewsFeedPage() {
  const router = useRouter();
  const [articles, setArticles] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("Rayalaseema OR Kurnool OR Anantapur OR Kadapa OR Tirupati");
  const [language, setLanguage] = useState("te,en");
  const [provider, setProvider] = useState<Provider>("newsdata");
  const [ptiCategory, setPtiCategory] = useState("");
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<Record<string, string>>({}); // externalId → new content id
  const [error, setError] = useState("");
  const [autoImportStatus, setAutoImportStatus] = useState<string>("");
  const [autoImporting, setAutoImporting] = useState(false);
  const { guard: kycGuard } = useKycGate();

  const fetchNews = useCallback(async (searchQuery?: string, providerOverride?: Provider) => {
    const q = (typeof searchQuery === "string" ? searchQuery : "") || query;
    const p = providerOverride || provider;
    // PTI tab still works with an empty query - it pulls the last 24h
    // window and lets the admin browse without keyword pre-filtering.
    if (!q.trim() && p !== "pti") return;
    setLoading(true);
    setError("");
    try {
      let url = `/api/fetch-news?provider=${p}&q=${encodeURIComponent(q)}&size=15`;
      if (p === "pti") {
        if (ptiCategory) url += `&category=${encodeURIComponent(ptiCategory)}`;
      } else {
        url += `&language=${language}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || `API error (${res.status})`);
        setArticles([]);
      } else {
        setArticles(data.articles || []);
        if ((data.articles || []).length === 0) setError("No results. Try different keywords or switch provider.");
      }
    } catch (e: any) {
      setError(e.message || "Failed to fetch news");
    }
    setLoading(false);
  }, [query, language, provider, ptiCategory]);

  const runPtiAutoImport = useCallback(async () => {
    if (autoImporting) return;
    setAutoImporting(true);
    setAutoImportStatus("Running PTI pipeline (translate + create drafts)…");
    try {
      const res = await fetch("/api/auto-fetch-pti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ptiCategories: ptiCategory ? [ptiCategory] : undefined,
          limit: 25,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setAutoImportStatus(`Error: ${data.error || res.status}`);
      } else {
        setAutoImportStatus(data.message || `Imported ${data.totalPublished}`);
      }
    } catch (e: any) {
      setAutoImportStatus(`Error: ${e.message || "failed"}`);
    }
    setAutoImporting(false);
  }, [ptiCategory, autoImporting]);

  useEffect(() => { fetchNews("Rayalaseema OR Kurnool", "newsdata"); }, []);

  const importArticle = async (article: NewsItem) => {
    setImporting(article.externalId);
    try {
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
      const data = await res.json();
      if (res.ok && data.id) {
        setImported((prev) => ({ ...prev, [article.externalId]: data.id }));
      } else if (res.status === 409 && data.existing?.id) {
        setImported((prev) => ({ ...prev, [article.externalId]: data.existing.id }));
      } else {
        setError(data.error || `Import failed (${res.status})`);
      }
    } catch (e: any) {
      setError(e.message || "Import failed");
    }
    setImporting(null);
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111" }}>News Feed</h1>
          <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
            Browse free news sources. Click "Import as draft" → land in /content for AI translation + editing.
          </p>
        </div>

        {/* Provider tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {PROVIDERS.map((p) => (
            <WithTooltip key={p.value} text={p.note}>
              <button
                onClick={() => { setProvider(p.value); setAutoImportStatus(""); fetchNews(undefined, p.value); }}
                style={{
                  padding: "6px 14px",
                  background: provider === p.value ? "#111827" : "#fff",
                  color: provider === p.value ? "#fff" : "#374151",
                  border: "1px solid #e5e7eb",
                  borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}
              >
                {p.label}
              </button>
            </WithTooltip>
          ))}
        </div>

        {/* Search bar */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, background: "#fff", padding: 14, borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={provider === "pti" ? "Filter PTI window… (English only, optional)" : "Search keywords… (English or Telugu)"}
            style={{ flex: "1 1 240px", minWidth: 0, padding: "10px 14px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, outline: "none" }}
            onKeyDown={(e) => { if (e.key === "Enter") fetchNews(); }}
          />
          {provider === "pti" ? (
            <select value={ptiCategory} onChange={(e) => setPtiCategory(e.target.value)}
              style={{ padding: "10px 14px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14 }}>
              {PTI_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          ) : (
            <select value={language} onChange={(e) => setLanguage(e.target.value)}
              style={{ padding: "10px 14px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14 }}>
              <option value="te,en">Telugu + English</option>
              <option value="te">Telugu only</option>
              <option value="en">English only</option>
            </select>
          )}
          <button onClick={() => fetchNews()} disabled={loading}
            style={{ padding: "10px 20px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1 }}>
            {loading ? "Searching…" : "Search"}
          </button>
          {provider === "pti" && (
            <WithTooltip text="Pulls last 24h of PTI wire, runs each story through the Eenadu-grade Telugu pipeline, and creates DRAFTs. Respects the category filter.">
              <button onClick={kycGuard("auto-import PTI", runPtiAutoImport)} disabled={autoImporting}
                style={{ padding: "10px 16px", background: "#0f766e", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: autoImporting ? "not-allowed" : "pointer", opacity: autoImporting ? 0.5 : 1 }}>
                {autoImporting ? "Importing…" : "Auto-import 24h →"}
              </button>
            </WithTooltip>
          )}
        </div>
        {autoImportStatus && (
          <div style={{ fontSize: 12, color: autoImportStatus.startsWith("Error") ? "#dc2626" : "#0f766e", marginBottom: 10 }}>
            {autoImportStatus}
          </div>
        )}

        <p style={{ fontSize: 11, color: "#6b7280", marginBottom: 14 }}>
          Source: <b>{PROVIDERS.find((p) => p.value === provider)?.label}</b> - {PROVIDERS.find((p) => p.value === provider)?.note}
        </p>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "10px 14px", borderRadius: 8, fontSize: 13, color: "#dc2626", marginBottom: 14 }}>
            {error}
            {error.toLowerCase().includes("not configured") && (
              <span> - set <code>{provider === "pti" ? "PTI_CENTERCODE" : "NEWSDATA_API_KEY"}</code> in admin env, or switch to Google News (no key needed).</span>
            )}
          </div>
        )}

        {/* Result list */}
        <div style={{ display: "grid", gap: 12 }}>
          {articles.map((a) => {
            const importedId = imported[a.externalId];
            return (
              <div key={a.externalId} style={{ background: "#fff", padding: 14, borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.04)", display: "flex", gap: 12, alignItems: "flex-start" }}>
                {a.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.imageUrl} alt="" style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} loading="lazy" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 4 }}>{a.title}</h3>
                  <p style={{ fontSize: 12, color: "#4b5563", marginBottom: 6, lineHeight: 1.4 }}>{(a.description || "").slice(0, 240)}</p>
                  <div style={{ fontSize: 11, color: "#9ca3af", display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span><b>{a.source}</b></span>
                    {a.publishedAt && <span>{new Date(a.publishedAt).toLocaleString()}</span>}
                    {a.language && <span>{a.language}</span>}
                    {a.byline && <span>By {a.byline}</span>}
                    <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>Open source ↗</a>
                  </div>
                  {a.edNote && (
                    <div style={{ marginTop: 6, padding: "4px 8px", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 4, fontSize: 11, color: "#92400e", display: "inline-block" }}>
                      <b>ED Note:</b> {a.edNote}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "stretch" }}>
                  {importedId ? (
                    <button onClick={() => router.push(`/content/${importedId}`)}
                      style={{ padding: "8px 14px", background: "#10b981", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Check size={14} strokeWidth={3} /> Open draft
                    </button>
                  ) : (
                    <button onClick={kycGuard("import news", () => importArticle(a))} disabled={importing === a.externalId}
                      style={{ padding: "8px 14px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: importing === a.externalId ? "not-allowed" : "pointer", whiteSpace: "nowrap", opacity: importing === a.externalId ? 0.5 : 1 }}>
                      {importing === a.externalId ? "Importing…" : "Import as draft"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {articles.length === 0 && !loading && !error && (
            <p style={{ textAlign: "center", color: "#888", padding: 40, fontSize: 13 }}>
              No articles loaded yet. Search above.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
