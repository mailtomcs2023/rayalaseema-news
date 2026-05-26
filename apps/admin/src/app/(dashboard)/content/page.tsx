// /content — unified content list (Spec #1 #114). Replaces /articles, /videos,
// /reels, /stories, /gallery, /cartoons, /breaking-news, /news-feed list pages.
//
// Filters: type chips (All + 7 types), status dropdown, free-text search.
// Bulk: select-all, bulk delete (ADMIN-only on the API side), bulk status flip.
// Color-coded type badge per row makes mixed-type lists scannable.
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/sidebar";
import { AutoFetchModal } from "@/components/auto-fetch-modal";

// Color per ContentType for badge backgrounds. Picked to match the front-end
// section colors (cinema = pink, sports = green, etc.) so a journalist's
// mental model carries from the public site to the editor.
const TYPE_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  ARTICLE: { bg: "#fee2e2", fg: "#991b1b", label: "Article" },
  VIDEO: { bg: "#dbeafe", fg: "#1e40af", label: "Video" },
  REEL: { bg: "#dcfce7", fg: "#166534", label: "Reel" },
  WEB_STORY: { bg: "#fef3c7", fg: "#92400e", label: "Story" },
  PHOTO_GALLERY: { bg: "#f3e8ff", fg: "#6b21a8", label: "Photos" },
  CARTOON: { bg: "#fce7f3", fg: "#9d174d", label: "Cartoon" },
  BREAKING_NEWS: { bg: "#fef2f2", fg: "#7f1d1d", label: "Breaking" },
};

const TYPE_ORDER = ["", "ARTICLE", "VIDEO", "REEL", "WEB_STORY", "PHOTO_GALLERY", "CARTOON", "BREAKING_NEWS"];

interface ContentRow {
  id: string;
  type: string;
  title: string;
  slug: string | null;
  status: string;
  featured: boolean;
  viewCount: number;
  publishedAt: string | null;
  scheduledAt: string | null;
  createdAt: string;
  category: { name: string; nameEn: string; color: string } | null;
  author: { name: string };
}

