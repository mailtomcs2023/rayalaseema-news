"use client";
// Data hook for the Video IQ panel: loads the latest run for a content row,
// polls while a run is in flight, and wraps the panel API calls.
import { useCallback, useEffect, useRef, useState } from "react";

const TERMINAL = new Set(["READY", "APPROVED", "APPLIED", "FAILED"]);
const POLL_MS = 10_000;

export function useOptimization(contentId: string | undefined) {
  const [row, setRow] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const rowRef = useRef<any>(null);
  rowRef.current = row;

  const load = useCallback(async () => {
    if (!contentId) return;
    try {
      const r = await fetch(`/api/video-iq?contentId=${encodeURIComponent(contentId)}`);
      if (r.status === 204) setRow(null);
      else if (r.ok) setRow(await r.json());
    } finally {
      setLoaded(true);
    }
  }, [contentId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const t = setInterval(() => {
      const cur = rowRef.current;
      if (cur && !TERMINAL.has(cur.status)) void load();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const call = useCallback(async (path: string, init?: RequestInit) => {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(path, { headers: { "content-type": "application/json" }, ...init });
      const j = r.status === 204 ? null : await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.issues?.join("; ") || j?.error || r.statusText);
      await load();
      return j;
    } catch (e) {
      setErr((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }, [load]);

  return {
    row, loaded, busy, err, reload: load,
    optimize: () => call("/api/video-iq", { method: "POST", body: JSON.stringify({ contentId }) }),
    save: (chosen: unknown) => call(`/api/video-iq/${row.id}`, { method: "PATCH", body: JSON.stringify({ chosen }) }),
    approve: () => call(`/api/video-iq/${row.id}/approve`, { method: "POST" }),
    override: (note: string) => call(`/api/video-iq/${row.id}/override`, { method: "POST", body: JSON.stringify({ note }) }),
    publish: () => call(`/api/video-iq/${row.id}/publish`, { method: "POST" }),
  };
}
