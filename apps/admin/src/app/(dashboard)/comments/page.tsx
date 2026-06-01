"use client";

import { useState, useEffect } from "react";

interface Comment {
  id: string; name: string; content: string; approved: boolean; createdAt: string;
  article: { title: string; slug: string };
}

export default function CommentsPage() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [filter, setFilter] = useState("pending");

  const load = (status: string) => {
    setFilter(status);
    fetch(`/api/comments?status=${status}`).then((r) => r.json()).then(setComments);
  };

  useEffect(() => { load("pending"); }, []);

  const approve = async (id: string) => {
    await fetch(`/api/comments/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approved: true }) });
    setComments(comments.filter((c) => c.id !== id));
  };

  const remove = async (id: string) => {
    await fetch(`/api/comments/${id}`, { method: "DELETE" });
    setComments(comments.filter((c) => c.id !== id));
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111", marginBottom: 16 }}>Comments Moderation</h1>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {["pending", "approved"].map((s) => (
            <button key={s} onClick={() => load(s)} style={{
              padding: "8px 20px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer",
              background: filter === s ? "#FF2C2C" : "#fff", color: filter === s ? "#fff" : "#555",
            }}>
              {s === "pending" ? "Pending Review" : "Approved"}
            </button>
          ))}
        </div>

        {comments.length === 0 ? (
          <p style={{ textAlign: "center", color: "#aaa", padding: 40 }}>No {filter} comments</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} style={{ background: "#fff", borderRadius: 10, padding: 16, marginBottom: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{c.name}</span>
                  <span style={{ fontSize: 11, color: "#888", marginLeft: 10 }}>{new Date(c.createdAt).toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {!c.approved && (
                    <button onClick={() => approve(c.id)} style={{ padding: "4px 14px", background: "#dcfce7", color: "#166534", border: "none", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Approve</button>
                  )}
                  <button onClick={() => remove(c.id)} style={{ padding: "4px 10px", background: "#fef2f2", color: "#dc2626", border: "none", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Delete</button>
                </div>
              </div>
              <p style={{ fontSize: 13, color: "#444", lineHeight: 1.6, marginBottom: 6 }}>{c.content}</p>
              <p style={{ fontSize: 11, color: "#aaa" }}>On: {c.article.title}</p>
            </div>
          ))
        )}
      </main>
    </div>
  );
}
