"use client";

import { useState, useEffect } from "react";

interface PollOption {
  id: string;
  text: string;
  votes: number;
  percentage: number;
}

interface Poll {
  id: string;
  question: string;
  totalVotes: number;
  options: PollOption[];
}

const IconBars = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18"/>
    <rect x="5"  y="11" width="3" height="9"/>
    <rect x="10" y="7"  width="3" height="13"/>
    <rect x="15" y="3"  width="3" height="17"/>
  </svg>
);

export function PollWidget() {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [voted, setVoted] = useState(false);
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    fetch("/api/polls").then((r) => r.json()).then((data) => {
      if (data) {
        setPoll(data);
        const votedPolls = JSON.parse(localStorage.getItem("voted-polls") || "[]");
        if (votedPolls.includes(data.id)) setVoted(true);
      }
    }).catch(() => {});
  }, []);

  const handleVote = async () => {
    if (!selectedId || voted) return;

    await fetch("/api/polls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionId: selectedId }),
    });

    setPoll((prev) => {
      if (!prev) return null;
      const options = prev.options.map((o) => o.id === selectedId ? { ...o, votes: o.votes + 1 } : o);
      const totalVotes = options.reduce((s, o) => s + o.votes, 0);
      return {
        ...prev,
        totalVotes,
        options: options.map((o) => ({ ...o, percentage: Math.round((o.votes / totalVotes) * 100) })),
      };
    });

    setVoted(true);
    const votedPolls = JSON.parse(localStorage.getItem("voted-polls") || "[]");
    votedPolls.push(poll!.id);
    localStorage.setItem("voted-polls", JSON.stringify(votedPolls));
  };

  if (!poll) return null;

  return (
    <div className="panel" style={{ marginTop: "var(--sp-2)" }}>
      <div className="section-head">
        <span className="section-head__icon"><IconBars /></span>
        <span className="section-head__label">అభిప్రాయ సేకరణ</span>
      </div>

      <div style={{ padding: "var(--sp-3)" }}>
        <p style={{ fontSize: "var(--t-md)", fontWeight: "var(--w-emp)" as any, color: "var(--n-900)", marginBottom: "var(--sp-3)", lineHeight: 1.5 }}>{poll.question}</p>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
          {poll.options.map((opt) => (
            <div key={opt.id}>
              {voted ? (
                <div style={{ position: "relative", borderRadius: "var(--r-sm)", overflow: "hidden", border: "1px solid var(--paper-edge)" }}>
                  <div style={{
                    position: "absolute", top: 0, left: 0, height: "100%",
                    width: `${opt.percentage}%`,
                    background: opt.id === selectedId ? "var(--brand)" : "var(--n-200)",
                    opacity: opt.id === selectedId ? 0.18 : 0.5,
                    transition: "width var(--dur-slow) var(--ease)",
                  }} />
                  <div style={{ position: "relative", padding: "var(--sp-2) var(--sp-3)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "var(--t-sm)", color: "var(--n-700)", fontWeight: (opt.id === selectedId ? "var(--w-head)" : "var(--w-emp)") as any }}>{opt.text}</span>
                    <span style={{ fontSize: "var(--t-sm)", fontWeight: "var(--w-head)" as any, color: "var(--n-700)" }}>{opt.percentage}%</span>
                  </div>
                </div>
              ) : (
                <label style={{
                  display: "flex", alignItems: "center", gap: "var(--sp-2)", padding: "var(--sp-2) var(--sp-3)",
                  borderRadius: "var(--r-sm)",
                  border: `1px solid ${selectedId === opt.id ? "var(--brand)" : "var(--paper-edge)"}`,
                  cursor: "pointer",
                  background: selectedId === opt.id ? "var(--brand-soft)" : "transparent",
                  transition: "background var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease)",
                }}>
                  <input type="radio" name="poll" value={opt.id}
                    checked={selectedId === opt.id}
                    onChange={() => setSelectedId(opt.id)}
                    style={{ width: 16, height: 16, accentColor: "var(--brand)" }} />
                  <span style={{ fontSize: "var(--t-sm)", color: "var(--n-700)" }}>{opt.text}</span>
                </label>
              )}
            </div>
          ))}
        </div>

        {!voted && (
          <button onClick={handleVote} disabled={!selectedId} style={{
            width: "100%", marginTop: "var(--sp-3)", padding: "var(--sp-2) var(--sp-4)", borderRadius: "var(--r-sm)",
            background: selectedId ? "var(--brand)" : "var(--n-200)",
            color: selectedId ? "var(--brand-on)" : "var(--n-500)", border: "none",
            fontSize: "var(--t-sm)", fontWeight: "var(--w-head)" as any,
            cursor: selectedId ? "pointer" : "not-allowed",
            transition: "background var(--dur-fast) var(--ease)",
          }}>
            Vote
          </button>
        )}

        <p className="meta-italic" style={{ marginTop: "var(--sp-2)", textAlign: "center" }}>
          {poll.totalVotes.toLocaleString()} votes
        </p>
      </div>
    </div>
  );
}
