// /content — unified content list (Spec #1 #114). Replaces /articles, /videos,
// /reels, /stories, /gallery, /cartoons, /breaking-news, /news-feed list pages.
//
// Table chrome mirrors the /journalists page — TanStack React Table + shadcn
// Table/Pagination/Popover/DropdownMenu — but pagination/filtering stay
// server-side because the catalogue is large (manualPagination: true). The
// API currently has no sort param so column sorting is disabled; the chip
// row at the top filters by ContentType and is unique to this page.
"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type PaginationState,
  type RowSelectionState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleXIcon,
  Columns3Icon,
  EllipsisIcon,
  FilterIcon,
  ListFilterIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
} from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { AutoFetchModal } from "@/components/auto-fetch-modal";
import { Sidebar } from "@/components/sidebar";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WithTooltip } from "@/components/ui/tooltip";

// Color per ContentType for badge backgrounds. Picked to match the front-end
// section colors (cinema = pink, sports = green, etc.) so a journalist's
// mental model carries from the public site to the editor.
const TYPE_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  ARTICLE: { bg: "#fee2e2", fg: "#991b1b", label: "Article" },
  VIDEO: { bg: "#dbeafe", fg: "#1e40af", label: "Video" },
  REEL: { bg: "#dcfce7", fg: "#166534", label: "Reel" },
  WEB_STORY: { bg: "#fef3c7", fg: "#92400e", label: "Story" },
  PHOTO_GALLERY: { bg: "#f3e8ff", fg: "#6b21a8", label: "Photos" },
  CARTOON: { bg: "#fce7f3", fg: "#9d174d", label: "Cartoon" },
  BREAKING_NEWS: { bg: "#fef2f2", fg: "#7f1d1d", label: "Breaking" },
};

const TYPE_ORDER = ["", "ARTICLE", "VIDEO", "REEL", "WEB_STORY", "PHOTO_GALLERY", "CARTOON", "BREAKING_NEWS"];

const STATUS_BADGE: Record<string, string> = {
  PUBLISHED: "bg-green-100 text-green-700 border-green-200",
  SCHEDULED: "bg-violet-100 text-violet-700 border-violet-200",
  DRAFT: "bg-amber-100 text-amber-700 border-amber-200",
  SUBMITTED: "bg-blue-100 text-blue-700 border-blue-200",
  IN_REVIEW: "bg-blue-100 text-blue-700 border-blue-200",
  APPROVED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  REJECTED: "bg-red-100 text-red-700 border-red-200",
  ARCHIVED: "bg-slate-100 text-slate-600 border-slate-200",
};

const STATUS_OPTIONS = [
  "PUBLISHED",
  "SCHEDULED",
  "DRAFT",
  "SUBMITTED",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "ARCHIVED",
];

interface ContentRow {
  id: string;
  type: string;
  title: string;
  slug: string | null;
  status: string;
  featured: boolean;
  viewCount: number;
  publishedAt: string | null;
  scheduledAt: string | null;
  createdAt: string;
  authorId: string;
  category: { name: string; nameEn: string; color: string } | null;
  author: { name: string };
}

interface CategoryOpt {
  id: string;
  nameEn: string;
  color?: string;
}

