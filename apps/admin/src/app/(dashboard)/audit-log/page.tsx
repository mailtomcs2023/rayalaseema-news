"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/sidebar";

interface AuditLog {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  resource: string | null;
  resourceId: string | null;
  meta: any;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  actor: { id: string; name: string; email: string; role: string } | null;
}

const ACTION_COLORS: Record<string, string> = {
  create: "#16a34a",
  publish: "#7c3aed",
  schedule: "#0891b2",
  update: "#0284c7",
  delete: "#dc2626",
  restore: "#ea580c",
  login: "#64748b",
  logout: "#64748b",
};

function actionTone(action: string) {
  const verb = action.split(".")[1] || action;
  for (const key of Object.keys(ACTION_COLORS)) {
    if (verb.includes(key)) return ACTION_COLORS[key];
  }
  return "#475569";
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [resource, setResource] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const limit = 30;

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    if (action) params.set("action", action);
    if (resource) params.set("resource", resource);
    if (from) params.set("from", new Date(from).toISOString());
    if (to) params.set("to", new Date(to).toISOString());

    fetch(`/api/audit-logs?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setLogs(data.logs || []);
        setTotal(data.total || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [page, search, action, resource, from, to]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111" }}>Audit Log</h1>
            <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>{total.toLocaleString()} entries</p>
          </div>
        </div>

        {/* Filters */}
        <div className="admin-filter-grid" style={{ display: "grid", gridTemplateColumns: "1fr 160px 140px 140px 140px", gap: 8, marginBottom: 16, background: "#fff", padding: 12, borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by email, action, resource ID..."
            style={{ padding: "8px 12px", border: "1px solid #eee", borderRadius: 8, fontSize: 13, outline: "none" }}
          />
          <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}
            style={{ padding: "8px 12px", border: "1px solid #eee", borderRadius: 8, fontSize: 13, outline: "none" }}>
            <option value="">All actions</option>
            <option value="article.create">article.create</option>
            <option value="article.update">article.update</option>
            <option value="article.publish">article.publish</option>
            <option value="article.schedule">article.schedule</option>
            <option value="article.delete">article.delete</option>
            <option value="article.restore">article.restore</option>
            <option value="user">user.*</option>
            <option value="auth">auth.*</option>
          </select>
          <select value={resource} onChange={(e) => { setResource(e.target.value); setPage(1); }}
            style={{ padding: "8px 12px", border: "1px solid #eee", borderRadius: 8, fontSize: 13, outline: "none" }}>
            <option value="">All resources</option>
            <option value="article">article</option>
            <option value="user">user</option>
            <option value="category">category</option>
            <option value="comment">comment</option>
            <option value="settings">settings</option>
          </select>
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            style={{ padding: "8px 12px", border: "1px solid #eee", borderRadius: 8, fontSize: 13, outline: "none" }} />
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }}
            style={{ padding: "8px 12px", border: "1px solid #eee", borderRadius: 8, fontSize: 13, outline: "none" }} />
        </div>

        {/* Log table */}
        <div style={{ background: "#fff", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", opacity: loading ? 0.6 : 1, overflow: "hidden" }}>
          <div className="table-scroll">
          <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #f3f4f6" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: "#888", fontWeight: 600 }}>When</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: "#888", fontWeight: 600 }}>Actor</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: "#888", fontWeight: 600 }}>Action</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: "#888", fontWeight: 600 }}>Resource</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: "#888", fontWeight: 600 }}>IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const tone = actionTone(log.action);
                const isExpanded = expanded === log.id;
                return (
                  <>
                    <tr key={log.id}
                      onClick={() => setExpanded(isExpanded ? null : log.id)}
                      style={{ borderBottom: "1px solid #f9fafb", cursor: "pointer", background: isExpanded ? "#f9fafb" : "transparent" }}>
                      <td style={{ padding: "10px 16px", fontSize: 12, color: "#555", whiteSpace: "nowrap" as const }}>
                        {new Date(log.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "medium" })}
                      </td>
                      <td style={{ padding: "10px 16px", fontSize: 12, color: "#333" }}>
                        {log.actor?.name || log.actorEmail || "system"}
                        {log.actorRole && (
                          <span style={{ fontSize: 10, color: "#888", marginLeft: 6 }}>· {log.actorRole}</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                          background: tone + "22", color: tone, fontFamily: "monospace",
                        }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ padding: "10px 16px", fontSize: 12, color: "#555" }}>
                        {log.resource}
                        {log.resourceId && <span style={{ fontSize: 11, color: "#888", marginLeft: 4, fontFamily: "monospace" }}>{log.resourceId.slice(-8)}</span>}
                      </td>
                      <td style={{ padding: "10px 16px", fontSize: 11, color: "#888", fontFamily: "monospace" }}>
                        {log.ipAddress || "-"}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={log.id + "-detail"}>
                        <td colSpan={5} style={{ padding: "12px 16px 16px 16px", background: "#f9fafb", borderBottom: "1px solid #eee" }}>
                          <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>METADATA</div>
                          <pre style={{ fontSize: 11, fontFamily: "monospace", color: "#333", whiteSpace: "pre-wrap" as const, margin: 0, background: "#fff", padding: 10, borderRadius: 6, border: "1px solid #eee" }}>
                            {JSON.stringify(log.meta, null, 2)}
                          </pre>
                          {log.userAgent && (
                            <p style={{ fontSize: 10, color: "#888", marginTop: 6, fontFamily: "monospace" }}>UA: {log.userAgent}</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {logs.length === 0 && !loading && (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#aaa" }}>No audit entries</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
              style={{ padding: "6px 14px", background: page === 1 ? "#f3f4f6" : "#fff", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, cursor: page === 1 ? "not-allowed" : "pointer" }}>
              Previous
            </button>
            <span style={{ fontSize: 12, color: "#888" }}>Page {page} of {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
              style={{ padding: "6px 14px", background: page === totalPages ? "#f3f4f6" : "#fff", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, cursor: page === totalPages ? "not-allowed" : "pointer" }}>
              Next
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
