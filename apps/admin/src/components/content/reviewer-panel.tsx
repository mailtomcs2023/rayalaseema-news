"use client";

// Reviewer assignment panel — sits on /content/[id] for Editor + Admin.
// Shows the current assignee and lets them reassign to a different
// sub-editor in the article's category (sorted by current load so the
// recommended pick is at the top).
//
// Sub-editors don't see this panel — they can't reassign anyway. Reporters
// don't see this page at all.

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserCheck } from "lucide-react";

interface Reviewer {
  id: string;
  name: string;
  email: string;
  openCount: number;
}

interface Payload {
  assignedReviewerId: string | null;
  reviewers: Reviewer[];
}

export function ReviewerPanel({ contentId }: { contentId: string }) {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const canEdit = role === "ADMIN" || role === "EDITOR";

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hide entirely for non-editors so reporters/SE pages stay clean.
  if (!canEdit) return null;

  const load = () => {
    setLoading(true);
    fetch(`/api/content/${contentId}/reviewers`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) {
          setError(d.error);
          setData(null);
        } else {
          setData(d);
          setError(null);
        }
      })
      .catch(() => setError("Failed to load reviewers"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (contentId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentId]);

  const reassign = async (next: string) => {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/content/${contentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedReviewerId: next === "_unassign" ? "" : next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || `Failed (${res.status})`);
        return;
      }
      // Reload so the workload counts + current assignee refresh.
      load();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold mb-2">Assigned reviewer</h3>
        <p className="text-xs text-muted-foreground">Loading...</p>
      </section>
    );
  }

  const current = data?.assignedReviewerId
    ? data.reviewers.find((r) => r.id === data.assignedReviewerId)
    : null;

  return (
    <section className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <UserCheck className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Assigned reviewer</h3>
      </div>

      {data && data.reviewers.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No sub-editors assigned to this article&apos;s category. Add one via Users →
          assigned categories, or reassign manually below.
        </p>
      ) : null}

      <Select
        value={data?.assignedReviewerId ?? "_unassign"}
        onValueChange={(v) => reassign(v)}
        disabled={saving || !data}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Unassigned" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_unassign">— Unassigned (pool) —</SelectItem>
          {data?.reviewers.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.name} · {r.openCount} open
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {current ? (
        <p className="text-xs text-muted-foreground">
          Current: <span className="text-foreground font-medium">{current.name}</span>
          {" · "}
          {current.openCount} open article{current.openCount === 1 ? "" : "s"} in queue
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Article is in the pool — any sub-editor in the category can claim it.
        </p>
      )}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </section>
  );
}
