"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/sidebar";

interface Article {
  id: string;
  title: string;
  slug: string;
  status: string;
  featured: boolean;
  viewCount: number;
  publishedAt: string | null;
  scheduledAt: string | null;
  createdAt: string;
  category: { name: string; nameEn: string; color: string };
  author: { name: string };
}

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const limit = 15;

  // Load categories for filter
  useEffect(() => {
    fetch("/api/categories").then((r) => r.json()).then(setCategories);
  }, []);

  // Load articles with filters
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    if (categoryFilter) params.set("category", categoryFilter);

    fetch(`/api/articles?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setArticles(data.articles || []);
        setTotal(data.total || 0);
        setLoading(false);
        setSelected(new Set());
      });
  }, [page, search, statusFilter, categoryFilter]);

  const totalPages = Math.ceil(total / limit);
  const allSelected = articles.length > 0 && selected.size === articles.length;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(articles.map((a) => a.id)));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this article?")) return;
    await fetch(`/api/articles/${id}`, { method: "DELETE" });
    setArticles((prev) => prev.filter((a) => a.id !== id));
    setTotal((t) => t - 1);
    setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} article${selected.size > 1 ? "s" : ""}? This cannot be undone.`)) return;
    setBulkLoading(true);
    try {
      await Promise.all(
        Array.from(selected).map((id) => fetch(`/api/articles/${id}`, { method: "DELETE" }))
      );
      setArticles((prev) => prev.filter((a) => !selected.has(a.id)));
      setTotal((t) => t - selected.size);
      setSelected(new Set());
    } catch {
      alert("Some deletions failed");
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
          fetch(`/api/articles/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus }),
          })
        )
      );
      setArticles((prev) =>
        prev.map((a) => selected.has(a.id) ? { ...a, status: newStatus } : a)
      );
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
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111" }}>Articles</h1>
            <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>{total} total articles</p>
          </div>
          <Link href="/articles/new"
            style={{ padding: "10px 20px", background: "#FF2C2C", color: "#fff", borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: "none" }}>
            + New Article
          </Link>
        </div>

        {/* Search + Filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, background: "#fff", padding: 12, borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search articles by title..."
            style={{ flex: 1, padding: "8px 12px", border: "1px solid #eee", borderRadius: 8, fontSize: 13, outline: "none" }}
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
        </div>

        {/* Bulk Actions Bar */}
        {selected.size > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10, marginBottom: 12, padding: "10px 16px",
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

        {/* Table */}
        <div style={{ background: "#fff", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", opacity: loading ? 0.6 : 1 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #f3f4f6" }}>
                <th style={{ padding: "12px 10px 12px 16px", width: 36 }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    style={{ width: 16, height: 16, cursor: "pointer" }} />
                </th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: "#888", fontWeight: 600 }}>Title</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: "#888", fontWeight: 600 }}>Category</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: "#888", fontWeight: 600 }}>Status</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: "#888", fontWeight: 600 }}>Views</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: "#888", fontWeight: 600 }}>Date</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 12, color: "#888", fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => (
                <tr key={a.id} style={{
                  borderBottom: "1px solid #f9fafb",
                  background: selected.has(a.id) ? "#eff6ff" : "transparent",
                }}>
                  <td style={{ padding: "10px 10px 10px 16px", width: 36 }}>
                    <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)}
                      style={{ width: 16, height: 16, cursor: "pointer" }} />
                  </td>
                  <td style={{ padding: "10px 16px", maxWidth: 350 }}>
                    <Link href={`/articles/${a.id}`} style={{ fontSize: 13, fontWeight: 600, color: "#111", textDecoration: "none", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.title}
                    </Link>
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#fff", background: a.category.color || "#888", padding: "2px 8px", borderRadius: 4 }}>
                      {a.category.nameEn}
                    </span>
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                      background: a.status === "PUBLISHED" ? "#dcfce7" : a.status === "DRAFT" ? "#fef3c7" : a.status === "SCHEDULED" ? "#ede9fe" : "#dbeafe",
                      color: a.status === "PUBLISHED" ? "#166534" : a.status === "DRAFT" ? "#92400e" : a.status === "SCHEDULED" ? "#5b21b6" : "#1e40af",
                    }}>
                      {a.status}
                    </span>
                  </td>
                  <td style={{ padding: "10px 16px", fontSize: 12, color: "#888" }}>{a.viewCount.toLocaleString()}</td>
                  <td style={{ padding: "10px 16px", fontSize: 12, color: "#888" }}>
                    {a.status === "SCHEDULED" && a.scheduledAt
                      ? <span title="Scheduled for auto-publish">⏰ {new Date(a.scheduledAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</span>
                      : a.publishedAt ? new Date(a.publishedAt).toLocaleDateString() : "-"}
                  </td>
                  <td style={{ padding: "10px 16px", textAlign: "right" }}>
                    <Link href={`/articles/${a.id}`} style={{ padding: "4px 10px", background: "#eff6ff", color: "#2563eb", borderRadius: 4, fontSize: 12, fontWeight: 600, textDecoration: "none", marginRight: 4 }}>Edit</Link>
                    <button onClick={() => handleDelete(a.id)} style={{ padding: "4px 10px", background: "#fef2f2", color: "#dc2626", border: "none", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Delete</button>
                  </td>
                </tr>
              ))}
              {articles.length === 0 && !loading && (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#aaa" }}>No articles found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 16 }}>
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
    </div>
  );
}