export default function ContentListPage() {
  const [rows, setRows] = useState<ContentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [autoFetchOpen, setAutoFetchOpen] = useState(false);
  // Page size: persisted to localStorage so it sticks across visits. The
  // /api/content GET caps server-side at whatever the route accepts, but
  // 15 → 100 is a reasonable range for an editorial list.
  const [limit, setLimit] = useState<number>(() => {
    if (typeof window === "undefined") return 15;
    const stored = parseInt(window.localStorage.getItem("contentListLimit") || "");
    return [10, 15, 25, 50, 100].includes(stored) ? stored : 15;
  });
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("contentListLimit", String(limit));
  }, [limit]);

  useEffect(() => {
    // Guard against non-array responses (e.g. {error: "Unauthorized"} when the
    // session has expired) so .map() further down doesn't crash the page.
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    if (typeFilter) params.set("type", typeFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (categoryFilter) params.set("category", categoryFilter);

    fetch(`/api/content?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setRows(data.items || []);
        setTotal(data.total || 0);
        setLoading(false);
        setSelected(new Set());
      });
  }, [page, search, typeFilter, statusFilter, categoryFilter, limit]);

  const totalPages = Math.ceil(total / limit);
  const allSelected = rows.length > 0 && selected.size === rows.length;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    const res = await fetch(`/api/content/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || `Delete failed (${res.status})`);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
    setTotal((t) => t - 1);
    setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} item${selected.size > 1 ? "s" : ""}? Cannot be undone.`)) return;
    setBulkLoading(true);
    try {
      const results = await Promise.all(
        Array.from(selected).map((id) => fetch(`/api/content/${id}`, { method: "DELETE" }))
      );
      const failed = results.filter((r) => !r.ok).length;
      const succeeded = results.length - failed;
      setRows((prev) => prev.filter((r) => !selected.has(r.id)));
      setTotal((t) => t - succeeded);
      setSelected(new Set());
      if (failed > 0) alert(`${succeeded} deleted, ${failed} failed`);
    } catch {
      alert("Bulk delete failed");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkStatus = async (newStatus: string) => {
    if (selected.size === 0) return;
    setBulkLoading(true);
    try {
      await Promise.all(
        Array.from(selected).map((id) =>
          fetch(`/api/content/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus }),
          })
        )
      );
      setRows((prev) => prev.map((r) => selected.has(r.id) ? { ...r, status: newStatus } : r));
      setSelected(new Set());
    } catch {
      alert("Some updates failed");
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111" }}>Content</h1>
            <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>{total} total · 1 list replaces 7</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setAutoFetchOpen(true)}
              title="Pick categories / districts to bulk-fetch from NewsData.io, translate to Telugu via Azure OpenAI, save as DRAFT"
              style={{ padding: "10px 16px", background: "#fff", color: "#16a34a", border: "2px solid #16a34a", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              🤖 Auto-fetch news
            </button>
            <Link href="/content/new"
              style={{ padding: "10px 20px", background: "#FF2C2C", color: "#fff", borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: "none" }}>
              + New Content
            </Link>
          </div>
        </div>

        {/* Type filter chips — clicking a chip narrows the list to that ContentType.
            The empty-string chip resets to all types. */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {TYPE_ORDER.map((t) => {
            const isActive = typeFilter === t;
            // "All" follows the same {bg=light, fg=dark} convention as the
            // colored chips so the active-state swap (bg=fg, text=#fff)
            // produces a dark pill with white text instead of white-on-white.
            const color = t ? TYPE_COLORS[t] : { bg: "#e5e7eb", fg: "#111827", label: "All" };
            return (
              <button
                key={t || "all"}
                onClick={() => { setTypeFilter(t); setPage(1); }}
                style={{
                  padding: "6px 14px",
                  background: isActive ? color.fg : color.bg,
                  color: isActive ? "#fff" : color.fg,
                  border: "1px solid transparent",
                  borderColor: isActive ? color.fg : "transparent",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}>
                {color.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, background: "#fff", padding: 12, borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by title..."
            style={{ flex: "1 1 220px", minWidth: 0, padding: "8px 12px", border: "1px solid #eee", borderRadius: 8, fontSize: 13, outline: "none" }}
          />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            style={{ padding: "8px 12px", border: "1px solid #eee", borderRadius: 8, fontSize: 13, outline: "none" }}>
            <option value="">All Status</option>
            <option value="PUBLISHED">Published</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="IN_REVIEW">In Review</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="ARCHIVED">Archived</option>
          </select>
          <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            style={{ padding: "8px 12px", border: "1px solid #eee", borderRadius: 8, fontSize: 13, outline: "none", maxWidth: 200 }}>
            <option value="">All Categories</option>
            {categories.map((c: any) => <option key={c.id} value={c.id}>{c.nameEn}</option>)}
          </select>
          <select
            value={limit}
            onChange={(e) => { setLimit(parseInt(e.target.value) || 15); setPage(1); }}
            style={{ padding: "8px 12px", border: "1px solid #eee", borderRadius: 8, fontSize: 13, outline: "none" }}
            title="Rows per page"
          >
            {[10, 15, 25, 50, 100].map((n) => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </select>
        </div>

        {selected.size > 0 && (
          <div style={{
            display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12, padding: "10px 16px",
            background: "#eff6ff", borderRadius: 10, border: "1px solid #bfdbfe",
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1d4ed8" }}>
              {selected.size} selected
            </span>
            <div style={{ flex: 1 }} />
            <button onClick={() => handleBulkStatus("PUBLISHED")} disabled={bulkLoading}
              style={{ padding: "6px 14px", background: "#dcfce7", color: "#166534", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Publish
            </button>
            <button onClick={() => handleBulkStatus("DRAFT")} disabled={bulkLoading}
              style={{ padding: "6px 14px", background: "#fef3c7", color: "#92400e", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Unpublish
            </button>
            <button onClick={handleBulkDelete} disabled={bulkLoading}
              style={{ padding: "6px 14px", background: "#fef2f2", color: "#dc2626", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {bulkLoading ? "Deleting..." : `Delete ${selected.size}`}
            </button>
            <button onClick={() => setSelected(new Set())}
              style={{ padding: "6px 10px", background: "transparent", color: "#6b7280", border: "none", fontSize: 12, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        )}

        <div className="table-scroll" style={{ background: "#fff", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", opacity: loading ? 0.6 : 1 }}>
          <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #f3f4f6" }}>
                <th style={{ padding: "12px 10px 12px 16px", width: 36 }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    style={{ width: 16, height: 16, cursor: "pointer" }} />
                </th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: "#888", fontWeight: 600 }}>Type</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: "#888", fontWeight: 600 }}>Title</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: "#888", fontWeight: 600 }}>Category</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: "#888", fontWeight: 600 }}>Status</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: "#888", fontWeight: 600 }}>Views</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: "#888", fontWeight: 600 }}>Date</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 12, color: "#888", fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tc = TYPE_COLORS[r.type] || { bg: "#eee", fg: "#555", label: r.type };
                return (
                  <tr key={r.id} style={{
                    borderBottom: "1px solid #f9fafb",
                    background: selected.has(r.id) ? "#eff6ff" : "transparent",
                  }}>
                    <td style={{ padding: "10px 10px 10px 16px", width: 36 }}>
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)}
                        style={{ width: 16, height: 16, cursor: "pointer" }} />
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: tc.fg, background: tc.bg, padding: "2px 8px", borderRadius: 4 }}>
                        {tc.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 16px", maxWidth: 320 }}>
                      <Link href={`/content/${r.id}`} style={{ fontSize: 13, fontWeight: 600, color: "#111", textDecoration: "none", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.title}
                      </Link>
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      {r.category ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#fff", background: r.category.color || "#888", padding: "2px 8px", borderRadius: 4 }}>
                          {r.category.nameEn}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: "#aaa" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                        background: r.status === "PUBLISHED" ? "#dcfce7" : r.status === "DRAFT" ? "#fef3c7" : r.status === "SCHEDULED" ? "#ede9fe" : "#dbeafe",
                        color: r.status === "PUBLISHED" ? "#166534" : r.status === "DRAFT" ? "#92400e" : r.status === "SCHEDULED" ? "#5b21b6" : "#1e40af",
                      }}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ padding: "10px 16px", fontSize: 12, color: "#888" }}>{r.viewCount.toLocaleString()}</td>
                    <td style={{ padding: "10px 16px", fontSize: 12, color: "#888" }}>
                      {r.status === "SCHEDULED" && r.scheduledAt
                        ? <span title="Scheduled for auto-publish">⏰ {new Date(r.scheduledAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</span>
                        : r.publishedAt ? new Date(r.publishedAt).toLocaleDateString() : "-"}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "right" }}>
                      <Link href={`/content/${r.id}`} style={{ padding: "4px 10px", background: "#eff6ff", color: "#2563eb", borderRadius: 4, fontSize: 12, fontWeight: 600, textDecoration: "none", marginRight: 4 }}>Edit</Link>
                      <button onClick={() => handleDelete(r.id)} style={{ padding: "4px 10px", background: "#fef2f2", color: "#dc2626", border: "none", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Delete</button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && !loading && (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "#aaa" }}>No content found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
              style={{ padding: "6px 14px", background: page === 1 ? "#f3f4f6" : "#fff", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, cursor: page === 1 ? "not-allowed" : "pointer", color: page === 1 ? "#aaa" : "#333" }}>
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).slice(Math.max(0, page - 3), page + 2).map((p) => (
              <button key={p} onClick={() => setPage(p)}
                style={{ padding: "6px 12px", background: p === page ? "#FF2C2C" : "#fff", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, fontWeight: p === page ? 700 : 400, color: p === page ? "#fff" : "#333", cursor: "pointer" }}>
                {p}
              </button>
            ))}
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
              style={{ padding: "6px 14px", background: page === totalPages ? "#f3f4f6" : "#fff", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, cursor: page === totalPages ? "not-allowed" : "pointer", color: page === totalPages ? "#aaa" : "#333" }}>
              Next
            </button>
            <span style={{ fontSize: 12, color: "#888", marginLeft: 8 }}>Page {page} of {totalPages}</span>
          </div>
        )}
      </main>

      <AutoFetchModal
        open={autoFetchOpen}
        onClose={() => setAutoFetchOpen(false)}
        onDone={(n) => {
          alert(`✓ Auto-fetch done. ${n} new article${n === 1 ? "" : "s"} added.`);
          window.location.reload();
        }}
      />
    </div>
  );
}
