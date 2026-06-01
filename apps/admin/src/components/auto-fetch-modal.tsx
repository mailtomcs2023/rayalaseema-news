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

import { SquareArrowOutUpRight } from "lucide-react";
import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WithTooltip } from "@/components/ui/tooltip";

// Topics + Districts are loaded from the DB (Category + District tables) when
// the modal opens - no hardcoded list. Admin edits to /categories or
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
  nextPageCursor?: string;
  error?: string;
}

const FRESHNESS: Array<{ value: string; label: string; daysAgo: number | null }> = [
  { value: "all", label: "Any time", daysAgo: null },
  { value: "24h", label: "Last 24h", daysAgo: 1 },
  { value: "3d", label: "Last 3 days", daysAgo: 3 },
  { value: "7d", label: "Last week", daysAgo: 7 },
  { value: "30d", label: "Last month", daysAgo: 30 },
];

function daysAgoToISO(daysAgo: number | null): string | undefined {
  if (daysAgo == null) return undefined;
  return new Date(Date.now() - daysAgo * 86400_000).toISOString().slice(0, 10);
}

interface ImportResult {
  cat: string;
  fetched: number;
  published: number;
  // Count of rows the Azure content filter refused to translate
  // (typically news containing violence / crime / sensitive content).
  blocked?: number;
  error?: string;
}

