// Auto-fetch picker modal. Lets the admin choose WHICH categories /
// districts to bulk-fetch instead of firing all 28 at once (the old single
// button). Keeps the API contract intact — POST /api/auto-fetch accepts
// { categories: string[] | null } where null means "all".
//
// Group A = topical categories. Group B = district-prefixed slugs. Both
// share one POST call so the server can stream results per group.
"use client";

import { useState } from "react";

const TOPICS: { slug: string; label: string }[] = [
  { slug: "politics", label: "Politics" },
  { slug: "crime", label: "Crime" },
  { slug: "sports", label: "Sports" },
  { slug: "business", label: "Business" },
  { slug: "entertainment", label: "Entertainment" },
  { slug: "education", label: "Education" },
  { slug: "agriculture", label: "Agriculture" },
  { slug: "national", label: "National" },
  { slug: "international", label: "International" },
  { slug: "technology", label: "Technology" },
  { slug: "health", label: "Health" },
  { slug: "devotional", label: "Devotional" },
  { slug: "jobs", label: "Jobs" },
  { slug: "movie-reviews", label: "Movie reviews" },
  { slug: "exam-results", label: "Exam results" },
  { slug: "nri", label: "NRI" },
  { slug: "navyaseema", label: "Navyaseema" },
  { slug: "real-estate", label: "Real estate" },
  { slug: "editorial", label: "Editorial" },
  { slug: "weather", label: "Weather" },
];

const DISTRICTS: { slug: string; label: string }[] = [
  { slug: "district-kurnool", label: "Kurnool" },
  { slug: "district-nandyal", label: "Nandyal" },
  { slug: "district-ananthapuramu", label: "Anantapur" },
  { slug: "district-kadapa", label: "Kadapa (YSR)" },
  { slug: "district-tirupati", label: "Tirupati" },
  { slug: "district-chittoor", label: "Chittoor" },
  { slug: "district-sri-sathya-sai", label: "Sri Sathya Sai" },
  { slug: "district-annamayya", label: "Annamayya" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: (totalPublished: number) => void;
}

export function AutoFetchModal({ open, onClose, onDone }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  if (!open) return null;

  const toggle = (slug: string) => {
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

  const run = async () => {
    if (selected.size === 0) { setError("Pick at least one category."); return; }
    setRunning(true);
    setError("");

    // Client-side per-category loop. Running all 8+ categories in one server
    // request blew past the proxy timeout — the response came back as the
    // nginx HTML error page ("Unexpected token '<' …"). Looping client-side
    // keeps each request under ~15s and surfaces per-category progress.
    const list = [...selected];
    let total = 0;
    const errors: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const cat = list[i];
      setProgress(`Fetching ${i + 1} / ${list.length}: ${cat} — running AI translate…`);
      try {
        const res = await fetch("/api/auto-fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categories: [cat] }),
        });
        const text = await res.text();
        let data: any = null;
        try { data = JSON.parse(text); } catch { /* HTML error page */ }
        if (!res.ok || !data) {
          errors.push(`${cat}: ${data?.error || `HTTP ${res.status} (proxy timeout?)`}`);
          continue;
        }
        total += data.totalPublished || 0;
      } catch (e: any) {
        errors.push(`${cat}: ${e.message || "network error"}`);
      }
    }

    setRunning(false);
    if (errors.length) {
      setError(`Completed with ${errors.length} error${errors.length === 1 ? "" : "s"}: ${errors.slice(0, 3).join(" · ")}${errors.length > 3 ? ` …+${errors.length - 3} more` : ""}`);
      setProgress(`Imported ${total} article${total === 1 ? "" : "s"} from ${list.length - errors.length} / ${list.length} categories.`);
      return;
    }
    onDone(total);
    onClose();
  };

  const allTopicSlugs = TOPICS.map((t) => t.slug);
  const allDistrictSlugs = DISTRICTS.map((d) => d.slug);
  const topicAllOn = allTopicSlugs.every((s) => selected.has(s));
  const districtAllOn = allDistrictSlugs.every((s) => selected.has(s));

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 10, width: "min(720px, 95vw)", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111", flex: 1 }}>Auto-fetch news</h2>
          <button onClick={onClose} disabled={running} style={{ background: "transparent", border: "none", fontSize: 22, cursor: running ? "not-allowed" : "pointer", color: "#6b7280" }}>×</button>
        </div>

        <div style={{ padding: 16, overflow: "auto", flex: 1 }}>
          <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 14 }}>
            Each pick = 1 NewsData.io API call + ~5 AI translations. Articles
            land as <b>DRAFT</b> (not auto-published) so editors can review.
          </p>

          <Section title="Topics" allOn={topicAllOn} onToggleAll={(on) => selectGroup(allTopicSlugs, on)} disabled={running}>
            {TOPICS.map((t) => (
              <Check key={t.slug} label={t.label} on={selected.has(t.slug)} onClick={() => toggle(t.slug)} disabled={running} />
            ))}
          </Section>

          <Section title="Districts" allOn={districtAllOn} onToggleAll={(on) => selectGroup(allDistrictSlugs, on)} disabled={running}>
            {DISTRICTS.map((d) => (
              <Check key={d.slug} label={d.label} on={selected.has(d.slug)} onClick={() => toggle(d.slug)} disabled={running} />
            ))}
          </Section>

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

        <div style={{ padding: "12px 16px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#6b7280" }}>{selected.size} selected</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} disabled={running}
              style={{ padding: "8px 16px", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: running ? "not-allowed" : "pointer" }}>
              Cancel
            </button>
            <button onClick={run} disabled={running || selected.size === 0}
              style={{ padding: "8px 18px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: running || selected.size === 0 ? "not-allowed" : "pointer", opacity: running || selected.size === 0 ? 0.6 : 1 }}>
              {running ? "Fetching…" : `Fetch ${selected.size} categor${selected.size === 1 ? "y" : "ies"}`}
            </button>
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
