// Auto-fetch picker modal. Three-step flow:
//   1) "pick-cats"     pick categories / districts
//   2) "pick-articles" preview NewsData hits per category, check the ones to
//                      import (already-imported items are dimmed + unchecked)
//   3) "results"       per-category outcome table after import
//
// Backend: /api/auto-fetch accepts:
//   { action: "preview", categories: [..] }                   -> step 2 data
//   { articles: [{categorySlug, title, link, image_url, ...}] } -> step 3 data
"use client";

import { useState, useEffect } from "react";

// Topics + Districts are loaded from the DB (Category + District tables) when
// the modal opens — no hardcoded list. Admin edits to /categories or
// /locations propagate here on the next open. The auto-fetch backend has a
// curated `categoryQueries` map with richer NewsData query strings for the
// classic slugs; any slug NOT in that map falls back to using the slug
// itself (or label) as the NewsData q parameter.
interface OptionRow { slug: string; label: string }

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: (totalPublished: number) => void;
}

interface RawArticle {
  article_id?: string;
  title?: string;
  description?: string;
  content?: string;
  image_url?: string | null;
  link?: string;
  source_id?: string;
  pubDate?: string;
  alreadyImported?: boolean;
}

interface PreviewBucket {
  category: string;
  results: RawArticle[];
  error?: string;
}

interface ImportResult {
  cat: string;
  fetched: number;
  published: number;
  error?: string;
}

