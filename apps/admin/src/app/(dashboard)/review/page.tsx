"use client";

import { Fragment, useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/sidebar";
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

interface Article {
  id: string;
  title: string;
  slug: string;
  status: string;
  createdAt: string;
  rejectionNote?: string;
  category: { name: string; nameEn: string; color: string };
  author: { name: string };
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
  const [articles, setArticles] = useState<Article[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState("SUBMITTED");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejectArticleId, setRejectArticleId] = useState<string | null>(null);

  // Bulk state
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [bulkRejectMode, setBulkRejectMode] = useState(false);
  const [bulkRejectNote, setBulkRejectNote] = useState("");
  const [bulkRunning, setBulkRunning] = useState(false);

  // TanStack state
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  // Tracks whether the component is still mounted — fetch callbacks bail out
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
    // load is stable enough — only fired once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Fire the same workflow action for every selected row in parallel.
  const doBulkAction = async (action: string, note?: string) => {
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
          body: JSON.stringify({ articleId: id, action, note }),
        }),
      ),
    );
    setBulkRunning(false);
    setRowSelection({});
    setBulkRejectMode(false);
    setBulkRejectNote("");
    load(activeTab);
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
    for (const a of articles) m.set(a.category.nameEn, a.category.name);
    return Array.from(m.entries()).map(([value, label]) => ({ value, label }));
  }, [articles]);

  const uniqueReporters = useMemo(() => {
    return Array.from(new Set(articles.map((a) => a.author.name))).map((n) => ({ value: n, label: n }));
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
          <Link
            href={`/articles/${row.original.id}`}
            style={{ fontSize: 14, fontWeight: 700, color: "#111", textDecoration: "none" }}
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        accessorKey: "category.nameEn",
        id: "category",
        header: "Category",
        cell: ({ row }) => {
          const c = row.original.category;
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
          return row.original.category.nameEn === value;
        },
      },
      {
        accessorKey: "author.name",
        id: "author",
        header: "Reporter",
        cell: ({ row }) => (
          <span style={{ fontSize: 12, color: "#555" }}>{row.original.author.name}</span>
        ),
        filterFn: (row, _id, value) => {
          if (!value) return true;
          return row.original.author.name === value;
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
              <Link
                href={`/articles/${a.id}`}
                style={{
                  padding: "4px 10px",
                  background: "#eff6ff",
                  color: "#2563eb",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Edit
              </Link>
              {getActions(a).map((act) =>
                act.action === "reject" ? (
                  <button
                    key={act.action}
                    onClick={() => setRejectArticleId(a.id)}
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
                    onClick={() => doAction(a.id, act.action)}
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
    // pagination row-model build — disable those auto-resets and instead
    // reset pageIndex manually from useEffect (below) whenever filters/data
    // could push the user past the last page.
    autoResetPageIndex: false,
    autoResetExpanded: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
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
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111", marginBottom: 4 }}>Review Queue</h1>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>
          Editorial workflow — review, approve, publish articles
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

        {/* Toolbar: search + category/reporter filters + result counter */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <Input
            placeholder="Search title, reporter, category..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="max-w-xs"
          />
          <Select
            value={categoryFilterValue}
            onValueChange={(v) =>
              table.getColumn("category")?.setFilterValue(v === "all" ? undefined : v)
            }
          >
            <SelectTrigger className="w-[180px]">
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
            <SelectTrigger className="w-[180px]">
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
          <span style={{ fontSize: 12, color: "#888", marginLeft: "auto" }}>
            {table.getFilteredRowModel().rows.length} of {articles.length} articles
          </span>
        </div>

        {/* Bulk actions toolbar — only visible when ≥1 row selected */}
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
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1d4ed8" }}>
              {selectedCount} selected
            </span>
            {tabBulkActions.map((act) =>
              act.action === "reject" ? (
                <Button
                  key={act.action}
                  size="sm"
                  variant="destructive"
                  onClick={() => setBulkRejectMode(true)}
                  disabled={bulkRunning}
                >
                  Reject {selectedCount}
                </Button>
              ) : (
                <Button
                  key={act.action}
                  size="sm"
                  onClick={() => doBulkAction(act.action)}
                  disabled={bulkRunning}
                  style={{ background: act.bg, color: act.color }}
                >
                  {bulkRunning ? "..." : `${act.label} ${selectedCount}`}
                </Button>
              ),
            )}
            <Button size="sm" variant="ghost" onClick={() => setRowSelection({})} disabled={bulkRunning}>
              Clear
            </Button>

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
                  onClick={() => doBulkAction("reject", bulkRejectNote)}
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
                        {/* Non-sortable headers render the raw content — e.g. the
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

                    {row.original.rejectionNote && row.original.status === "REJECTED" && (
                      <TableRow>
                        <TableCell colSpan={columns.length} style={{ padding: "0 16px 12px" }}>
                          <div
                            style={{
                              padding: "8px 12px",
                              background: "#fef2f2",
                              borderRadius: 6,
                              borderLeft: "3px solid #dc2626",
                            }}
                          >
                            <p style={{ fontSize: 11, fontWeight: 700, color: "#dc2626" }}>Rejection Note:</p>
                            <p style={{ fontSize: 12, color: "#666" }}>{row.original.rejectionNote}</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}

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
                              onClick={() => doAction(row.original.id, "reject", rejectNote)}
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
    </div>
  );
}
