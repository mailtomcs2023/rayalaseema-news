"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/sidebar";

interface PollOption { id: string; text: string; votes: number; }
interface Poll { id: string; question: string; active: boolean; options: PollOption[]; createdAt: string; }

export default function PollsPage() {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", "", ""]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/polls").then((r) => r.json()).then(setPolls);
  }, []);

  const addOption = () => setOptions([...options, ""]);
  const updateOption = (i: number, v: string) => setOptions(options.map((o, j) => j === i ? v : o));

  const createPoll = async () => {
    const validOptions = options.filter((o) => o.trim());
    if (!question.trim() || validOptions.length < 2) return alert("Question and at least 2 options required");
    setCreating(true);
    const res = await fetch("/api/polls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: question.trim(), options: validOptions }),
    });
    const poll = await res.json();
    setPolls([poll, ...polls]);
    setQuestion("");
    setOptions(["", "", ""]);
    setCreating(false);
  };

  const toggleActive = async (id: string, active: boolean) => {
    await fetch(`/api/polls/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !active }) });
    setPolls(polls.map((p) => p.id === id ? { ...p, active: !active } : p));
  };

  const deletePoll = async (id: string) => {
    if (!confirm("Delete this poll?")) return;
    await fetch(`/api/polls/${id}`, { method: "DELETE" });
    setPolls(polls.filter((p) => p.id !== id));
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111", marginBottom: 24 }}>Polls & Surveys</h1>

        {/* Create New Poll */}
        <div style={{ background: "#fff", borderRadius: 10, padding: 20, marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: "#333" }}>Create New Poll</h2>
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Poll question (Telugu preferred)"
            style={{ width: "100%", padding: "10px 14px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14, marginBottom: 12, outline: "none", boxSizing: "border-box" }} />
          {options.map((o, i) => (
            <input key={i} value={o} onChange={(e) => updateOption(i, e.target.value)} placeholder={`Option ${i + 1}`}
              style={{ width: "100%", padding: "8px 14px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, marginBottom: 6, outline: "none", boxSizing: "border-box" }} />
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={addOption} style={{ padding: "6px 14px", background: "#f3f4f6", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>+ Add Option</button>
            <button onClick={createPoll} disabled={creating} style={{ padding: "8px 20px", background: "#FF2C2C", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              {creating ? "Creating..." : "Create Poll"}
            </button>
          </div>
        </div>

        {/* Existing Polls */}
        {polls.map((poll) => {
          const totalVotes = poll.options.reduce((s, o) => s + o.votes, 0);
          return (
            <div key={poll.id} style={{ background: "#fff", borderRadius: 10, padding: 16, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>{poll.question}</h3>
                  <span style={{ fontSize: 12, color: "#888" }}>{totalVotes} votes | {new Date(poll.createdAt).toLocaleDateString()}</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => toggleActive(poll.id, poll.active)} style={{
                    padding: "4px 12px", borderRadius: 4, border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer",
                    background: poll.active ? "#dcfce7" : "#f3f4f6", color: poll.active ? "#166534" : "#888",
                  }}>
                    {poll.active ? "Active" : "Inactive"}
                  </button>
                  <button onClick={() => deletePoll(poll.id)} style={{ padding: "4px 10px", background: "#fef2f2", color: "#dc2626", border: "none", borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Delete</button>
                </div>
              </div>
              {poll.options.map((o) => (
                <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ flex: 1, background: "#f3f4f6", borderRadius: 4, overflow: "hidden", height: 24 }}>
                    <div style={{ height: "100%", background: "var(--color-brand, #FF2C2C)", opacity: 0.2, width: `${totalVotes > 0 ? (o.votes / totalVotes * 100) : 0}%` }} />
                  </div>
                  <span style={{ fontSize: 12, color: "#555", minWidth: 100 }}>{o.text}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#333", minWidth: 60, textAlign: "right" }}>{o.votes} ({totalVotes > 0 ? Math.round(o.votes / totalVotes * 100) : 0}%)</span>
                </div>
              ))}
            </div>
          );
        })}
      </main>
    </div>
  );
}
