"use client";

import { useState, useEffect } from "react";
import { BarChart3 } from "lucide-react";

interface PollOption {
  id: string;
  text: string;
  votes: number;
  percentage: number;
  youVoted?: boolean;
}

interface Poll {
  id: string;
  question: string;
  allowMultiple: boolean;
  expiresAt: string | null;
  totalVotes: number;
  voted: boolean;
  options: PollOption[];
}

export function PollWidget() {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/polls")
      .then((r) => r.json())
      .then((data) => Array.isArray(data) ? setPolls(data) : setPolls([]))
      .catch(() => setPolls([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (polls.length === 0) return null;

  return (
    <>
      {polls.map((poll) => (
        <SinglePoll
          key={poll.id}
          poll={poll}
          onUpdate={(updated) => setPolls((prev) => prev.map((p) => p.id === updated.id ? updated : p))}
        />
      ))}
    </>
  );
}

function SinglePoll({ poll, onUpdate }: { poll: Poll; onUpdate: (p: Poll) => void }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expired = !!poll.expiresAt && new Date(poll.expiresAt).getTime() < Date.now();
  // After voting OR after the poll closes, switch to the results view.
  const showResults = poll.voted || expired;

  const toggle = (id: string) => {
    if (poll.allowMultiple) {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedIds(next);
    } else {
      setSelectedIds(new Set([id]));
    }
  };

  const handleVote = async () => {
    if (selectedIds.size === 0 || submitting || showResults) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pollId: poll.id, optionIds: [...selectedIds] }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: "Vote failed" }));
        setError(j.error || "Vote failed");
        return;
      }
      // Recompute locally - server has already incremented. We could refetch
      // for canonical totals but the local math is identical and avoids a
      // round-trip flash.
      const options = poll.options.map((o) =>
        selectedIds.has(o.id) ? { ...o, votes: o.votes + 1, youVoted: true } : o,
      );
      const totalVotes = options.reduce((s, o) => s + o.votes, 0);
      onUpdate({
        ...poll,
        voted: true,
        totalVotes,
        options: options.map((o) => ({
          ...o,
          percentage: totalVotes > 0 ? Math.round((o.votes / totalVotes) * 100) : 0,
        })),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="panel" style={{ marginTop: "var(--sp-2)" }}>
      <div className="section-head">
        <span className="section-head__icon"><BarChart3 size={16} /></span>
        <span className="section-head__label">అభిప్రాయ సేకరణ</span>
      </div>

      <div style={{ padding: "var(--sp-3)" }}>
        <p style={{ fontSize: "var(--t-md)", fontWeight: "var(--w-emp)" as any, color: "var(--n-900)", marginBottom: "var(--sp-1)", lineHeight: 1.5 }}>
          {poll.question}
        </p>
        <p className="meta-italic" style={{ marginBottom: "var(--sp-3)" }}>
          {poll.allowMultiple ? "Select one or more" : "Select one"}
          {poll.expiresAt && (
            <> · {expired ? "Closed" : "Closes"} {new Date(poll.expiresAt).toLocaleDateString()}</>
          )}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
          {poll.options.map((opt) => {
            const youVoted = opt.youVoted || (poll.voted && selectedIds.has(opt.id));
            if (showResults) {
              return (
                <div key={opt.id} style={{ position: "relative", borderRadius: "var(--r-sm)", overflow: "hidden", border: "1px solid var(--paper-edge)" }}>
                  <div style={{
                    position: "absolute", top: 0, left: 0, height: "100%",
                    width: `${opt.percentage}%`,
                    background: youVoted ? "var(--brand)" : "var(--n-300)",
                    opacity: youVoted ? 0.2 : 0.4,
                    transition: "width var(--dur-slow) var(--ease)",
                  }} />
                  <div style={{ position: "relative", padding: "var(--sp-2) var(--sp-3)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--sp-2)" }}>
                    <span style={{
                      fontSize: "var(--t-sm)",
                      color: "var(--n-800)",
                      fontWeight: (youVoted ? "var(--w-head)" : "var(--w-emp)") as any,
                    }}>
                      {opt.text}
                    </span>
                    <span style={{ fontSize: "var(--t-sm)", fontWeight: "var(--w-head)" as any, color: "var(--n-800)", whiteSpace: "nowrap" }}>
                      {opt.percentage}%
                    </span>
                  </div>
                </div>
              );
            }

            const isSelected = selectedIds.has(opt.id);
            return (
              <label key={opt.id} style={{
                display: "flex", alignItems: "center", gap: "var(--sp-2)", padding: "var(--sp-2) var(--sp-3)",
                borderRadius: "var(--r-sm)",
                border: `1px solid ${isSelected ? "var(--brand)" : "var(--paper-edge)"}`,
                cursor: "pointer",
                background: isSelected ? "var(--brand-soft)" : "transparent",
                transition: "background var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease)",
              }}>
                <input
                  type={poll.allowMultiple ? "checkbox" : "radio"}
                  name={`poll-${poll.id}`}
                  value={opt.id}
                  checked={isSelected}
                  onChange={() => toggle(opt.id)}
                  style={{ width: 16, height: 16, accentColor: "var(--brand)" }}
                />
                <span style={{ fontSize: "var(--t-sm)", color: "var(--n-700)" }}>{opt.text}</span>
              </label>
            );
          })}
        </div>

        {!showResults && (
          <button
            onClick={handleVote}
            disabled={selectedIds.size === 0 || submitting}
            style={{
              width: "100%", marginTop: "var(--sp-3)", padding: "var(--sp-2) var(--sp-4)", borderRadius: "var(--r-sm)",
              background: selectedIds.size > 0 ? "var(--brand)" : "var(--n-200)",
              color: selectedIds.size > 0 ? "var(--brand-on)" : "var(--n-500)",
              border: "none",
              fontSize: "var(--t-sm)", fontWeight: "var(--w-head)" as any,
              cursor: selectedIds.size > 0 && !submitting ? "pointer" : "not-allowed",
              transition: "background var(--dur-fast) var(--ease)",
            }}
          >
            {submitting ? "Voting..." : "Vote"}
          </button>
        )}

        {error && (
          <p className="meta-italic" style={{ marginTop: "var(--sp-2)", textAlign: "center", color: "var(--brand)" }}>
            {error}
          </p>
        )}

        <p className="meta-italic" style={{ marginTop: "var(--sp-2)", textAlign: "center" }}>
          {poll.totalVotes.toLocaleString()} {poll.totalVotes === 1 ? "vote" : "votes"}
          {expired && " · Final results"}
        </p>
      </div>
    </div>
  );
}