export function AutoFetchModal({ open, onClose, onDone }: Props) {
  const [step, setStep] = useState<"pick-cats" | "pick-articles" | "results">("pick-cats");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [forceReimport, setForceReimport] = useState(false);

  // Categories + districts pulled from DB. district-news is excluded from the
  // topic list because the dedicated district group already covers every
  // district sub-feed.
  const [topics, setTopics] = useState<OptionRow[]>([]);
  const [districts, setDistricts] = useState<OptionRow[]>([]);
  const [optsLoaded, setOptsLoaded] = useState(false);

  useEffect(() => {
    if (!open || optsLoaded) return;
    let alive = true;
    (async () => {
      try {
        const [catRes, locRes] = await Promise.all([
          fetch("/api/categories"),
          fetch("/api/locations"),
        ]);
        const cats = catRes.ok ? await catRes.json() : [];
        const locs = locRes.ok ? await locRes.json() : [];
        if (!alive) return;
        const t: OptionRow[] = (Array.isArray(cats) ? cats : [])
          .filter((c: any) => c.active !== false && c.slug !== "district-news")
          .map((c: any) => ({ slug: c.slug, label: c.nameEn || c.name || c.slug }));
        const d: OptionRow[] = (Array.isArray(locs) ? locs : [])
          .map((l: any) => ({ slug: `district-${l.slug}`, label: l.nameEn || l.name || l.slug }));
        setTopics(t);
        setDistricts(d);
        setOptsLoaded(true);
      } catch {
        setOptsLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, [open, optsLoaded]);

  // step 2 state
  const [buckets, setBuckets] = useState<PreviewBucket[]>([]);
  // Articles are keyed by their `link` (sourceUrl) — the only globally-unique
  // value NewsData consistently returns.
  const [pickedLinks, setPickedLinks] = useState<Set<string>>(new Set());

  // step 3 state
  const [perCategory, setPerCategory] = useState<ImportResult[]>([]);

  // Inline single-row import state. URLs we're currently sending to the
  // import endpoint (loading state) and URLs already imported in this
  // session (✓ badge replaces the Import button).
  const [inlineImporting, setInlineImporting] = useState<Set<string>>(new Set());

  // Inline single-article import. Hits the same /api/auto-fetch with a
  // 1-element articles[] so the backend path is identical to the bulk
  // case. On success the row is marked alreadyImported in-place so the
  // checkbox + button disappear without disturbing the picker state.
  const importInline = async (article: RawArticle, categorySlug: string) => {
    if (!article.link) return;
    const link = article.link;
    setInlineImporting((prev) => new Set(prev).add(link));
    setError("");
    try {
      const res = await fetch("/api/auto-fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articles: [{ ...article, categorySlug }], forceReimport }),
      });
      const data = await res.json().catch(() => ({}));
      const published = data?.results?.[0]?.published || 0;
      if (!res.ok || published === 0) {
        setError(data?.results?.[0]?.error || data?.error || `Import failed for "${article.title?.slice(0, 60)}…"`);
      } else {
        // Mark this row's alreadyImported = true so the UI flips to the
        // imported state without re-fetching the preview.
        setBuckets((prev) => prev.map((b) => ({
          ...b,
          results: b.results.map((a) => (a.link === link ? { ...a, alreadyImported: true } : a)),
        })));
        // Drop from pickedLinks since it's now imported (and dim-state
        // pre-uncheck rule).
        setPickedLinks((prev) => {
          const next = new Set(prev);
          next.delete(link);
          return next;
        });
      }
    } catch (e: any) {
      setError(e.message || "Import failed");
    }
    setInlineImporting((prev) => {
      const next = new Set(prev);
      next.delete(link);
      return next;
    });
  };

  if (!open) return null;

  const reset = () => {
    setStep("pick-cats");
    setBuckets([]);
    setPickedLinks(new Set());
    setPerCategory([]);
    setError("");
    setProgress("");
  };

  const toggleCat = (slug: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      return next;
    });
  };
  const selectGroup = (slugs: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of slugs) on ? next.add(s) : next.delete(s);
      return next;
    });
  };

  // --- Step 1 -> 2: preview ---
  const runPreview = async () => {
    if (selected.size === 0) { setError("Pick at least one category."); return; }
    setRunning(true);
    setError("");
    setBuckets([]);
    setProgress(`Fetching news for ${selected.size} categor${selected.size === 1 ? "y" : "ies"} (no DB writes yet)…`);

    const list = [...selected];
    const acc: PreviewBucket[] = [];
    for (let i = 0; i < list.length; i++) {
      const cat = list[i];
      setProgress(`Previewing ${i + 1} / ${list.length}: ${cat}`);
      try {
        const res = await fetch("/api/auto-fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "preview", categories: [cat] }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          acc.push({ category: cat, results: [], error: data?.error || `HTTP ${res.status}` });
        } else {
          const bucket = (data.preview || [])[0];
          acc.push(bucket || { category: cat, results: [] });
        }
      } catch (e: any) {
        acc.push({ category: cat, results: [], error: e.message || "fetch error" });
      }
      setBuckets([...acc]);
    }
    setRunning(false);
    setProgress("");

    // Default: every NOT-already-imported article is pre-checked. User
    // unchecks the ones they don't want.
    const initial = new Set<string>();
    for (const b of acc) for (const a of b.results) {
      if (a.link && !a.alreadyImported) initial.add(a.link);
    }
    setPickedLinks(initial);
    setStep("pick-articles");
  };

  // --- Step 2 -> 3: import the curated picks ---
  const runImport = async () => {
    if (pickedLinks.size === 0) { setError("No articles selected."); return; }
    setRunning(true);
    setError("");
    setProgress(`Importing ${pickedLinks.size} article${pickedLinks.size === 1 ? "" : "s"} — AI translate ~1-2s each, hold tight…`);

    // Group selected articles by category and POST one category at a time so
    // each request stays under the proxy timeout.
    const grouped = new Map<string, Array<RawArticle & { categorySlug: string }>>();
    for (const b of buckets) {
      for (const a of b.results) {
        if (a.link && pickedLinks.has(a.link)) {
          if (!grouped.has(b.category)) grouped.set(b.category, []);
          grouped.get(b.category)!.push({ ...a, categorySlug: b.category });
        }
      }
    }

    const acc: ImportResult[] = [];
    let total = 0;
    let idx = 0;
    const totalGroups = grouped.size;
    for (const [cat, articles] of grouped) {
      idx++;
      setProgress(`Importing ${idx} / ${totalGroups}: ${cat} (${articles.length} article${articles.length === 1 ? "" : "s"})`);
      try {
        const res = await fetch("/api/auto-fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ articles, forceReimport }),
        });
        const text = await res.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch { /* nginx HTML error */ }
        if (!res.ok || !data) {
          acc.push({ cat, fetched: articles.length, published: 0, error: data?.error || `HTTP ${res.status} (proxy timeout?)` });
        } else {
          const row = data.results?.[0];
          acc.push({ cat, fetched: row?.fetched ?? articles.length, published: row?.published ?? 0, error: row?.error });
          total += data.totalPublished || 0;
        }
      } catch (e: any) {
        acc.push({ cat, fetched: articles.length, published: 0, error: e.message || "network error" });
      }
      setPerCategory([...acc]);
    }
    setRunning(false);
    setProgress(`Done. Imported ${total} article${total === 1 ? "" : "s"}.`);
    setStep("results");
    if (total > 0 && !acc.some((r) => r.error)) {
      // Don't auto-close — user wants to see the breakdown.
      onDone(total);
    }
  };

  const allTopicSlugs = topics.map((t) => t.slug);
  const allDistrictSlugs = districts.map((d) => d.slug);
  const topicAllOn = allTopicSlugs.length > 0 && allTopicSlugs.every((s) => selected.has(s));
  const districtAllOn = allDistrictSlugs.length > 0 && allDistrictSlugs.every((s) => selected.has(s));

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 10, width: "min(920px, 95vw)", maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111", flex: 1 }}>
            Auto-fetch news{" "}
            <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>
              · Step {step === "pick-cats" ? 1 : step === "pick-articles" ? 2 : 3} of 3
            </span>
          </h2>
          <button onClick={() => { reset(); onClose(); }} disabled={running}
            style={{ background: "transparent", border: "none", fontSize: 22, cursor: running ? "not-allowed" : "pointer", color: "#6b7280" }}>×</button>
        </div>

        <div style={{ padding: 16, overflow: "auto", flex: 1 }}>
          {step === "pick-cats" && (
            <>
              <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 14 }}>
                Pick categories. Next step shows individual NewsData hits and
                lets you check which ones to import. Articles land as <b>DRAFT</b>.
              </p>
              {!optsLoaded && <p style={{ fontSize: 13, color: "#6b7280", padding: 12 }}>Loading categories…</p>}
              {optsLoaded && (
                <>
                  <Section title={`Topics (${topics.length})`} allOn={topicAllOn} onToggleAll={(on) => selectGroup(allTopicSlugs, on)} disabled={running}>
                    {topics.length === 0 && <p style={{ fontSize: 12, color: "#9ca3af" }}>No categories in DB yet.</p>}
                    {topics.map((t) => (
                      <Check key={t.slug} label={t.label} on={selected.has(t.slug)} onClick={() => toggleCat(t.slug)} disabled={running} />
                    ))}
                  </Section>
                  <Section title={`Districts (${districts.length})`} allOn={districtAllOn} onToggleAll={(on) => selectGroup(allDistrictSlugs, on)} disabled={running}>
                    {districts.length === 0 && <p style={{ fontSize: 12, color: "#9ca3af" }}>No districts in DB yet.</p>}
                    {districts.map((d) => (
                      <Check key={d.slug} label={d.label} on={selected.has(d.slug)} onClick={() => toggleCat(d.slug)} disabled={running} />
                    ))}
                  </Section>
                </>
              )}
            </>
          )}

          {step === "pick-articles" && (
            <>
              <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
                {buckets.reduce((s, b) => s + b.results.length, 0)} article{buckets.reduce((s, b) => s + b.results.length, 0) === 1 ? "" : "s"} found.
                Already-imported rows are unchecked + dimmed. Tick the ones you want — only checked rows are translated + imported.
              </p>
              {buckets.map((b) => (
                <div key={b.category} style={{ marginBottom: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <h3 style={{ fontSize: 12, fontWeight: 700, color: "#111", textTransform: "uppercase", letterSpacing: 0.4 }}>
                      {b.category} {b.error && <span style={{ color: "#dc2626", marginLeft: 6 }}>· {b.error}</span>}
                    </h3>
                    {b.results.length > 0 && (
                      <button
                        onClick={() => {
                          const allLinks = b.results.map((a) => a.link).filter(Boolean) as string[];
                          const allOn = allLinks.every((l) => pickedLinks.has(l));
                          setPickedLinks((prev) => {
                            const next = new Set(prev);
                            for (const l of allLinks) allOn ? next.delete(l) : next.add(l);
                            return next;
                          });
                        }}
                        style={{ fontSize: 11, color: "#3b82f6", background: "transparent", border: "none", cursor: "pointer", fontWeight: 600 }}>
                        Toggle all in this category
                      </button>
                    )}
                  </div>
                  {b.results.length === 0 && !b.error && (
                    <p style={{ fontSize: 12, color: "#9ca3af", padding: 6 }}>No results.</p>
                  )}
                  <div style={{ display: "grid", gap: 6 }}>
                    {b.results.map((a) => {
                      const link = a.link || "";
                      const picked = link && pickedLinks.has(link);
                      // When force-reimport is ON, already-imported rows
                      // become re-pickable (server will purge + recreate).
                      // dim = visually-greyed; locked = cannot be ticked.
                      const dim = a.alreadyImported;
                      const locked = dim && !forceReimport;
                      const importingNow = link && inlineImporting.has(link);
                      return (
                        <div key={link || a.article_id}
                          style={{
                            display: "grid", gridTemplateColumns: "24px 64px 1fr auto",
                            gap: 10, alignItems: "center", padding: "6px 8px",
                            background: dim ? "#f3f4f6" : picked ? "#eff6ff" : "#fff",
                            border: `1px solid ${picked ? "#93c5fd" : "#e5e7eb"}`,
                            borderRadius: 6, opacity: dim ? 0.7 : 1,
                          }}>
                          <input type="checkbox" checked={!!picked} disabled={locked || !link}
                            onChange={() => {
                              if (!link) return;
                              setPickedLinks((prev) => {
                                const next = new Set(prev);
                                next.has(link) ? next.delete(link) : next.add(link);
                                return next;
                              });
                            }}
                            style={{ cursor: locked || !link ? "not-allowed" : "pointer" }} />
                          {a.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.image_url} alt="" style={{ width: 64, height: 40, objectFit: "cover", borderRadius: 4 }} />
                          ) : (
                            <div style={{ width: 64, height: 40, background: "#e5e7eb", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#9ca3af" }}>no img</div>
                          )}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: "#111", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {a.title}{dim && <span style={{ color: "#dc2626", marginLeft: 6, fontSize: 10, fontWeight: 700 }}>· ALREADY IMPORTED</span>}
                            </div>
                            <div style={{ fontSize: 10, color: "#6b7280" }}>
                              {a.source_id} {a.pubDate && `· ${new Date(a.pubDate).toLocaleString()}`}
                            </div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "stretch", minWidth: 100 }}>
                            {link && (
                              <a
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Open original source in a new tab — read before importing"
                                style={{ fontSize: 11, color: "#2563eb", textDecoration: "none", padding: "3px 8px", border: "1px solid #bfdbfe", borderRadius: 4, textAlign: "center", fontWeight: 600, background: "#eff6ff" }}>
                                Source ↗
                              </a>
                            )}
                            {link && (!dim || forceReimport) && (
                              <button
                                onClick={() => importInline(a, b.category)}
                                disabled={importingNow || running}
                                style={{ fontSize: 11, padding: "3px 8px", background: importingNow ? "#6b7280" : (dim ? "#ea580c" : "#16a34a"), color: "#fff", border: "none", borderRadius: 4, cursor: importingNow || running ? "not-allowed" : "pointer", fontWeight: 700, opacity: running ? 0.5 : 1 }}
                                title={dim ? "Will purge the existing row + create a fresh import" : "Import as draft"}>
                                {importingNow ? "Importing…" : dim ? "Re-import" : "Import"}
                              </button>
                            )}
                            {dim && !forceReimport && <span style={{ fontSize: 10, color: "#16a34a", fontWeight: 700, textAlign: "center" }}>✓ Imported</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}

          {step === "results" && (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ background: "#f9fafb", padding: "6px 12px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4, display: "grid", gridTemplateColumns: "1fr 80px 90px 1fr", gap: 8 }}>
                <span>Category</span><span style={{ textAlign: "right" }}>Tried</span><span style={{ textAlign: "right" }}>Imported</span><span>Reason</span>
              </div>
              {perCategory.map((r) => {
                const skipped = r.fetched > 0 && r.published === 0;
                return (
                  <div key={r.cat} style={{ padding: "6px 12px", fontSize: 12, color: "#111", display: "grid", gridTemplateColumns: "1fr 80px 90px 1fr", gap: 8, borderTop: "1px solid #f3f4f6", background: r.error ? "#fef2f2" : skipped ? "#fef3c7" : "#fff" }}>
                    <span style={{ fontFamily: "monospace" }}>{r.cat}</span>
                    <span style={{ textAlign: "right" }}>{r.fetched}</span>
                    <span style={{ textAlign: "right", fontWeight: 700, color: r.published > 0 ? "#16a34a" : "#6b7280" }}>{r.published}</span>
                    <span style={{ fontSize: 11, color: "#6b7280" }}>
                      {r.error ? r.error : skipped ? "all skipped (dedup, content too short, or source error)" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {progress && (
            <div style={{ background: "#eef2ff", border: "1px solid #c7d2fe", color: "#3730a3", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginTop: 12 }}>
              {progress}
            </div>
          )}
          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginTop: 12 }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ padding: "12px 16px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            {step === "pick-cats" && <span style={{ fontSize: 12, color: "#6b7280" }}>{selected.size} selected</span>}
            {step === "pick-articles" && <span style={{ fontSize: 12, color: "#6b7280" }}>{pickedLinks.size} article{pickedLinks.size === 1 ? "" : "s"} ticked</span>}
            {step === "pick-articles" && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151", cursor: running ? "not-allowed" : "pointer", fontWeight: 600 }}>
                <input type="checkbox" checked={forceReimport} onChange={(e) => setForceReimport(e.target.checked)} disabled={running} />
                Force re-import (purge existing rows with same URL)
              </label>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {step === "pick-articles" && (
              <button onClick={() => setStep("pick-cats")} disabled={running}
                style={{ padding: "8px 16px", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: running ? "not-allowed" : "pointer" }}>
                ← Back
              </button>
            )}
            <button onClick={() => { reset(); onClose(); }} disabled={running}
              style={{ padding: "8px 16px", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: running ? "not-allowed" : "pointer" }}>
              {step === "results" ? "Close" : "Cancel"}
            </button>
            {step === "pick-cats" && (
              <button onClick={runPreview} disabled={running || selected.size === 0}
                style={{ padding: "8px 18px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: running || selected.size === 0 ? "not-allowed" : "pointer", opacity: running || selected.size === 0 ? 0.6 : 1 }}>
                {running ? "Loading…" : `Preview articles (${selected.size})`}
              </button>
            )}
            {step === "pick-articles" && (
              <button onClick={runImport} disabled={running || pickedLinks.size === 0}
                style={{ padding: "8px 18px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: running || pickedLinks.size === 0 ? "not-allowed" : "pointer", opacity: running || pickedLinks.size === 0 ? 0.6 : 1 }}>
                {running ? "Importing…" : `Import ${pickedLinks.size} selected`}
              </button>
            )}
            {step === "results" && (
              <button onClick={reset}
                style={{ padding: "8px 18px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Run another
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, allOn, onToggleAll, disabled, children }: { title: string; allOn: boolean; onToggleAll: (on: boolean) => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>{title}</h3>
        <button onClick={() => onToggleAll(!allOn)} disabled={disabled}
          style={{ fontSize: 11, color: "#3b82f6", background: "transparent", border: "none", cursor: disabled ? "not-allowed" : "pointer", fontWeight: 600 }}>
          {allOn ? "Clear all" : "Select all"}
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

function Check({ label, on, onClick, disabled }: { label: string; on: boolean; onClick: () => void; disabled: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "6px 10px",
        background: on ? "#eff6ff" : "#fff",
        color: on ? "#1e40af" : "#374151",
        border: `1px solid ${on ? "#93c5fd" : "#e5e7eb"}`,
        borderRadius: 6, fontSize: 12, fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        textAlign: "left",
      }}>
      <span style={{ width: 14, textAlign: "center" }}>{on ? "✓" : ""}</span>
      {label}
    </button>
  );
}