export default function ContentListPage() {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // Role gate for the Delete action — mirrors /api/content/[id] DELETE rules:
  //   ADMIN: anything
  //   REPORTER: own rows + DRAFT/SUBMITTED only
  //   SUB_EDITOR / EDITOR: DRAFT/SUBMITTED only
  // Server is the authority; this just keeps the chrome honest so users don't
  // see a button that always errors.
  const { data: session } = useSession();
  const role = (session?.user as any)?.role || "REPORTER";
  const currentUserId = (session?.user as any)?.id as string | undefined;
  const canDelete = useCallback((row: ContentRow): boolean => {
    if (role === "ADMIN") return true;
    if (role === "REPORTER") {
      return row.authorId === currentUserId && (row.status === "DRAFT" || row.status === "SUBMITTED");
    }
    return row.status === "DRAFT" || row.status === "SUBMITTED";
  }, [role, currentUserId]);

  // ─── data + filter state (server-driven) ────────────────────────────────
  const [rows, setRows] = useState<ContentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [categories, setCategories] = useState<CategoryOpt[]>([]);

  // Persist page-size selection to localStorage so it sticks across visits.
  const [pagination, setPagination] = useState<PaginationState>(() => {
    if (typeof window === "undefined") return { pageIndex: 0, pageSize: 15 };
    const stored = parseInt(window.localStorage.getItem("contentListLimit") || "");
    const ps = [10, 15, 25, 50, 100].includes(stored) ? stored : 15;
    return { pageIndex: 0, pageSize: ps };
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("contentListLimit", String(pagination.pageSize));
    }
  }, [pagination.pageSize]);

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [bulkLoading, setBulkLoading] = useState(false);
  const [autoFetchOpen, setAutoFetchOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ContentRow[] | null>(null);

  // Reset to page 0 whenever a filter changes — otherwise we'd keep page=3
  // while the underlying result set just shrunk to 1 page.
  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [search, typeFilter, statusFilter, categoryFilter]);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setCategories([]));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(pagination.pageIndex + 1),
      limit: String(pagination.pageSize),
    });
    if (search) params.set("search", search);
    if (typeFilter) params.set("type", typeFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (categoryFilter) params.set("category", categoryFilter);

    fetch(`/api/content?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setRows(data.items || []);
        setTotal(data.total || 0);
        setRowSelection({});
      })
      .finally(() => setLoading(false));
  }, [pagination.pageIndex, pagination.pageSize, search, typeFilter, statusFilter, categoryFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / pagination.pageSize));

  // ─── columns ────────────────────────────────────────────────────────────
  const columns = useMemo<ColumnDef<ContentRow>[]>(
    () => [
      {
        id: "select",
        size: 32,
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all"
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label="Select row"
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
          />
        ),
      },
      {
        accessorKey: "type",
        header: "Type",
        size: 100,
        enableSorting: false,
        cell: ({ row }) => {
          const tc = TYPE_COLORS[row.original.type] || { bg: "#eee", fg: "#555", label: row.original.type };
          return (
            <span
              className="inline-block rounded px-2 py-0.5 text-[11px] font-bold"
              style={{ background: tc.bg, color: tc.fg }}
            >
              {tc.label}
            </span>
          );
        },
      },
      {
        accessorKey: "title",
        header: "Title",
        size: 360,
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <Link
            href={`/content/${row.original.id}`}
            className="block max-w-[340px] truncate text-sm font-semibold text-foreground hover:underline"
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        accessorKey: "category",
        header: "Category",
        size: 140,
        enableSorting: false,
        cell: ({ row }) => {
          const c = row.original.category;
          if (!c) return <span className="text-muted-foreground">—</span>;
          return (
            <span
              className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold text-white"
              style={{ background: c.color || "#888" }}
            >
              {c.nameEn}
            </span>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 120,
        enableSorting: false,
        cell: ({ row }) => {
          const s = row.original.status;
          return (
            <Badge variant="outline" className={cn("border text-[11px]", STATUS_BADGE[s] ?? STATUS_BADGE.DRAFT)}>
              {s}
            </Badge>
          );
        },
      },
      {
        accessorKey: "viewCount",
        header: "Views",
        size: 80,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tabular-nums text-sm text-muted-foreground">
            {row.original.viewCount.toLocaleString()}
          </span>
        ),
      },
      {
        id: "date",
        header: "Date",
        size: 140,
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          if (r.status === "SCHEDULED" && r.scheduledAt) {
            return (
              <span className="text-xs text-muted-foreground" title="Scheduled for auto-publish">
                ⏰ {new Date(r.scheduledAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
              </span>
            );
          }
          return (
            <span className="text-xs text-muted-foreground">
              {r.publishedAt ? new Date(r.publishedAt).toLocaleDateString() : "—"}
            </span>
          );
        },
      },
      {
        id: "actions",
        size: 50,
        enableSorting: false,
        enableHiding: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <RowActions
            row={row.original}
            canDelete={canDelete(row.original)}
            onDelete={(r) => setConfirmDelete([r])}
          />
        ),
      },
    ],
    [canDelete],
  );

  // ─── table instance — server-driven, so manualPagination + pageCount ────
  const table = useReactTable({
    data: rows,
    columns,
    pageCount,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    onPaginationChange: setPagination,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: { pagination, columnVisibility, rowSelection },
  });

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);
  const deletableSelected = selectedRows.filter(canDelete);

  // ─── bulk actions ───────────────────────────────────────────────────────
  const handleBulkStatus = async (newStatus: string) => {
    if (selectedRows.length === 0) return;
    setBulkLoading(true);
    try {
      await Promise.all(
        selectedRows.map((r) =>
          fetch(`/api/content/${r.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus }),
          })
        )
      );
      setRows((prev) =>
        prev.map((r) => (rowSelection[r.id] ? { ...r, status: newStatus } : r))
      );
      setRowSelection({});
    } catch {
      alert("Some updates failed");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    setBulkLoading(true);
    try {
      const results = await Promise.all(
        confirmDelete.map((r) => fetch(`/api/content/${r.id}`, { method: "DELETE" }))
      );
      const failed = results.filter((r) => !r.ok).length;
      const succeeded = results.length - failed;
      const ids = new Set(confirmDelete.map((r) => r.id));
      setRows((prev) => prev.filter((r) => !ids.has(r.id)));
      setTotal((t) => t - succeeded);
      setRowSelection({});
      setConfirmDelete(null);
      if (failed > 0) alert(`${succeeded} deleted, ${failed} failed`);
    } catch {
      setConfirmDelete(null);
      alert("Delete failed");
    } finally {
      setBulkLoading(false);
    }
  };

  // ─── render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111", marginBottom: 4 }}>Content</h1>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
          {total} total · 1 list replaces 7
        </p>

        <div className="shadcn-scope space-y-4">
          {/* Type filter chips — unique to /content. Narrows by ContentType. */}
          <div className="flex flex-wrap gap-1.5">
            {TYPE_ORDER.map((t) => {
              const isActive = typeFilter === t;
              const color = t ? TYPE_COLORS[t] : { bg: "#e5e7eb", fg: "#111827", label: "All" };
              return (
                <button
                  key={t || "all"}
                  onClick={() => setTypeFilter(t)}
                  type="button"
                  className="rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors"
                  style={{
                    background: isActive ? color.fg : color.bg,
                    color: isActive ? "#fff" : color.fg,
                    borderColor: isActive ? color.fg : "transparent",
                  }}
                >
                  {color.label}
                </button>
              );
            })}
          </div>

          {/* Filters toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Input
                aria-label="Search by title"
                className={cn("peer min-w-60 ps-9 bg-white", search && "pe-9")}
                id={`${id}-search`}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title..."
                ref={inputRef}
                type="text"
                value={search}
              />
              <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-muted-foreground/80">
                <ListFilterIcon aria-hidden="true" size={16} />
              </div>
              {search && (
                <button
                  aria-label="Clear filter"
                  className="absolute inset-y-0 end-0 flex h-full w-9 items-center justify-center rounded-e-md text-muted-foreground/80 outline-none transition-colors hover:text-foreground"
                  onClick={() => {
                    setSearch("");
                    inputRef.current?.focus();
                  }}
                  type="button"
                >
                  <CircleXIcon aria-hidden="true" size={16} />
                </button>
              )}
            </div>

            {/* Status filter (single-select via popover; API supports one value) */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline">
                  <FilterIcon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
                  Status
                  {statusFilter && (
                    <span className="-me-1 inline-flex h-5 items-center rounded border bg-background px-1 text-[0.625rem] font-medium text-muted-foreground/70">
                      1
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto min-w-44 p-3">
                <div className="space-y-3">
                  <div className="text-xs font-medium text-muted-foreground">Filters</div>
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={!statusFilter}
                        id={`${id}-status-all`}
                        onCheckedChange={() => setStatusFilter("")}
                      />
                      <Label className="cursor-pointer font-normal" htmlFor={`${id}-status-all`}>
                        All
                      </Label>
                    </div>
                    {STATUS_OPTIONS.map((s) => (
                      <div className="flex items-center gap-2" key={s}>
                        <Checkbox
                          checked={statusFilter === s}
                          id={`${id}-status-${s}`}
                          onCheckedChange={(checked) => setStatusFilter(checked ? s : "")}
                        />
                        <Label className="cursor-pointer font-normal" htmlFor={`${id}-status-${s}`}>
                          {s.replace(/_/g, " ")}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Category filter (single-select) */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline">
                  <FilterIcon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
                  Category
                  {categoryFilter && (
                    <span className="-me-1 inline-flex h-5 items-center rounded border bg-background px-1 text-[0.625rem] font-medium text-muted-foreground/70">
                      1
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto min-w-52 max-h-72 overflow-y-auto p-3">
                <div className="space-y-3">
                  <div className="text-xs font-medium text-muted-foreground">Filters</div>
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={!categoryFilter}
                        id={`${id}-cat-all`}
                        onCheckedChange={() => setCategoryFilter("")}
                      />
                      <Label className="cursor-pointer font-normal" htmlFor={`${id}-cat-all`}>
                        All
                      </Label>
                    </div>
                    {categories.map((c) => (
                      <div className="flex items-center gap-2" key={c.id}>
                        <Checkbox
                          checked={categoryFilter === c.id}
                          id={`${id}-cat-${c.id}`}
                          onCheckedChange={(checked) => setCategoryFilter(checked ? c.id : "")}
                        />
                        <Label className="cursor-pointer font-normal" htmlFor={`${id}-cat-${c.id}`}>
                          {c.nameEn}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Column visibility */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Columns3Icon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
                  View
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                {table
                  .getAllColumns()
                  .filter((column) => column.getCanHide())
                  .map((column) => (
                    <DropdownMenuCheckboxItem
                      checked={column.getIsVisible()}
                      className="capitalize"
                      key={column.id}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                      onSelect={(event) => event.preventDefault()}
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="ms-auto flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {total} item{total === 1 ? "" : "s"}
              </span>
              <WithTooltip
                side="bottom"
                text={"Bulk-fetch from NewsData.io, translate to Telugu via Azure OpenAI,\nand save as DRAFT in the review queue."}
              >
                <Button
                  variant="outline"
                  onClick={() => setAutoFetchOpen(true)}
                >
                  <SparklesIcon aria-hidden="true" className="-ms-1 opacity-70" size={16} />
                  Auto-fetch news
                </Button>
              </WithTooltip>
              <Link href="/content/new">
                <Button>
                  <PlusIcon aria-hidden="true" className="-ms-1 opacity-90" size={16} />
                  New Content
                </Button>
              </Link>
            </div>
          </div>

          {/* Bulk action bar — only when rows are selected. */}
          {selectedRows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-2.5">
              <span className="text-sm font-bold text-blue-700">
                {selectedRows.length} selected
              </span>
              <div className="flex-1" />
              <Button
                size="sm"
                variant="outline"
                className="border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                disabled={bulkLoading}
                onClick={() => handleBulkStatus("PUBLISHED")}
              >
                Publish
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                disabled={bulkLoading}
                onClick={() => handleBulkStatus("DRAFT")}
              >
                Unpublish
              </Button>
              {deletableSelected.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                  disabled={bulkLoading}
                  onClick={() => setConfirmDelete(deletableSelected)}
                >
                  <TrashIcon aria-hidden="true" className="-ms-1 opacity-70" size={14} />
                  {deletableSelected.length === selectedRows.length
                    ? `Delete ${selectedRows.length}`
                    : `Delete ${deletableSelected.length} of ${selectedRows.length}`}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setRowSelection({})}>
                Cancel
              </Button>
            </div>
          )}

          {/* Table */}
          <div
            className="overflow-hidden rounded-md border bg-background"
            style={{ opacity: loading ? 0.6 : 1 }}
          >
            <Table className="table-fixed">
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow className="hover:bg-transparent" key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        className="h-11"
                        key={header.id}
                        style={{ width: `${header.getSize()}px` }}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow data-state={row.getIsSelected() && "selected"} key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell className="last:py-0" key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell className="h-24 text-center" colSpan={columns.length}>
                      {loading ? "Loading content..." : "No content found"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between gap-8">
            <div className="flex items-center gap-3">
              <Label className="max-sm:sr-only" htmlFor={`${id}-pagesize`}>
                Rows per page
              </Label>
              <Select
                onValueChange={(value) => table.setPageSize(Number(value))}
                value={pagination.pageSize.toString()}
              >
                <SelectTrigger className="w-fit whitespace-nowrap" id={`${id}-pagesize`}>
                  <SelectValue placeholder="Rows" />
                </SelectTrigger>
                <SelectContent>
                  {[10, 15, 25, 50, 100].map((size) => (
                    <SelectItem key={size} value={size.toString()}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex grow justify-end whitespace-nowrap text-sm text-muted-foreground">
              <p aria-live="polite">
                <span className="text-foreground">
                  {total === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1}
                  -
                  {Math.min((pagination.pageIndex + 1) * pagination.pageSize, total)}
                </span>{" "}
                of <span className="text-foreground">{total}</span>
              </p>
            </div>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <Button
                    aria-label="Go to first page"
                    disabled={!table.getCanPreviousPage()}
                    onClick={() => table.firstPage()}
                    size="icon"
                    variant="outline"
                  >
                    <ChevronFirstIcon aria-hidden="true" size={16} />
                  </Button>
                </PaginationItem>
                <PaginationItem>
                  <Button
                    aria-label="Go to previous page"
                    disabled={!table.getCanPreviousPage()}
                    onClick={() => table.previousPage()}
                    size="icon"
                    variant="outline"
                  >
                    <ChevronLeftIcon aria-hidden="true" size={16} />
                  </Button>
                </PaginationItem>
                <PaginationItem>
                  <Button
                    aria-label="Go to next page"
                    disabled={!table.getCanNextPage()}
                    onClick={() => table.nextPage()}
                    size="icon"
                    variant="outline"
                  >
                    <ChevronRightIcon aria-hidden="true" size={16} />
                  </Button>
                </PaginationItem>
                <PaginationItem>
                  <Button
                    aria-label="Go to last page"
                    disabled={!table.getCanNextPage()}
                    onClick={() => table.lastPage()}
                    size="icon"
                    variant="outline"
                  >
                    <ChevronLastIcon aria-hidden="true" size={16} />
                  </Button>
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>

          {/* Delete confirmation */}
          <AlertDialog
            open={!!confirmDelete}
            onOpenChange={(open) => !open && !bulkLoading && setConfirmDelete(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Delete {confirmDelete?.length ?? 0} item
                  {(confirmDelete?.length ?? 0) === 1 ? "" : "s"}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This cannot be undone. The content will be removed from the public site
                  immediately.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={bulkLoading}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={bulkLoading}
                  onClick={handleConfirmDelete}
                >
                  {bulkLoading ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </main>

      <AutoFetchModal
        open={autoFetchOpen}
        onClose={() => setAutoFetchOpen(false)}
        // Modal stays open on step 3 with the per-category Results table —
        // that's a richer confirmation than a one-line alert. We just need to
        // refresh the list in the background so the new DRAFT rows appear
        // when the user closes the modal. No alert, no full-page reload.
        onDone={() => { load(); }}
      />
    </div>
  );
}

function RowActions({
  row,
  canDelete,
  onDelete,
}: {
  row: ContentRow;
  canDelete: boolean;
  onDelete: (row: ContentRow) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="flex justify-end">
          <Button aria-label="Row actions" className="shadow-none" size="icon" variant="ghost">
            <EllipsisIcon aria-hidden="true" size={16} />
          </Button>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/content/${row.id}`}>Edit</Link>
        </DropdownMenuItem>
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(row)}
            >
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
