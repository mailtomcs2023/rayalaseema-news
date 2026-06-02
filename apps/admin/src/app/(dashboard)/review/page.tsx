"use client";

import { Fragment, useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KycGatedLink, useKycGate } from "@/components/kyc-gated-link";
import { useSession } from "next-auth/react";
import {
  ColumnDef,
  ColumnFiltersState,
  RowSelectionState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CircleXIcon, ListFilterIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Article {
  id: string;
  title: string;
  slug: string;
  status: string;
  createdAt: string;
  rejectionNote?: string;
  // Editor → Sub-editor return-with-feedback note. Present on SUBMITTED rows
  // that the Editor bounced from IN_REVIEW via "Return to SE".
  editorNote?: string | null;
  category: { name: string; nameEn: string; color: string } | null;
  author: { name: string } | null;
  // Stage 2 - auto-assigned sub-editor (null = pool / unassigned).
  assignedReviewer?: { id: string; name: string } | null;
}

interface ActionDef {
  label: string;
  action: string;
  color: string;
  bg: string;
}

const statusTabs = [
  { key: "SUBMITTED", label: "Submitted", color: "#f59e0b" },
  { key: "IN_REVIEW", label: "In Review", color: "#3b82f6" },
  { key: "APPROVED", label: "Approved", color: "#16a34a" },
  { key: "REJECTED", label: "Rejected", color: "#dc2626" },
  { key: "DRAFT", label: "Drafts", color: "#888" },
];

// Bulk actions allowed for a given tab + role. Filters down based on whether
// the role can perform the action and whether the article status fits.
function bulkActionsFor(tab: string, role: string): ActionDef[] {
  const out: ActionDef[] = [];
  if (tab === "SUBMITTED" && ["SUB_EDITOR", "EDITOR", "ADMIN"].includes(role)) {
    out.push({ label: "Review", action: "review", color: "#1d4ed8", bg: "#dbeafe" });
    out.push({ label: "Reject", action: "reject", color: "#dc2626", bg: "#fef2f2" });
  }
  if (tab === "IN_REVIEW") {
    if (["EDITOR", "ADMIN"].includes(role)) {
      out.push({ label: "Approve", action: "approve", color: "#16a34a", bg: "#dcfce7" });
      out.push({ label: "Publish", action: "publish", color: "#fff", bg: "#FF2C2C" });
      // Editor-only escape hatch when a SE made a mistake - send it back to
      // them with a note. Not exposed to SE (they can't return to themselves).
      out.push({ label: "Return to SE", action: "return-to-se", color: "#92400e", bg: "#fef3c7" });
    }
    if (["SUB_EDITOR", "EDITOR", "ADMIN"].includes(role)) {
      out.push({ label: "Reject", action: "reject", color: "#dc2626", bg: "#fef2f2" });
    }
  }
  if (tab === "APPROVED" && ["EDITOR", "ADMIN"].includes(role)) {
    out.push({ label: "Publish", action: "publish", color: "#fff", bg: "#FF2C2C" });
  }
  if (tab === "REJECTED" || tab === "DRAFT") {
    out.push({ label: "Submit", action: "submit", color: "#f59e0b", bg: "#fef3c7" });
  }
  return out;
}

export default function ReviewPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role || "REPORTER";
  const currentUserId = (session?.user as any)?.id as string | undefined;
  const [articles, setArticles] = useState<Article[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState("SUBMITTED");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejectArticleId, setRejectArticleId] = useState<string | null>(null);
  // Rejection-reason modal - opened from the new "Reason" column for any
  // REJECTED row. Keeps the table compact instead of expanding a per-row
  // panel that pushes other rows down.
  const [reasonModalArticle, setReasonModalArticle] = useState<Article | null>(null);

  // "Mark in review" requires the sub-editor to set a payment amount for the
  // article. We open this modal first, then fire the actual /api/review POST
  // with { action: "review", paymentAmount, note } when they confirm.
  // `target` discriminates single vs bulk so the same modal serves both.
  type ReviewTarget =
    | { mode: "single"; articleId: string; articleTitle: string }
    | { mode: "bulk"; count: number };
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);
  const [reviewAmount, setReviewAmount] = useState<string>("");
  const [reviewNote, setReviewNote] = useState<string>("");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // "Return to SE" modal - Editor/Admin only. Mirrors the review modal's
  // single|bulk shape so we can fire one or many bounces with the same note.
  type ReturnTarget =
    | { mode: "single"; articleId: string; articleTitle: string }
    | { mode: "bulk"; count: number };
  const [returnTarget, setReturnTarget] = useState<ReturnTarget | null>(null);
  const [returnNote, setReturnNote] = useState<string>("");
  const [returnError, setReturnError] = useState<string | null>(null);
  const [returnSubmitting, setReturnSubmitting] = useState(false);

  // Editor-note viewer modal - opens from the orange "View note" badge on
  // SUBMITTED rows so the SE can read why the editor sent it back.
  const [editorNoteModalArticle, setEditorNoteModalArticle] = useState<Article | null>(null);

  // Bulk state
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [bulkRejectMode, setBulkRejectMode] = useState(false);
  const [bulkRejectNote, setBulkRejectNote] = useState("");
  const [bulkRunning, setBulkRunning] = useState(false);

  // KYC gate - reviewing (approve / reject / publish / pay reporter) is an
  // editorial action, so editors / sub-editors must be VERIFIED. Short-
  // circuit at the wrapper functions below so every per-row + bulk button
  // benefits without each one wrapping its onClick separately. `kycGuard`
  // is for modal openers (reject / review / return-to-se) so the dialog
  // doesn't even open when the editor isn't VERIFIED.
  const { blocked: kycBlocked, kycStatus: gateKycStatus, guard: kycGuard } = useKycGate();
  const router = useRouter();

  // TanStack state
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  // Tracks whether the component is still mounted - fetch callbacks bail out
  // when it's false so we don't setState on an unmounted component.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = (status: string) => {
    setActiveTab(status);
    setLoading(true);
    setRowSelection({});
    setBulkRejectMode(false);
    setBulkRejectNote("");
    fetch(`/api/review?status=${status}`)
      .then((r) => r.json())
      .then((data) => {
        if (!mountedRef.current) return;
        setArticles(data.articles || []);
        setCounts(data.counts || {});
        setLoading(false);
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setLoading(false);
      });
  };

  useEffect(() => {
    load("SUBMITTED");
    // load is stable enough - only fired once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fire a red KYC toast and abort. Centralised so doAction + doBulkAction
  // both short-circuit identically when the editor isn't VERIFIED yet.
  const fireKycToast = () => {
    toast.error("Your KYC must be verified to review articles.", {
      description:
        gateKycStatus === "SUBMITTED"
          ? "Documents are under review - usually verified within 24 hours."
          : gateKycStatus === "REJECTED"
            ? "Your last submission was rejected. Re-upload from the KYC page."
            : "Upload your documents from the KYC page to unlock editorial actions.",
      action: { label: "Complete KYC", onClick: () => router.push("/onboarding/kyc") },
      duration: 8000,
    });
  };

  const doAction = async (
    articleId: string,
    action: string,
    extras?: { note?: string; paymentAmount?: number },
  ) => {
    if (kycBlocked) { fireKycToast(); return undefined; }
    setActionLoading(articleId);
    const res = await fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId, action, note: extras?.note, paymentAmount: extras?.paymentAmount }),
    });
    setActionLoading(null);
    setRejectArticleId(null);
    setRejectNote("");
    load(activeTab);
    return res;
  };

  // Fire the same workflow action for every selected row in parallel.
  const doBulkAction = async (
    action: string,
    extras?: { note?: string; paymentAmount?: number },
  ) => {
    if (kycBlocked) { fireKycToast(); return; }
    const ids = Object.keys(rowSelection)
      .map((id) => articles.find((a) => a.id === id))
      .filter((a): a is Article => !!a)
      .map((a) => a.id);
    if (ids.length === 0) return;
    setBulkRunning(true);
    await Promise.all(
      ids.map((id) =>
        fetch("/api/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            articleId: id,
            action,
            note: extras?.note,
            paymentAmount: extras?.paymentAmount,
          }),
        }),
      ),
    );
    setBulkRunning(false);
    setRowSelection({});
    setBulkRejectMode(false);
    setBulkRejectNote("");
    load(activeTab);
  };

  // Open the payment modal - entry point for both per-row and bulk Review.
  const openReviewModal = (target: ReviewTarget) => {
    setReviewTarget(target);
    setReviewAmount("");
    setReviewNote("");
    setReviewError(null);
  };

  // Submit handler for the payment modal. Validates the amount, then fires
  // the appropriate single or bulk API call with paymentAmount included.
  const submitReviewModal = async () => {
    if (!reviewTarget) return;
    const amount = Number(reviewAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      setReviewError("Enter a valid amount (₹0 or more)");
      return;
    }
    setReviewError(null);
    setReviewSubmitting(true);
    try {
      if (reviewTarget.mode === "single") {
        const res = await doAction(reviewTarget.articleId, "review", {
          paymentAmount: amount,
          note: reviewNote || undefined,
        });
        if (res && !res.ok) {
          const j = await res.json().catch(() => ({}));
          setReviewError(j.error || `Failed (${res.status})`);
          return;
        }
      } else {
        await doBulkAction("review", {
          paymentAmount: amount,
          note: reviewNote || undefined,
        });
      }
      setReviewTarget(null);
    } finally {
      setReviewSubmitting(false);
    }
  };

  // Submit handler for the Return-to-SE modal. Note is mandatory - the SE
  // needs to know WHY it came back. Single fires doAction; bulk fans out via
  // doBulkAction, mirroring the review-modal shape.
  const submitReturnModal = async () => {
    if (!returnTarget) return;
    const trimmed = returnNote.trim();
    if (!trimmed) {
      setReturnError("Note is required so the sub-editor knows what to fix");
      return;
    }
    setReturnError(null);
    setReturnSubmitting(true);
    try {
      if (returnTarget.mode === "single") {
        const res = await doAction(returnTarget.articleId, "return-to-se", {
          note: trimmed,
        });
        if (res && !res.ok) {
          const j = await res.json().catch(() => ({}));
          setReturnError(j.error || `Failed (${res.status})`);
          return;
        }
      } else {
        await doBulkAction("return-to-se", { note: trimmed });
      }
      setReturnTarget(null);
    } finally {
      setReturnSubmitting(false);
    }
  };

  // Per-row actions (same logic as before, used inside the cell renderer).
  const getActions = (article: Article): ActionDef[] => {
    const actions: ActionDef[] = [];
    if (article.status === "SUBMITTED" && ["SUB_EDITOR", "EDITOR", "ADMIN"].includes(role)) {
      actions.push({ label: "Review", action: "review", color: "#1d4ed8", bg: "#dbeafe" });
      actions.push({ label: "Reject", action: "reject", color: "#dc2626", bg: "#fef2f2" });
    }
    if (article.status === "IN_REVIEW") {
      if (["EDITOR", "ADMIN"].includes(role)) {
        actions.push({ label: "Approve", action: "approve", color: "#16a34a", bg: "#dcfce7" });
        actions.push({ label: "Publish", action: "publish", color: "#fff", bg: "#FF2C2C" });
        // Editor-only escape hatch when a SE made a mistake - send it back to
        // them with a note. Not exposed to SE (they can't return to themselves).
        actions.push({ label: "Return to SE", action: "return-to-se", color: "#92400e", bg: "#fef3c7" });
      }
      if (["SUB_EDITOR", "EDITOR", "ADMIN"].includes(role)) {
        actions.push({ label: "Reject", action: "reject", color: "#dc2626", bg: "#fef2f2" });
      }
    }
    if (article.status === "APPROVED" && ["EDITOR", "ADMIN"].includes(role)) {
      actions.push({ label: "Publish", action: "publish", color: "#fff", bg: "#FF2C2C" });
    }
    if (article.status === "REJECTED" || article.status === "DRAFT") {
      actions.push({
        label: article.status === "REJECTED" ? "Re-submit" : "Submit for Review",
        action: "submit",
        color: "#f59e0b",
        bg: "#fef3c7",
      });
    }
    return actions;
  };

  // Unique categories + reporters in current data, used by the filter dropdowns.
  const uniqueCategories = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of articles) if (a.category) m.set(a.category.nameEn, a.category.name);
    return Array.from(m.entries()).map(([value, label]) => ({ value, label }));
  }, [articles]);

  const uniqueReporters = useMemo(() => {
    return Array.from(new Set(articles.map((a) => a.author?.name).filter(Boolean) as string[])).map((n) => ({ value: n, label: n }));
  }, [articles]);

  const columns = useMemo<ColumnDef<Article>[]>(
    () => [
      // Bulk-select checkbox column
      {
        id: "select",
        enableSorting: false,
        enableColumnFilter: false,
        size: 32,
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected()
                ? true
                : table.getIsSomePageRowsSelected()
                ? "indeterminate"
                : false
            }
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            aria-label="Select row"
          />
        ),
      },
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <KycGatedLink
              href={`/content/${row.original.id}`}
              style={{ fontSize: 14, fontWeight: 700, color: "#111", textDecoration: "none" }}
              action="edit articles"
            >
              {row.original.title}
            </KycGatedLink>
            {row.original.editorNote ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditorNoteModalArticle(row.original);
                }}
                className="inline-flex items-center gap-1.5 self-start rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 hover:bg-amber-100 transition-colors"
                title="Editor sent this back for re-review"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9" />
                  <polyline points="3 4 3 10 9 10" />
                </svg>
                Returned by editor - view note
              </button>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "category.nameEn",
        id: "category",
        header: "Category",
        cell: ({ row }) => {
          const c = row.original.category;
          if (!c) return <span style={{ fontSize: 11, color: "#aaa" }}>—</span>;
          return (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#fff",
                background: c.color,
                padding: "2px 8px",
                borderRadius: 4,
              }}
            >
              {c.nameEn}
            </span>
          );
        },
        filterFn: (row, _id, value) => {
          if (!value) return true;
          return row.original.category?.nameEn === value;
        },
      },
      {
        accessorKey: "author.name",
        id: "author",
        header: "Reporter",
        cell: ({ row }) => (
          <span style={{ fontSize: 12, color: "#555" }}>{row.original.author?.name ?? "—"}</span>
        ),
        filterFn: (row, _id, value) => {
          if (!value) return true;
          return row.original.author?.name === value;
        },
      },
      {
        id: "assigned",
        header: "Assigned",
        enableSorting: false,
        cell: ({ row }) => {
          const reviewer = row.original.assignedReviewer;
          // Pool = no assignment yet, anyone in the category can claim.
          if (!reviewer) {
            return (
              <span style={{
                fontSize: 10, fontWeight: 700, color: "#6b7280",
                backgroundColor: "#f3f4f6", padding: "2px 7px", borderRadius: 4,
                textTransform: "uppercase", letterSpacing: 0.3,
              }}>
                Pool
              </span>
            );
          }
          // Highlight "Me" so the sub-editor instantly sees their own queue.
          const isMine = currentUserId && reviewer.id === currentUserId;
          return (
            <span style={{
              fontSize: 11,
              fontWeight: isMine ? 800 : 600,
              color: isMine ? "#166534" : "#555",
              backgroundColor: isMine ? "#dcfce7" : "transparent",
              padding: isMine ? "2px 7px" : 0,
              borderRadius: 4,
            }}>
              {isMine ? "Me" : reviewer.name}
            </span>
          );
        },
      },
      {
        // Reason column - only meaningful for REJECTED rows. For everything
        // else we render a muted dash so the column has the same width across
        // tabs and doesn't shift layout on tab switch.
        id: "reason",
        header: "Reason",
        enableSorting: false,
        enableColumnFilter: false,
        cell: ({ row }) => {
          const a = row.original;
          if (a.status !== "REJECTED" || !a.rejectionNote) {
            return <span style={{ fontSize: 12, color: "#cbd5e1" }}>-</span>;
          }
          return (
            <button
              type="button"
              onClick={() => setReasonModalArticle(a)}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              View reason
            </button>
          );
        },
      },
      {
        accessorKey: "createdAt",
        header: "Submitted",
        cell: ({ row }) => (
          <span style={{ fontSize: 12, color: "#888" }}>
            {new Date(row.original.createdAt).toLocaleDateString()}
          </span>
        ),
        sortingFn: "datetime",
      },
      {
        id: "actions",
        header: () => <div style={{ textAlign: "right" }}>Actions</div>,
        enableSorting: false,
        enableColumnFilter: false,
        cell: ({ row }) => {
          const a = row.original;
          return (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <KycGatedLink
                href={`/content/${a.id}`}
                style={{
                  padding: "4px 10px",
                  background: "#eff6ff",
                  color: "#2563eb",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
                action="edit articles"
              >
                Edit
              </KycGatedLink>
              {getActions(a).map((act) =>
                act.action === "reject" ? (
                  <button
                    key={act.action}
                    // Modal opener - gate so the reject dialog doesn't pop
                    // for an editor who can't actually submit it.
                    onClick={kycGuard("reject articles", () => setRejectArticleId(a.id))}
                    style={{
                      padding: "4px 10px",
                      background: act.bg,
                      color: act.color,
                      border: "none",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {act.label}
                  </button>
                ) : (
                  <button
                    key={act.action}
                    onClick={kycGuard(
                      act.action === "review"
                        ? "publish articles"
                        : act.action === "return-to-se"
                          ? "return articles"
                          : `${act.action} articles`,
                      () => {
                        if (act.action === "review") {
                          openReviewModal({ mode: "single", articleId: a.id, articleTitle: a.title });
                        } else if (act.action === "return-to-se") {
                          setReturnTarget({ mode: "single", articleId: a.id, articleTitle: a.title });
                          setReturnNote("");
                          setReturnError(null);
                        } else {
                          doAction(a.id, act.action);
                        }
                      },
                    )}
                    disabled={actionLoading === a.id}
                    style={{
                      padding: "4px 10px",
                      background: act.bg,
                      color: act.color,
                      border: "none",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {actionLoading === a.id ? "..." : act.label}
                  </button>
                ),
              )}
            </div>
          );
        },
      },
    ],
    [role, actionLoading],
  );

  const table = useReactTable({
    data: articles,
    columns,
    state: { sorting, globalFilter, columnFilters, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
    enableRowSelection: true,
    // React 19 flags setState during render as "update on a not-yet-mounted
    // component". TanStack's defaults reset page/expansion DURING the
    // pagination row-model build - disable those auto-resets and instead
    // reset pageIndex manually from useEffect (below) whenever filters/data
    // could push the user past the last page.
    autoResetPageIndex: false,
    autoResetExpanded: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  // Manually reset to page 1 when the data shape or filters change so the
  // user never lands on an out-of-range page.
  useEffect(() => {
    table.setPageIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articles, columnFilters, globalFilter]);

  const selectedCount = Object.keys(rowSelection).length;
  const tabBulkActions = bulkActionsFor(activeTab, role);

  // Selected categoryFilter value, or "all" sentinel.
  const categoryFilterValue =
    (columnFilters.find((f) => f.id === "category")?.value as string | undefined) ?? "all";
  const reporterFilterValue =
    (columnFilters.find((f) => f.id === "author")?.value as string | undefined) ?? "all";

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111", marginBottom: 4 }}>Review Queue</h1>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>
          Editorial workflow - review, approve, publish articles
        </p>

        {/* Status Tabs */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          {statusTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setGlobalFilter("");
                setColumnFilters([]);
                load(tab.key);
              }}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "none",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                background: activeTab === tab.key ? tab.color : "#fff",
                color: activeTab === tab.key ? "#fff" : "#555",
                boxShadow: activeTab === tab.key ? "none" : "0 1px 2px rgba(0,0,0,0.06)",
              }}
            >
              {tab.label} ({counts[tab.key] || 0})
            </button>
          ))}
        </div>

        {/* Toolbar: search + category/reporter filters + refresh + new */}
        <div className="mb-3 flex flex-wrap items-center gap-3">
          {/* Search - leading filter icon + clear button, matches /content, /journalists, /users. */}
          <div className="relative">
            <Input
              aria-label="Search title, reporter or category"
              className={cn("peer min-w-60 bg-white ps-9", globalFilter && "pe-9")}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="Search title, reporter, category..."
              type="text"
              value={globalFilter}
            />
            <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-muted-foreground/80">
              <ListFilterIcon aria-hidden="true" size={16} />
            </div>
            {globalFilter && (
              <button
                aria-label="Clear filter"
                className="absolute inset-y-0 end-0 flex h-full w-9 items-center justify-center rounded-e-md text-muted-foreground/80 outline-none transition-colors hover:text-foreground"
                onClick={() => setGlobalFilter("")}
                type="button"
              >
                <CircleXIcon aria-hidden="true" size={16} />
              </button>
            )}
          </div>

          <Select
            value={categoryFilterValue}
            onValueChange={(v) =>
              table.getColumn("category")?.setFilterValue(v === "all" ? undefined : v)
            }
          >
            <SelectTrigger className="w-[180px] bg-white">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {uniqueCategories.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label} ({c.value})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={reporterFilterValue}
            onValueChange={(v) =>
              table.getColumn("author")?.setFilterValue(v === "all" ? undefined : v)
            }
          >
            <SelectTrigger className="w-[180px] bg-white">
              <SelectValue placeholder="All reporters" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All reporters</SelectItem>
              {uniqueReporters.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Right-aligned actions: refresh + new article. */}
          <div className="ms-auto flex items-center gap-2">
            <Button
              aria-label="Refresh queue"
              title="Refresh"
              variant="outline"
              size="icon"
              disabled={loading}
              onClick={() => load(activeTab)}
            >
              <RefreshCwIcon
                size={16}
                className={cn("opacity-70", loading && "animate-spin")}
              />
            </Button>
            <KycGatedLink href="/content/new" action="create articles">
              <Button>
                <PlusIcon aria-hidden="true" className="-ms-1 opacity-90" size={16} />
                New Article
              </Button>
            </KycGatedLink>
          </div>
        </div>

        {/* Bulk actions toolbar - only visible when ≥1 row selected */}
        {selectedCount > 0 && (
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
              padding: "10px 14px",
              marginBottom: 12,
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: 8,
            }}
          >
            {/* Bulk action labels carry the count, so no standalone "N selected"
                pill is needed. Un-tick the header checkbox (or any row) to clear. */}
            {tabBulkActions.map((act) => {
              if (act.action === "reject") {
                return (
                  <Button
                    key={act.action}
                    size="sm"
                    variant="destructive"
                    onClick={kycGuard("reject articles", () => setBulkRejectMode(true))}
                    disabled={bulkRunning}
                  >
                    Reject {selectedCount}
                  </Button>
                );
              }
              if (act.action === "review") {
                // "Review" now requires the sub-editor to set a payment
                // amount up-front. Open the modal instead of firing directly.
                return (
                  <Button
                    key={act.action}
                    size="sm"
                    onClick={kycGuard("publish articles", () => openReviewModal({ mode: "bulk", count: selectedCount }))}
                    disabled={bulkRunning}
                    style={{ background: act.bg, color: act.color }}
                  >
                    {bulkRunning ? "..." : `${act.label} ${selectedCount}`}
                  </Button>
                );
              }
              if (act.action === "return-to-se") {
                // Same shape as review - bounce-with-note modal first, then
                // fire the bulk action with the editor's note attached.
                return (
                  <Button
                    key={act.action}
                    size="sm"
                    onClick={kycGuard("return articles", () => {
                      setReturnTarget({ mode: "bulk", count: selectedCount });
                      setReturnNote("");
                      setReturnError(null);
                    })}
                    disabled={bulkRunning}
                    style={{ background: act.bg, color: act.color }}
                  >
                    {bulkRunning ? "..." : `${act.label} ${selectedCount}`}
                  </Button>
                );
              }
              return (
                <Button
                  key={act.action}
                  size="sm"
                  onClick={() => doBulkAction(act.action)}
                  disabled={bulkRunning}
                  style={{ background: act.bg, color: act.color }}
                >
                  {bulkRunning ? "..." : `${act.label} ${selectedCount}`}
                </Button>
              );
            })}
            {/* Inline bulk reject note input */}
            {bulkRejectMode && (
              <div style={{ display: "flex", gap: 6, flexBasis: "100%", marginTop: 8 }}>
                <Input
                  value={bulkRejectNote}
                  onChange={(e) => setBulkRejectNote(e.target.value)}
                  placeholder={`Rejection reason for ${selectedCount} articles...`}
                  className="flex-1"
                />
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => doBulkAction("reject", { note: bulkRejectNote })}
                  disabled={bulkRunning}
                >
                  Reject {selectedCount}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBulkRejectMode(false);
                    setBulkRejectNote("");
                  }}
                  disabled={bulkRunning}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}

        {/* TanStack-powered table */}
        <div
          style={{
            background: "#fff",
            borderRadius: 10,
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            overflow: "hidden",
          }}
        >
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((header) => {
                    if (header.isPlaceholder) {
                      return (
                        <TableHead
                          key={header.id}
                          style={{ width: header.column.id === "select" ? 32 : undefined }}
                        />
                      );
                    }
                    const canSort = header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    const content = flexRender(header.column.columnDef.header, header.getContext());
                    return (
                      <TableHead
                        key={header.id}
                        style={{ width: header.column.id === "select" ? 32 : undefined }}
                      >
                        {/* Non-sortable headers render the raw content - e.g. the
                            select-column header is itself a <Checkbox> (which is a
                            <button>), so wrapping it in another <button> would
                            nest interactive elements and crash hydration. */}
                        {canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              background: "none",
                              border: "none",
                              padding: 0,
                              font: "inherit",
                              color: "inherit",
                              cursor: "pointer",
                            }}
                          >
                            {content}
                            {sorted === "asc" && <span>▲</span>}
                            {sorted === "desc" && <span>▼</span>}
                          </button>
                        ) : (
                          content
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={columns.length} style={{ textAlign: "center", padding: 40, color: "#aaa" }}>
                    Loading...
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} style={{ textAlign: "center", padding: 40, color: "#aaa" }}>
                    No articles in this queue
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <Fragment key={row.id}>
                    <TableRow data-state={row.getIsSelected() ? "selected" : undefined}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>

                    {/* Rejection note moved out of the table - now opened from
                        the "Reason" column's View-reason button into a modal. */}

                    {rejectArticleId === row.original.id && (
                      <TableRow>
                        <TableCell colSpan={columns.length} style={{ padding: "0 16px 12px" }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <Input
                              value={rejectNote}
                              onChange={(e) => setRejectNote(e.target.value)}
                              placeholder="Rejection reason / feedback for reporter..."
                              className="flex-1 min-w-[200px]"
                            />
                            <Button
                              onClick={() => doAction(row.original.id, "reject", { note: rejectNote })}
                              variant="destructive"
                            >
                              Reject
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setRejectArticleId(null);
                                setRejectNote("");
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination footer */}
          {!loading && articles.length > 0 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 16px",
                borderTop: "1px solid #f3f4f6",
                fontSize: 12,
                color: "#666",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <span>
                Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Rejection-reason modal - opens from the "Reason" column's
          View-reason button on REJECTED rows. Read-only; the reporter sees
          the same note in their app via /api/reporter/articles. */}
      <Dialog
        open={!!reasonModalArticle}
        onOpenChange={(open) => { if (!open) setReasonModalArticle(null); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span
                className="inline-flex h-7 w-7 items-center justify-center rounded-full"
                style={{ background: "#dc2626", color: "#fff" }}
                aria-hidden
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </span>
              Rejection reason
            </DialogTitle>
            <DialogDescription>
              Feedback shown to the reporter so they can fix and resubmit.
            </DialogDescription>
          </DialogHeader>
          {reasonModalArticle && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/40 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-0.5">Article</p>
                <p className="text-sm font-semibold text-foreground break-words">{reasonModalArticle.title}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {reasonModalArticle.category?.nameEn || "-"} · by {reasonModalArticle.author?.name || "-"}
                </p>
              </div>
              <div className="rounded-md border border-red-200 bg-red-50/70 px-3.5 py-3">
                <p className="text-[11px] uppercase tracking-wide font-bold text-red-700 mb-1">Note</p>
                <p className="text-sm leading-relaxed text-red-900/90 break-words italic">
                  <span className="text-red-300 mr-1">“</span>
                  {reasonModalArticle.rejectionNote}
                  <span className="text-red-300 ml-1">”</span>
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonModalArticle(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment modal - opens when the sub-editor clicks "Review" on a row
          or "Review N" in the bulk bar. Their input becomes the article's
          ContentPayment.baseAmount, reporter sees it as "Pending" instantly. */}
      <Dialog
        open={!!reviewTarget}
        onOpenChange={(open) => {
          if (!open && !reviewSubmitting) setReviewTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set payment & send to review</DialogTitle>
            <DialogDescription>
              {reviewTarget?.mode === "single"
                ? <>For <span className="font-semibold">&ldquo;{reviewTarget.articleTitle}&rdquo;</span>. The reporter will see this amount in their Pending Payments.</>
                : reviewTarget?.mode === "bulk"
                ? `Applies the SAME amount to ${reviewTarget.count} articles. For different amounts per article, review one at a time.`
                : null}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Surface the editor's return note inline - the SE shouldn't
                need to close this modal and click the badge to read it. Only
                visible in single mode (bulk could mix bounced + fresh rows). */}
            {reviewTarget?.mode === "single" && (() => {
              const row = articles.find((a) => a.id === reviewTarget.articleId);
              if (!row?.editorNote) return null;
              return (
                <div className="rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide font-bold text-amber-700 mb-1">Editor returned this - please address</p>
                  <p className="text-sm leading-relaxed text-amber-900/90 italic break-words">
                    “{row.editorNote}”
                  </p>
                </div>
              );
            })()}
            <div className="space-y-1.5">
              <Label htmlFor="review-amount">Amount (₹)</Label>
              <Input
                id="review-amount"
                type="number"
                inputMode="numeric"
                min={0}
                step="1"
                value={reviewAmount}
                onChange={(e) => { setReviewAmount(e.target.value); if (reviewError) setReviewError(null); }}
                placeholder="e.g. 500"
                aria-invalid={!!reviewError}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="review-note">Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="review-note"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="Any context for the editor / reporter"
              />
            </div>
            {reviewError && <p className="text-xs text-destructive">{reviewError}</p>}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReviewTarget(null)}
              disabled={reviewSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitReviewModal}
              disabled={reviewSubmitting}
            >
              {reviewSubmitting ? "Saving..." : "OK & Send to Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return-to-SE modal - Editor/Admin only. Note is mandatory; the SE
          sees it as a badge in their SUBMITTED queue and can read the full
          message before re-claiming. */}
      <Dialog
        open={!!returnTarget}
        onOpenChange={(open) => {
          if (!open && !returnSubmitting) setReturnTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return to sub-editor</DialogTitle>
            <DialogDescription>
              {returnTarget?.mode === "single"
                ? <>Bounce <span className="font-semibold">&ldquo;{returnTarget.articleTitle}&rdquo;</span> back to the sub-editor with a note. Status reverts to Submitted; payment stays as-is so they can adjust on re-claim.</>
                : returnTarget?.mode === "bulk"
                ? `Apply the SAME note to ${returnTarget.count} articles. Each one reverts to Submitted.`
                : null}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="return-note">Note <span className="text-destructive">*</span></Label>
              <textarea
                id="return-note"
                value={returnNote}
                onChange={(e) => { setReturnNote(e.target.value); if (returnError) setReturnError(null); }}
                placeholder="What does the sub-editor need to fix?"
                rows={4}
                aria-invalid={!!returnError}
                autoFocus
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:border-destructive aria-invalid:ring-destructive/20"
              />
            </div>
            {returnError && <p className="text-xs text-destructive">{returnError}</p>}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReturnTarget(null)}
              disabled={returnSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitReturnModal}
              disabled={returnSubmitting}
              style={{ background: "#92400e", color: "#fff" }}
            >
              {returnSubmitting ? "Sending..." : "Send back to SE"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editor-note viewer - opens from the orange "View note" badge on
          SUBMITTED rows that the Editor bounced back. Read-only. */}
      <Dialog
        open={!!editorNoteModalArticle}
        onOpenChange={(open) => { if (!open) setEditorNoteModalArticle(null); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span
                className="inline-flex h-7 w-7 items-center justify-center rounded-full"
                style={{ background: "#92400e", color: "#fff" }}
                aria-hidden
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9" />
                  <polyline points="3 4 3 10 9 10" />
                </svg>
              </span>
              Returned by editor
            </DialogTitle>
            <DialogDescription>
              The editor sent this back for re-review. Address the feedback, then click Review again to push it back.
            </DialogDescription>
          </DialogHeader>
          {editorNoteModalArticle && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/40 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-0.5">Article</p>
                <p className="text-sm font-semibold text-foreground break-words">{editorNoteModalArticle.title}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {editorNoteModalArticle.category?.nameEn || "-"} · by {editorNoteModalArticle.author?.name || "-"}
                </p>
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50/70 px-3.5 py-3">
                <p className="text-[11px] uppercase tracking-wide font-bold text-amber-700 mb-1">Editor note</p>
                <p className="text-sm leading-relaxed text-amber-900/90 break-words italic">
                  <span className="text-amber-300 mr-1">“</span>
                  {editorNoteModalArticle.editorNote}
                  <span className="text-amber-300 ml-1">”</span>
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorNoteModalArticle(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
