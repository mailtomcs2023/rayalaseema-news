"use client";

// Tag suggestion chip row, shown directly under the Tags input in the
// content editor. Loads /api/categories/[id]/suggested-tags whenever the
// editor's category changes; renders the result as a scrollable horizontal
// row of clickable chips. Click adds the tag to the parent's tags state;
// chips for tags that are already present are dimmed (still clickable to
// re-add is a no-op via the parent's dedup).
//
// Source markers ride along on each chip — "BOTH" and "USAGE" get a small
// dot indicator because those are the tags the newsroom is actually using,
// not just the AI-seed baseline.

import { useEffect, useState } from "react";
import { Sparkles, TrendingUp } from "lucide-react";

interface SuggestedTag {
  id: string;
  name: string;
  slug: string;
  source: "CURATED" | "USAGE" | "BOTH";
  usageCount: number;
}

interface Props {
  categoryId: string;
  /** Lowercase set of names already in the parent's Tags input. */
  currentNames: Set<string>;
  onAddTag: (name: string) => void;
}

export function TagSuggestions({ categoryId, currentNames, onAddTag }: Props) {
  const [tags, setTags] = useState<SuggestedTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!categoryId) {
      setTags([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/categories/${categoryId}/suggested-tags`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Failed (${r.status})`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setTags(Array.isArray(data?.tags) ? data.tags : []);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  if (!categoryId) return null;

  if (loading) {
    return (
      <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>
        Loading suggestions…
      </p>
    );
  }

  if (error) {
    return (
      <p style={{ fontSize: 11, color: "#b91c1c", marginTop: 6 }}>
        Couldn't load suggestions — {error}
      </p>
    );
  }

  if (tags.length === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: 8 }}>
      <p
        style={{
          fontSize: 11,
          color: "#6b7280",
          marginBottom: 6,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          fontWeight: 600,
        }}
      >
        Suggestions
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {tags.map((t) => {
          const isAdded = currentNames.has(t.name.toLowerCase());
          const showTrend = t.source === "USAGE" || t.source === "BOTH";
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onAddTag(t.name)}
              disabled={isAdded}
              title={
                isAdded
                  ? "Already added"
                  : showTrend
                    ? `Used on ${t.usageCount} article${t.usageCount === 1 ? "" : "s"} in this category`
                    : "Suggested tag"
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 9px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: isAdded ? "#f3f4f6" : "#fff",
                color: isAdded ? "#9ca3af" : "#374151",
                fontSize: 12,
                fontWeight: 500,
                cursor: isAdded ? "default" : "pointer",
                lineHeight: 1.4,
                transition: "background 120ms, border-color 120ms",
              }}
              onMouseEnter={(e) => {
                if (isAdded) return;
                e.currentTarget.style.background = "#f9fafb";
                e.currentTarget.style.borderColor = "#d1d5db";
              }}
              onMouseLeave={(e) => {
                if (isAdded) return;
                e.currentTarget.style.background = "#fff";
                e.currentTarget.style.borderColor = "#e5e7eb";
              }}
            >
              {showTrend ? (
                <TrendingUp aria-hidden="true" size={11} style={{ color: "#16a34a" }} />
              ) : (
                <Sparkles aria-hidden="true" size={11} style={{ color: "#9ca3af" }} />
              )}
              {t.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
