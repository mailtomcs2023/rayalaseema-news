"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/sidebar";
import { useSession } from "next-auth/react";

interface Article {
  id: string; title: string; slug: string; status: string; createdAt: string;
  rejectionNote?: string;
  category: { name: string; nameEn: string; color: string };
  author: { name: string };
}

const statusTabs = [
  { key: "SUBMITTED", label: "Submitted", color: "#f59e0b" },
  { key: "IN_REVIEW", label: "In Review", color: "#3b82f6" },
  { key: "APPROVED", label: "Approved", color: "#16a34a" },
  { key: "REJECTED", label: "Rejected", color: "#dc2626" },
  { key: "DRAFT", label: "Drafts", color: "#888" },
];

export default function ReviewPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role || "REPORTER";
  const [articles, setArticles] = useState<Article[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState("SUBMITTED");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejectArticleId, setRejectArticleId] = useState<string | null>(null);

  const load = (status: string) => {
    setActiveTab(status);
    setLoading(true);
    fetch(`/api/review?status=${status}`)
      .then((r) => r.json())
      .then((data) => { setArticles(data.articles || []); setCounts(data.counts || {}); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load("SUBMITTED"); }, []);

  const doAction = async (articleId: string, action: string, note?: string) => {
    setActionLoading(articleId);
    await fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId, action, note }),
    });
    setActionLoading(null);
    setRejectArticleId(null);
    setRejectNote("");
    load(activeTab);
  };

  // Actions available based on role and article status
  const getActions = (article: Article) => {
    const actions: { label: string; action: string; color: string; bg: string }[] = [];

    if (article.status === "SUBMITTED") {
      if (["SUB_EDITOR", "CHIEF_SUB_EDITOR", "ADMIN"].includes(role)) {
        actions.push({ label: "Review తీసుకో", action: "review", color: "#1d4ed8", bg: "#dbeafe" });
        actions.push({ label: "Reject", action: "reject", color: "#dc2626", bg: "#fef2f2" });
      }
    }
    if (article.status === "IN_REVIEW") {
      if (["CHIEF_SUB_EDITOR", "ADMIN"].includes(role)) {
        actions.push({ label: "Approve ✓", action: "approve", color: "#16a34a", bg: "#dcfce7" });
        actions.push({ label: "Publish Now", action: "publish", color: "#fff", bg: "#FF2C2C" });
      }
      if (["SUB_EDITOR", "CHIEF_SUB_EDITOR", "ADMIN"].includes(role)) {
        actions.push({ label: "Reject", action: "reject", color: "#dc2626", bg: "#fef2f2" });
      }
    }
    if (article.status === "APPROVED") {
      if (["CHIEF_SUB_EDITOR", "ADMIN"].includes(role)) {
        actions.push({ label: "Publish Now", action: "publish", color: "#fff", bg: "#FF2C2C" });
      }
    }
    if (article.status === "REJECTED") {
      actions.push({ label: "Re-submit", action: "submit", color: "#f59e0b", bg: "#fef3c7" });
    }
    if (article.status === "DRAFT") {
      actions.push({ label: "Submit for Review", action: "submit", color: "#f59e0b", bg: "#fef3c7" });
    }

    return actions;
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111", marginBottom: 4 }}>Review Queue</h1>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>Editorial workflow - review, approve, publish articles</p>

        {/* Status Tabs */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          {statusTabs.map((tab) => (
            <button key={tab.key} onClick={() => load(tab.key)} style={{
              padding: "8px 16px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer",
              background: activeTab === tab.key ? tab.color : "#fff",
              color: activeTab === tab.key ? "#fff" : "#555",
              boxShadow: activeTab === tab.key ? "none" : "0 1px 2px rgba(0,0,0,0.06)",
            }}>
              {tab.label} ({counts[tab.key] || 0})
            </button>
          ))}
        </div>

        {/* Articles List */}
        {loading ? (
          <p style={{ textAlign: "center", padding: 40, color: "#aaa" }}>Loading...</p>
        ) : articles.length === 0 ? (
          <p style={{ textAlign: "center", padding: 40, color: "#aaa" }}>No articles in this queue</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {articles.map((a) => (
              <div key={a.id} style={{ background: "#fff", borderRadius: 10, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                  <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                    <Link href={`/articles/${a.id}`} style={{ fontSize: 15, fontWeight: 700, color: "#111", textDecoration: "none" }}>
                      {a.title}
                    </Link>
                    <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: "#fff", background: a.category.color, padding: "1px 8px", borderRadius: 4 }}>{a.category.nameEn}</span>
                      <span style={{ fontSize: 11, color: "#888" }}>by {a.author.name}</span>
                      <span style={{ fontSize: 11, color: "#aaa" }}>{new Date(a.createdAt).toLocaleDateString()}</span>
                    </div>
                    {/* Rejection note */}
                    {a.rejectionNote && a.status === "REJECTED" && (
                      <div style={{ marginTop: 8, padding: "8px 12px", background: "#fef2f2", borderRadius: 6, borderLeft: "3px solid #dc2626" }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: "#dc2626" }}>Rejection Note:</p>
                        <p style={{ fontSize: 12, color: "#666" }}>{a.rejectionNote}</p>
                      </div>
                    )}
                  </div>
                  {/* Actions */}
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flexShrink: 0 }}>
                    <Link href={`/articles/${a.id}`} style={{ padding: "6px 12px", background: "#eff6ff", color: "#2563eb", borderRadius: 6, fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
                      Edit
                    </Link>
                    {getActions(a).map((act) => (
                      act.action === "reject" ? (
                        <button key={act.action} onClick={() => setRejectArticleId(a.id)}
                          style={{ padding: "6px 12px", background: act.bg, color: act.color, border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          {act.label}
                        </button>
                      ) : (
                        <button key={act.action} onClick={() => doAction(a.id, act.action)}
                          disabled={actionLoading === a.id}
                          style={{ padding: "6px 12px", background: act.bg, color: act.color, border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          {actionLoading === a.id ? "..." : act.label}
                        </button>
                      )
                    ))}
                  </div>
                </div>

                {/* Reject note input */}
                {rejectArticleId === a.id && (
                  <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <input value={rejectNote} onChange={(e) => setRejectNote(e.target.value)}
                      placeholder="Rejection reason / feedback for reporter..."
                      style={{ flex: "1 1 200px", minWidth: 0, padding: "8px 12px", border: "1px solid #fecaca", borderRadius: 6, fontSize: 12, outline: "none" }} />
                    <button onClick={() => doAction(a.id, "reject", rejectNote)}
                      style={{ padding: "8px 16px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      Reject
                    </button>
                    <button onClick={() => { setRejectArticleId(null); setRejectNote(""); }}
                      style={{ padding: "8px 12px", background: "#f3f4f6", color: "#888", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
