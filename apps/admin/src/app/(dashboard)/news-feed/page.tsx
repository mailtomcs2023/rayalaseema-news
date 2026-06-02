// News Feed - restored after H1 #131 cleanup. Browse free news sources
// (NewsData.io + Google News RSS) and import a result as a draft Content
// row in one click. The new draft drops into /content list for further
// AI translation / editing.
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { WithTooltip } from "@/components/ui/tooltip";
import { useKycGate } from "@/components/kyc-gated-link";

interface NewsItem {
  externalId: string;
  title: string;
  description: string;
  content?: string | null; // full story HTML (PTI ships this; NewsData sometimes)
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
  ptiTopCategory?: string;
  ptiSubcategories?: string[];
}

// Default keyword set for NewsData / Google News. PTI gets a blank
// search by default - its wire copy doesn't use district names, so any
// post-fetch filter on these kills every result.
const DEFAULT_QUERY = "Rayalaseema OR Kurnool OR Anantapur OR Kadapa OR Tirupati";

// Categories shown when the PTI tab is active. Each entry's value is
// sent to the API as ?category=...; the backend disambiguates between
// PTI top-level categories (BUSINESS, SPORTS, ...) and subcategory
// tokens (CRI, LGL, ENT, NRG/ERG/WRG/SRG, ...) by membership.
const PTI_CATEGORIES = [
  { value: "", label: "All categories" },
  { value: "NATIONAL", label: "National (top)" },
  { value: "NAT", label: "National (subcat)" },
  { value: "BUSINESS", label: "Business" },
  { value: "COM", label: "Commerce" },
  { value: "ECO", label: "Economy" },
  { value: "SPORTS", label: "Sports" },
  { value: "SPO", label: "Sports (subcat)" },
  { value: "CRI", label: "Cricket" },
  { value: "FOREIGN", label: "Foreign" },
  { value: "INTERNATIONAL", label: "International" },
  { value: "INT", label: "International (subcat)" },
  { value: "LGL", label: "Legal" },
  { value: "ENT", label: "Entertainment / Lifestyle" },
  { value: "NRG", label: "Regional - North" },
  { value: "ERG", label: "Regional - East" },
  { value: "WRG", label: "Regional - West" },
  { value: "SRG", label: "Regional - South" },
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
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [language, setLanguage] = useState("te,en");
  const [provider, setProvider] = useState<Provider>("newsdata");
  const [ptiCategory, setPtiCategory] = useState("");
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<Record<string, string>>({}); // externalId → new content id
  const [error, setError] = useState("");
  const [autoImportStatus, setAutoImportStatus] = useState<string>("");
  const [autoImporting, setAutoImporting] = useState(false);
  const [previewItem, setPreviewItem] = useState<NewsItem | null>(null);
  const { guard: kycGuard } = useKycGate();

  const fetchNews = useCallback(async (searchQuery?: string, providerOverride?: Provider) => {
    // Honour an explicit empty string from the caller (e.g. the PTI tab
    // click). Only fall back to the current state query when searchQuery
    // is omitted entirely.
    const q = typeof searchQuery === "string" ? searchQuery : query;
    const p = providerOverride || provider;
    // PTI tab still works with an empty query - it pulls the last 24h
    // window and lets the admin browse without keyword pre-filtering.
    if (!q.trim() && p !== "pti") return;
    setLoading(true);
    setError("");
    try {
      let url = `/api/fetch-news?provider=${p}&size=15`;
      if (q.trim()) url += `&q=${encodeURIComponent(q)}`;
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
        if ((data.articles || []).length === 0) {
          setError(p === "pti"
            ? "PTI returned 0 stories in the last 24h window for this filter. Try All categories, widen the time window, or check trial centercode coverage."
            : "No results. Try different keywords or switch provider.");
        }
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

  // PTI category dropdown changes refetch immediately - no submit
  // needed. Skipped on first render and on non-PTI providers.
  const isFirstPtiRender = useRef(true);
  useEffect(() => {
    if (provider !== "pti") { isFirstPtiRender.current = true; return; }
    if (isFirstPtiRender.current) { isFirstPtiRender.current = false; return; }
    fetchNews(undefined, "pti");
  }, [ptiCategory, provider, fetchNews]);

  const importArticle = async (article: NewsItem) => {
    setImporting(article.externalId);
    try {
      const res = await fetch("/api/fetch-news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: article.title,
          description: article.description,
          content: article.content || null,
          imageUrl: article.imageUrl,
          sourceUrl: article.sourceUrl,
          source: article.source,
          byline: article.byline || null,
          edNote: article.edNote || null,
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
                onClick={() => {
                  setProvider(p.value);
                  setAutoImportStatus("");
                  // PTI wire copy doesn't include district names - the
                  // default Rayalaseema/Kurnool/... search filter would
                  // kill every result. Clear when entering PTI; restore
                  // the district default when leaving back to a keyword-
                  // search provider.
                  let nextQuery = query;
                  if (p.value === "pti") {
                    nextQuery = query === DEFAULT_QUERY ? "" : query;
                  } else if (provider === "pti" && query === "") {
                    nextQuery = DEFAULT_QUERY;
                  }
                  setQuery(nextQuery);
                  fetchNews(nextQuery, p.value);
                }}
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
                  <div style={{ fontSize: 11, color: "#9ca3af", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <span><b>{a.source}</b></span>
                    {a.publishedAt && <span>{new Date(a.publishedAt).toLocaleString()}</span>}
                    {a.language && <span>{a.language}</span>}
                    {a.byline && <span>By {a.byline}</span>}
                    {a.ptiTopCategory && <span style={{ padding: "1px 6px", background: "#eef2ff", color: "#3730a3", borderRadius: 3, fontWeight: 600 }}>{a.ptiTopCategory}</span>}
                    {a.ptiSubcategories?.map((s) => (
                      <span key={s} style={{ padding: "1px 6px", background: "#f3f4f6", color: "#374151", borderRadius: 3, fontWeight: 600 }}>{s}</span>
                    ))}
                    {a.source === "PTI" ? (
                      <button onClick={() => setPreviewItem(a)} style={{ background: "none", border: "none", color: "#2563eb", padding: 0, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                        Preview full story ▾
                      </button>
                    ) : (
                      <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>Open source ↗</a>
                    )}
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

      {/* PTI preview modal. The synthetic sourceUrl can't be opened
        (PTI portal is gated), so the editor reads the full story HTML
        from the API response right here. Import button reuses the
        same flow as the inline card button. */}
      {previewItem && (
        <div
          onClick={() => setPreviewItem(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(17,24,39,0.6)",
            display: "flex", alignItems: "flex-start", justifyContent: "center",
            zIndex: 1000, padding: 24, overflowY: "auto",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 12, maxWidth: 820, width: "100%",
              boxShadow: "0 20px 50px rgba(0,0,0,0.25)", overflow: "hidden",
            }}
          >
            <div style={{ padding: "16px 22px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>
                {previewItem.source} {previewItem.ptiTopCategory ? `· ${previewItem.ptiTopCategory}` : ""} {previewItem.ptiSubcategories?.length ? `· ${previewItem.ptiSubcategories.join(" / ")}` : ""}
              </div>
              <button onClick={() => setPreviewItem(null)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#6b7280", lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: "20px 22px" }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111", marginBottom: 10, lineHeight: 1.3 }}>{previewItem.title}</h2>
              <div style={{ fontSize: 12, color: "#6b7280", display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
                {previewItem.publishedAt && <span>{new Date(previewItem.publishedAt).toLocaleString()}</span>}
                {previewItem.byline && <span>By <b>{previewItem.byline}</b></span>}
                {previewItem.keywords?.length ? <span>{previewItem.keywords.join(" / ")}</span> : null}
              </div>
              {previewItem.edNote && (
                <div style={{ marginBottom: 14, padding: "8px 12px", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 6, fontSize: 12, color: "#92400e" }}>
                  <b>Editor's Note:</b> {previewItem.edNote}
                </div>
              )}
              <div
                style={{ fontSize: 14, lineHeight: 1.7, color: "#1f2937", maxHeight: "55vh", overflowY: "auto", paddingRight: 6 }}
                dangerouslySetInnerHTML={{ __html: previewItem.content || `<p>${previewItem.description}</p>` }}
              />
            </div>
            <div style={{ padding: "14px 22px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "flex-end", gap: 10, background: "#f9fafb" }}>
              <button onClick={() => setPreviewItem(null)}
                style={{ padding: "9px 16px", background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Close
              </button>
              {imported[previewItem.externalId] ? (
                <button
                  onClick={() => router.push(`/content/${imported[previewItem.externalId]}`)}
                  style={{ padding: "9px 16px", background: "#10b981", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  Open draft →
                </button>
              ) : (
                <button
                  onClick={kycGuard("import news", async () => {
                    if (previewItem) {
                      await importArticle(previewItem);
                    }
                  })}
                  disabled={importing === previewItem.externalId}
                  style={{ padding: "9px 16px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: importing === previewItem.externalId ? "not-allowed" : "pointer", opacity: importing === previewItem.externalId ? 0.5 : 1 }}>
                  {importing === previewItem.externalId ? "Importing…" : "Import as draft"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