export function AutoFetchModal({ open, onClose, onDone }: Props) {
  const [step, setStep] = useState<"pick-cats" | "pick-articles" | "results">("pick-cats");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [forceReimport, setForceReimport] = useState(false);
  // Structured progress for the overlay. `done / total` drives a determinate
  // bar; `label` is the current operation. null = no overlay rendered.
  const [progressMeta, setProgressMeta] = useState<{ done: number; total: number; label: string } | null>(null);

  // Refine bar (step 2). Empty keyword = each category's default
  // NewsData query. domain = restrict to a publisher (e.g. "ndtv.com").
  const [keyword, setKeyword] = useState("");
  const [freshness, setFreshness] = useState("all");
  const [domain, setDomain] = useState("");
  const [loadingMore, setLoadingMore] = useState<string | null>(null);

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
  // Articles are keyed by their `link` (sourceUrl) - the only globally-unique
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
    const titleSnippet = (article.title || "article").slice(0, 60);
    setInlineImporting((prev) => new Set(prev).add(link));
    // Surface the same determinate overlay used for bulk imports so a single-
    // row import doesn't look stuck. total=1 → bar sits at 0% until the
    // request resolves, then we tick to 1/1 just before clearing.
    setProgressMeta({ done: 0, total: 1, label: `Translating + importing "${titleSnippet}…"` });
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
    setProgressMeta(null);
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

  // Refinement params sent to /api/auto-fetch preview. Shared by initial
  // run, refine-rerun, and load-more so all three behave consistently.
  const buildRefine = () => {
    const f = FRESHNESS.find((x) => x.value === freshness);
    return {
      keywordOverride: keyword.trim() || undefined,
      fromDate: daysAgoToISO(f?.daysAgo ?? null),
      domain: domain.trim() || undefined,
    };
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
    const refine = buildRefine();
    setProgressMeta({ done: 0, total: list.length, label: "Fetching from NewsData.io…" });
    for (let i = 0; i < list.length; i++) {
      const cat = list[i];
      setProgress(`Previewing ${i + 1} / ${list.length}: ${cat}`);
      // Label what's currently in flight; `done` still reflects how many
      // categories have actually finished so the bar doesn't lie.
      setProgressMeta({ done: i, total: list.length, label: `Previewing ${cat}…` });
      try {
        const res = await fetch("/api/auto-fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "preview", categories: [cat], ...refine }),
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
      // Increment AFTER the work completes so the bar advances on done,
      // not on dispatched.
      setProgressMeta({ done: i + 1, total: list.length, label: `Fetched ${cat}` });
    }
    // Hold 100% for a beat so the user sees the bar fill before it disappears.
    await new Promise((r) => setTimeout(r, 300));
    setRunning(false);
    setProgress("");
    setProgressMeta(null);

    // Default: every NOT-already-imported article is pre-checked. User
    // unchecks the ones they don't want.
    const initial = new Set<string>();
    for (const b of acc) for (const a of b.results) {
      if (a.link && !a.alreadyImported) initial.add(a.link);
    }
    setPickedLinks(initial);
    setStep("pick-articles");
  };

  // Step 2 in-place refine: re-runs the same selected categories with
  // current keyword / freshness / domain, replacing existing buckets.
  const refinePreview = async () => {
    if (selected.size === 0) return;
    setRunning(true);
    setError("");
    const list = [...selected];
    const acc: PreviewBucket[] = [];
    const refine = buildRefine();
    setProgress(`Refining ${list.length} categor${list.length === 1 ? "y" : "ies"}…`);
    setProgressMeta({ done: 0, total: list.length, label: "Refining results…" });
    for (let i = 0; i < list.length; i++) {
      const cat = list[i];
      setProgressMeta({ done: i, total: list.length, label: `Refining ${cat}` });
      try {
        const res = await fetch("/api/auto-fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "preview", categories: [cat], ...refine }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) acc.push({ category: cat, results: [], error: data?.error || `HTTP ${res.status}` });
        else acc.push((data.preview || [])[0] || { category: cat, results: [] });
      } catch (e: any) {
        acc.push({ category: cat, results: [], error: e.message || "fetch error" });
      }
      setBuckets([...acc]);
    }
    const initial = new Set<string>();
    for (const b of acc) for (const a of b.results) {
      if (a.link && !a.alreadyImported) initial.add(a.link);
    }
    setPickedLinks(initial);
    setRunning(false);
    setProgress("");
    setProgressMeta(null);
  };

  // Step 2 per-category Load More: fetch next NewsData page for ONE
  // category and append to its bucket. Uses the stored cursor.
  const loadMore = async (category: string) => {
    const bucket = buckets.find((b) => b.category === category);
    if (!bucket?.nextPageCursor || loadingMore) return;
    setLoadingMore(category);
    setError("");
    const refine = buildRefine();
    try {
      const res = await fetch("/api/auto-fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          categories: [category],
          cursors: { [category]: bucket.nextPageCursor },
          ...refine,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || `Load more failed (${res.status})`);
        setLoadingMore(null);
        return;
      }
      const more: PreviewBucket = (data.preview || [])[0] || { category, results: [] };
      setBuckets((prev) => prev.map((b) =>
        b.category === category
          ? { ...b, results: [...b.results, ...more.results], nextPageCursor: more.nextPageCursor }
          : b,
      ));
      setPickedLinks((prev) => {
        const next = new Set(prev);
        for (const a of more.results) if (a.link && !a.alreadyImported) next.add(a.link);
        return next;
      });
    } catch (e: any) {
      setError(e.message || "Load more failed");
    }
    setLoadingMore(null);
  };

  // --- Step 2 -> 3: import the curated picks ---
  const runImport = async () => {
    if (pickedLinks.size === 0) { setError("No articles selected."); return; }
    setRunning(true);
    setError("");

    // One-article-per-POST loop. Pipeline runs ~8s per article (extract +
    // compose + fact-check); batching multiple articles into one request
    // blew past the proxy timeout when a category had 5+ articles. Single-
    // article requests stay safely under proxy limit + give live progress.
    const all: Array<RawArticle & { categorySlug: string }> = [];
    const articlesByCategory: Record<string, number> = {};
    for (const b of buckets) {
      for (const a of b.results) {
        if (a.link && pickedLinks.has(a.link)) {
          all.push({ ...a, categorySlug: b.category });
          articlesByCategory[b.category] = (articlesByCategory[b.category] || 0) + 1;
        }
      }
    }

    // Tally per category for the results table.
    const catStats = new Map<string, { fetched: number; published: number; errors: string[] }>();
    for (const cat of Object.keys(articlesByCategory)) {
      catStats.set(cat, { fetched: articlesByCategory[cat], published: 0, errors: [] });
    }

    let total = 0;
    for (let i = 0; i < all.length; i++) {
      const a = all[i];
      setProgress(`Importing ${i + 1} / ${all.length}: ${a.title?.slice(0, 60)}…`);
      try {
        const res = await fetch("/api/auto-fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ articles: [a], forceReimport }),
        });
        const text = await res.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch { /* nginx HTML page */ }
        const stats = catStats.get(a.categorySlug)!;
        if (!res.ok || !data) {
          stats.errors.push(data?.error || `HTTP ${res.status} (proxy timeout?)`);
        } else {
          const published = data.totalPublished || 0;
          stats.published += published;
          total += published;
          // Mark this row imported in-place so the article picker reflects
          // it if the user clicks Back.
          if (a.link) {
            const link = a.link;
            setBuckets((prev) => prev.map((b) => ({
              ...b,
              results: b.results.map((r) => (r.link === link ? { ...r, alreadyImported: true } : r)),
            })));
          }
        }
        // Flush a partial results view so the user can watch progress.
        setPerCategory([...catStats.entries()].map(([cat, s]) => ({
          cat, fetched: s.fetched, published: s.published,
          error: s.errors.length ? s.errors.slice(0, 2).join(" · ") : undefined,
        })));
      } catch (e: any) {
        const stats = catStats.get(a.categorySlug)!;
        stats.errors.push(e.message || "network error");
      }
    }

    const finalRows: ImportResult[] = [...catStats.entries()].map(([cat, s]) => ({
      cat, fetched: s.fetched, published: s.published,
      error: s.errors.length ? s.errors.slice(0, 2).join(" · ") : undefined,
    }));
    setPerCategory(finalRows);
    setRunning(false);
    setProgress(`Done. Imported ${total} of ${all.length} article${all.length === 1 ? "" : "s"}.`);
    setStep("results");
    if (total > 0 && !finalRows.some((r) => r.error)) {
      onDone(total);
    }
  };

  const allTopicSlugs = topics.map((t) => t.slug);
  const allDistrictSlugs = districts.map((d) => d.slug);
  const topicAllOn = allTopicSlugs.length > 0 && allTopicSlugs.every((s) => selected.has(s));
  const districtAllOn = allDistrictSlugs.length > 0 && allDistrictSlugs.every((s) => selected.has(s));

  return (
    <div
      // Backdrop is intentionally *not* clickable to close - the modal can
      // contain in-flight network operations (preview + AI translate +
      // import) and an accidental outside-click would lose that work. Use
      // the × button in the header to dismiss.
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div
        style={{ position: "relative", background: "#fff", borderRadius: 10, width: "min(920px, 95vw)", height: "min(720px, 92vh)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111", margin: 0, whiteSpace: "nowrap" }}>
            Auto-fetch news
          </h2>
          <Stepper
            current={step}
            canGoArticles={buckets.length > 0}
            canGoResults={perCategory.length > 0}
            disabled={running}
            onGo={(s) => setStep(s)}
          />
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
              {!optsLoaded && (
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  gap: 10, padding: 40, minHeight: 320, color: "#6b7280",
                }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: "50%",
                    border: "2px solid #e5e7eb", borderTopColor: "#16a34a",
                    animation: "afm-spin 0.7s linear infinite",
                  }} />
                  <span style={{ fontSize: 13 }}>Loading categories…</span>
                  <style>{`@keyframes afm-spin{to{transform:rotate(360deg)}}`}</style>
                </div>
              )}
              {optsLoaded && (
                <>
                  <Section
                    title="Topics"
                    total={topics.length}
                    selectedCount={topics.filter((t) => selected.has(t.slug)).length}
                    onToggleAll={(on) => selectGroup(allTopicSlugs, on)}
                    disabled={running}
                  >
                    {topics.length === 0 && <p style={{ fontSize: 12, color: "#9ca3af" }}>No categories in DB yet.</p>}
                    {topics.map((t) => (
                      <Check key={t.slug} label={t.label} on={selected.has(t.slug)} onClick={() => toggleCat(t.slug)} disabled={running} />
                    ))}
                  </Section>
                  <Section
                    title="Districts"
                    total={districts.length}
                    selectedCount={districts.filter((d) => selected.has(d.slug)).length}
                    onToggleAll={(on) => selectGroup(allDistrictSlugs, on)}
                    disabled={running}
                  >
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
              {/* Refine bar - keyword overrides per-category default query;
                  freshness sets from_date; domain restricts to one publisher
                  (e.g. ndtv.com). All optional. */}
              {/* Sticky: pinned to the top of the scroll body so the refine
                  controls stay accessible as the article list scrolls.
                  -top-4 (top:-16px) pins it at the parent's border edge
                  rather than its padding edge - without that offset, the
                  pinned bar sits 16px below the modal header and scrolled
                  cards peek through the gap. -mx-4/-mt-4 + px-4 py-3 lets
                  it bleed into the body's 16px padding so the bar visually
                  spans the full modal width when at rest too. */}
              <div className="shadcn-scope sticky -top-4 z-30 -mx-4 -mt-4 mb-3 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-slate-50/85">
                <Input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !running) refinePreview(); }}
                  placeholder="Keyword (overrides default, e.g. KTR water)"
                  className="h-9 flex-[2_1_240px] min-w-0 text-xs"
                  disabled={running}
                />
                <Select value={freshness} onValueChange={setFreshness} disabled={running}>
                  <SelectTrigger className="h-9 w-[140px] text-xs" title="Filter by article freshness">
                    <SelectValue />
                  </SelectTrigger>
                  {/* z-[1100] beats the modal backdrop (zIndex:1000) - without
                      it the portaled dropdown renders behind the backdrop and
                      clicks pass through to the eat-click div. */}
                  <SelectContent className="z-[1100]">
                    {FRESHNESS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !running) refinePreview(); }}
                  placeholder="Source domain (e.g. ndtv.com)"
                  className="h-9 flex-[1_1_180px] min-w-0 text-xs"
                  disabled={running}
                />
                <Button onClick={refinePreview} disabled={running} size="sm" className="h-9">
                  Refresh
                </Button>
                <Button
                  onClick={() => { setKeyword(""); setFreshness("all"); setDomain(""); }}
                  disabled={running}
                  size="sm"
                  variant="outline"
                  className="h-9"
                >
                  Reset
                </Button>
              </div>

              <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
                {buckets.reduce((s, b) => s + b.results.length, 0)} article{buckets.reduce((s, b) => s + b.results.length, 0) === 1 ? "" : "s"} found.
                Already-imported rows are unchecked + dimmed. Tick the ones you want - only checked rows are translated + imported.
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
                        style={{ fontSize: 11, color: "#16a34a", background: "transparent", border: "none", cursor: "pointer", fontWeight: 600 }}>
                        Toggle all in this category
                      </button>
                    )}
                  </div>
                  {b.results.length === 0 && !b.error && (
                    <div style={{
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      gap: 8, padding: "20px 16px",
                      background: "#fafafa",
                      border: "1px dashed #d1d5db",
                      borderRadius: 8,
                    }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: "50%",
                        background: "#f3f4f6",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#9ca3af",
                      }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          <line x1="8" y1="11" x2="14" y2="11" />
                        </svg>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
                        No articles found
                      </div>
                      <div style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", maxWidth: 320 }}>
                        Try a different keyword, widen the time window, or remove the source domain filter.
                      </div>
                    </div>
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
                      const toggle = () => {
                        if (locked || !link) return;
                        setPickedLinks((prev) => {
                          const next = new Set(prev);
                          next.has(link) ? next.delete(link) : next.add(link);
                          return next;
                        });
                      };
                      return (
                        <div key={link || a.article_id}
                          role="button"
                          tabIndex={locked || !link ? -1 : 0}
                          aria-pressed={!!picked}
                          aria-disabled={locked || !link}
                          onClick={toggle}
                          onKeyDown={(e) => {
                            if (e.key === " " || e.key === "Enter") {
                              e.preventDefault();
                              toggle();
                            }
                          }}
                          style={{
                            position: "relative",
                            display: "grid", gridTemplateColumns: "84px 1fr auto",
                            gap: 12, alignItems: "center", padding: 10,
                            background: dim ? "#f3f4f6" : picked ? "#f0fdf4" : "#fff",
                            border: `1px solid ${picked ? "#16a34a" : "#e5e7eb"}`,
                            borderRadius: 8, opacity: dim ? 0.75 : 1,
                            cursor: locked || !link ? "default" : "pointer",
                            transition: "background 120ms ease, border-color 120ms ease",
                            outline: "none",
                          }}>
                          {/* Picked badge - anchored inside the card's
                              top-left corner. Sits on top of the image with
                              a small inset so it doesn't touch the border. */}
                          {picked && !locked && (
                            <div style={{
                              position: "absolute", top: 0, left: 0,
                              width: 22, height: 22,
                              minWidth: 22, minHeight: 22,
                              boxSizing: "border-box",
                              // Top-left corner matches the card's outer
                              // radius so the badge nests flush; other
                              // corners stay rounded to read as a checkbox.
                              borderTopLeftRadius: 7,
                              borderTopRightRadius: 0,
                              borderBottomLeftRadius: 0,
                              borderBottomRightRadius: 6,
                              background: "#16a34a", color: "#fff",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              flexShrink: 0,
                              boxShadow: "1px 1px 3px rgba(0, 0, 0, 0.25)",
                              pointerEvents: "none",
                              zIndex: 1,
                            }}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </div>
                          )}
                          {/* Image cell - relative positioned so the picked
                              state can stack a soft blue tint overlay. */}
                          <div style={{ position: "relative", width: 84, height: 56 }}>
                            {a.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={a.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 6, display: "block" }} />
                            ) : (
                              <div style={{ width: "100%", height: "100%", background: "#e5e7eb", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#9ca3af" }}>no img</div>
                            )}
                            {picked && !locked && (
                              <div style={{
                                position: "absolute", inset: 0,
                                background: "rgba(22, 163, 74, 0.18)",
                                borderRadius: 6,
                                pointerEvents: "none",
                              }} />
                            )}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: "#111", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {a.title}{dim && <span style={{ color: "#dc2626", marginLeft: 6, fontSize: 10, fontWeight: 700 }}>· ALREADY IMPORTED</span>}
                            </div>
                            <div style={{ fontSize: 10, color: "#6b7280" }}>
                              {a.source_id} {a.pubDate && `· ${new Date(a.pubDate).toLocaleString()}`}
                            </div>
                          </div>
                          {/* Stop propagation so clicks on the action buttons
                              don't toggle the card's picked state. */}
                          <div
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                            style={{ display: "flex", flexDirection: "row", gap: 6, alignItems: "center" }}>
                            {link && (
                              <a
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Open original source in a new tab - read before importing"
                                style={{
                                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                                  fontSize: 11, fontWeight: 600,
                                  color: "#374151", textDecoration: "none",
                                  padding: "0 12px", height: 30,
                                  border: "1px solid #d1d5db", borderRadius: 6,
                                  background: "#fff",
                                }}>
                                <SquareArrowOutUpRight size={12} strokeWidth={2.5} aria-hidden />
                                Source
                              </a>
                            )}
                            {link && (!dim || forceReimport) && (
                              <button
                                onClick={() => importInline(a, b.category)}
                                disabled={importingNow || running}
                                style={{
                                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                                  fontSize: 11, fontWeight: 700,
                                  padding: "0 12px", height: 30,
                                  background: importingNow ? "#6b7280" : (dim ? "#ea580c" : "#16a34a"),
                                  color: "#fff", border: "none", borderRadius: 6,
                                  cursor: importingNow || running ? "not-allowed" : "pointer",
                                  opacity: running ? 0.5 : 1,
                                  boxShadow: importingNow ? "none" : "0 1px 2px rgba(15, 23, 42, 0.12)",
                                }}
                                title={dim ? "Will purge the existing row + create a fresh import" : "Import as draft"}>
                                {importingNow ? (
                                  <>
                                    <span style={{
                                      width: 8, height: 8, borderRadius: "50%",
                                      background: "#fff", opacity: 0.9,
                                      display: "inline-block",
                                    }} />
                                    Importing…
                                  </>
                                ) : (
                                  <>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                      {dim ? (
                                        <>
                                          <polyline points="23 4 23 10 17 10" />
                                          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                                        </>
                                      ) : (
                                        <>
                                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                          <polyline points="7 10 12 15 17 10" />
                                          <line x1="12" y1="15" x2="12" y2="3" />
                                        </>
                                      )}
                                    </svg>
                                    {dim ? "Re-import" : "Import"}
                                  </>
                                )}
                              </button>
                            )}
                            {dim && !forceReimport && (
                              <span style={{
                                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
                                fontSize: 11, color: "#15803d", fontWeight: 700,
                                padding: "0 12px", height: 30,
                                background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6,
                              }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                Imported
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {b.nextPageCursor && (
                    <div style={{ marginTop: 6, textAlign: "center" }}>
                      <button
                        onClick={() => loadMore(b.category)}
                        disabled={loadingMore !== null || running}
                        style={{ padding: "6px 14px", background: "#fff", color: "#16a34a", border: "1px dashed #86efac", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: loadingMore || running ? "not-allowed" : "pointer", opacity: loadingMore && loadingMore !== b.category ? 0.5 : 1 }}>
                        {loadingMore === b.category ? "Loading next 10…" : "Load next 10 from NewsData"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {step === "results" && (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ background: "#f9fafb", padding: "6px 12px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4, display: "grid", gridTemplateColumns: "1fr 70px 80px 70px 1fr", gap: 8 }}>
                <span>Category</span>
                <span style={{ textAlign: "right" }}>Tried</span>
                <span style={{ textAlign: "right" }}>Imported</span>
                <span style={{ textAlign: "right" }}>Blocked</span>
                <span>Reason</span>
              </div>
              {perCategory.map((r) => {
                const blocked = r.blocked || 0;
                const allBlocked = blocked > 0 && r.published === 0;
                const skipped = r.fetched > 0 && r.published === 0 && blocked === 0;
                // Row tinting: red for hard errors, orange for content-
                // filter blocks (user-actionable: tune Azure thresholds or
                // copy article manually), amber for silent skips.
                const bg = r.error && !blocked ? "#fef2f2"
                  : allBlocked ? "#fff7ed"
                  : skipped ? "#fef3c7"
                  : "#fff";
                return (
                  <div key={r.cat} style={{ padding: "6px 12px", fontSize: 12, color: "#111", display: "grid", gridTemplateColumns: "1fr 70px 80px 70px 1fr", gap: 8, borderTop: "1px solid #f3f4f6", background: bg }}>
                    <span style={{ fontFamily: "monospace" }}>{r.cat}</span>
                    <span style={{ textAlign: "right" }}>{r.fetched}</span>
                    <span style={{ textAlign: "right", fontWeight: 700, color: r.published > 0 ? "#16a34a" : "#6b7280" }}>{r.published}</span>
                    <span style={{ textAlign: "right", fontWeight: blocked > 0 ? 700 : 400, color: blocked > 0 ? "#ea580c" : "#9ca3af" }}>{blocked || "-"}</span>
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
            {step === "pick-articles" && (
              <WithTooltip
                side="top"
                text={"When OFF (default): rows whose source URL already\nexists in the DB are skipped during import.\n\nWhen ON: those rows are purged and re-created - use\nthis to refresh a previously-imported article with\nupdated content or a re-translated body.\n\nDestructive: the existing row's ID and edit history\nare lost."}
              >
                <label
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    fontSize: 12, color: "#374151", fontWeight: 600,
                    cursor: running ? "not-allowed" : "pointer",
                    userSelect: "none",
                    opacity: running ? 0.6 : 1,
                  }}>
                  <input
                    type="checkbox"
                    checked={forceReimport}
                    onChange={(e) => setForceReimport(e.target.checked)}
                    disabled={running}
                    style={{
                      width: 16, height: 16, margin: 0,
                      accentColor: "#16a34a",
                      cursor: running ? "not-allowed" : "pointer",
                      flexShrink: 0,
                    }}
                  />
                  Force re-import
                  <span style={{ color: "#9ca3af", fontWeight: 500 }}>· purge existing rows with same URL</span>
                </label>
              </WithTooltip>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
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
                style={{ padding: "8px 18px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Run another
              </button>
            )}
          </div>
        </div>

        {/* Full-panel loading overlay - appears during step transitions
            (preview / refine / import). Blocks the underlying UI to prevent
            duplicate submissions and surfaces a determinate progress bar
            built from the {done, total, label} state. */}
        {progressMeta && <LoadingOverlay meta={progressMeta} />}
      </div>
    </div>
  );
}

function LoadingOverlay({ meta }: { meta: { done: number; total: number; label: string } }) {
  const pct = meta.total > 0 ? Math.min(100, Math.round((meta.done / meta.total) * 100)) : 0;
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: "rgba(255, 255, 255, 0.94)",
      backdropFilter: "blur(2px)",
      WebkitBackdropFilter: "blur(2px)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 14, padding: 40, zIndex: 50,
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", textAlign: "center", maxWidth: 480 }}>
        {meta.label}
      </div>
      <div style={{
        width: "min(360px, 80%)", height: 10, background: "#e5e7eb",
        borderRadius: 999, overflow: "hidden",
        position: "relative",
      }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: "linear-gradient(90deg, #16a34a, #22c55e)",
          borderRadius: 999,
          transition: "width 250ms ease",
        }} />
        {/* Indeterminate-style shimmer that travels across the filled portion
            so the user can tell something is happening even while waiting on
            a single long step (e.g. AI translate within a category). */}
        {pct < 100 && (
          <div style={{
            position: "absolute", top: 0, left: 0, height: "100%", width: "30%",
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)",
            animation: "afm-shimmer 1.4s linear infinite",
          }} />
        )}
      </div>
      <div style={{
        fontSize: 13, fontWeight: 700, color: "#16a34a",
        fontVariantNumeric: "tabular-nums",
      }}>
        {pct}%
      </div>
      <div style={{ fontSize: 11, color: "#64748b", fontVariantNumeric: "tabular-nums" }}>
        {meta.done} of {meta.total} complete
      </div>
      <style>{`@keyframes afm-shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}`}</style>
    </div>
  );
}

type StepId = "pick-cats" | "pick-articles" | "results";

function Stepper({
  current, canGoArticles, canGoResults, disabled, onGo,
}: {
  current: StepId;
  canGoArticles: boolean;
  canGoResults: boolean;
  disabled: boolean;
  onGo: (s: StepId) => void;
}) {
  const order: StepId[] = ["pick-cats", "pick-articles", "results"];
  const labels: Record<StepId, string> = {
    "pick-cats": "Categories",
    "pick-articles": "Articles",
    "results": "Results",
  };
  const currentIdx = order.indexOf(current);
  const reachable = (s: StepId): boolean => {
    if (s === "pick-cats") return true;
    if (s === "pick-articles") return canGoArticles;
    return canGoResults;
  };

  return (
    <nav style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, justifyContent: "center" }}>
      {order.map((s, i) => {
        const idx = i + 1;
        const isCurrent = s === current;
        const isCompleted = i < currentIdx;
        const clickable = !disabled && !isCurrent && reachable(s);
        const dotBg = isCurrent ? "#16a34a" : isCompleted ? "#16a34a" : reachable(s) ? "#e5e7eb" : "#f3f4f6";
        const dotColor = isCurrent || isCompleted ? "#fff" : "#9ca3af";
        const labelColor = isCurrent ? "#0f172a" : isCompleted ? "#166534" : reachable(s) ? "#374151" : "#9ca3af";
        // Visual states (all three pills share the same footprint - same
        // minWidth + same border/bg model, just different colors):
        //   current   - soft mint pill (you are here, not navigable)
        //   completed - light-green pill with a *bright* #16a34a border (revisit affordance)
        //   locked    - soft gray pill, muted, not clickable
        const bg = isCurrent ? "#f0fdf4" : isCompleted ? "#f0fdf4" : "#f9fafb";
        const border = isCurrent
          ? "1px solid #bbf7d0"
          : isCompleted
            ? "1px solid #16a34a"
            : "1px solid #e5e7eb";
        const shadow = isCompleted ? "0 1px 2px rgba(22, 163, 74, 0.18)" : "none";
        const tooltip = isCurrent
          ? `Current step: ${labels[s]}`
          : isCompleted
            ? `✓ Completed - click to revisit ${labels[s]}`
            : reachable(s)
              ? `Go to ${labels[s]}`
              : `${labels[s]} - complete the previous step first`;
        return (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              type="button"
              onClick={() => clickable && onGo(s)}
              disabled={!clickable}
              title={tooltip}
              aria-label={tooltip}
              aria-current={isCurrent ? "step" : undefined}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "5px 12px 5px 5px",
                background: bg,
                border,
                borderRadius: 999,
                cursor: clickable ? "pointer" : isCurrent ? "default" : "not-allowed",
                fontFamily: "inherit",
                boxShadow: shadow,
                transition: "box-shadow 120ms ease, background 120ms ease",
              }}>
              <span style={{
                width: 20, height: 20, borderRadius: "50%",
                background: dotBg, color: dotColor,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, flexShrink: 0,
              }}>
                {isCompleted ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : idx}
              </span>
              <span style={{
                fontSize: 12, fontWeight: isCurrent || isCompleted ? 700 : 600,
                color: labelColor,
              }}>
                {labels[s]}
              </span>
            </button>
            {i < order.length - 1 && (
              <span style={{
                width: 18, height: 1,
                background: i < currentIdx ? "#16a34a" : "#e5e7eb",
              }} />
            )}
          </div>
        );
      })}
    </nav>
  );
}

function Section({
  title, total, selectedCount, onToggleAll, disabled, children,
}: {
  title: string;
  total: number;
  selectedCount: number;
  onToggleAll: (on: boolean) => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const allOn = total > 0 && selectedCount === total;
  return (
    <section style={{ marginBottom: 22 }}>
      <header style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid #f1f5f9",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: "#0f172a", textTransform: "uppercase", letterSpacing: 0.6, margin: 0 }}>
            {title}
          </h3>
          <span style={{
            fontSize: 11, color: selectedCount > 0 ? "#16a34a" : "#94a3b8",
            fontWeight: selectedCount > 0 ? 600 : 500,
            fontVariantNumeric: "tabular-nums",
          }}>
            {selectedCount} / {total}
          </span>
        </div>
        <button onClick={() => onToggleAll(!allOn)} disabled={disabled || total === 0}
          style={{
            fontSize: 11, color: "#16a34a", background: "transparent", border: "none",
            cursor: disabled || total === 0 ? "not-allowed" : "pointer",
            fontWeight: 600, padding: 0,
          }}>
          {allOn ? "Clear all" : "Select all"}
        </button>
      </header>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 8,
      }}>
        {children}
      </div>
    </section>
  );
}

function Check({ label, on, onClick, disabled }: { label: string; on: boolean; onClick: () => void; disabled: boolean }) {
  return (
    <label
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 14px",
        background: on ? "#f0fdf4" : "#fff",
        color: on ? "#14532d" : "#1f2937",
        border: `1px solid ${on ? "#16a34a" : "#e5e7eb"}`,
        borderRadius: 8, fontSize: 13, fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        userSelect: "none",
        opacity: disabled ? 0.5 : 1,
        boxShadow: on
          ? "0 1px 2px rgba(22, 163, 74, 0.08), 0 0 0 3px rgba(22, 163, 74, 0.12)"
          : "0 1px 2px rgba(15, 23, 42, 0.04)",
        transition: "box-shadow 120ms ease, border-color 120ms ease, background 120ms ease",
      }}>
      <input
        type="checkbox"
        checked={on}
        disabled={disabled}
        onChange={onClick}
        style={{
          width: 16, height: 16, margin: 0,
          accentColor: "#16a34a",
          cursor: disabled ? "not-allowed" : "pointer",
          flexShrink: 0,
        }}
      />
      <span style={{
        flex: 1, minWidth: 0,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {label}
      </span>
    </label>
  );
}
