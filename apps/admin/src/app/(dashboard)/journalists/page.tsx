"use client";

import {
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  flexRender,
  getCoreRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ChevronDownIcon,
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleXIcon,
  Columns3Icon,
  EllipsisIcon,
  FilterIcon,
  ListFilterIcon,
  TrashIcon,
  UserPlusIcon,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";

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
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

// ---- API shapes (from GET /api/journalists) ----
interface JournalistProfile {
  id: string;
  fullName: string;
  fatherName: string | null;
  kycStatus: string;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  city: string | null;
  pincode: string | null;
  primaryDistrict: string | null;
  secondaryDistricts: string[];
  aadhaarNumber: string | null;
  aadhaarFrontUrl: string;
  aadhaarBackUrl: string;
  panNumber: string | null;
  panCardUrl: string;
  idCardUrl: string | null;
  photoUrl: string;
  upiId: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankIfsc: string | null;
  bankBranch: string | null;
  experience: string | null;
  languages: string[];
  specialization: string | null;
  kycRejectionNote: string;
  createdAt: string;
  verifiedAt: string;
  _count?: { profileUpdateRequests: number };
}
interface Journalist {
  id: string;
  email: string;
  name: string;
  phone: string;
  active: boolean;
  createdAt: string;
  journalistProfile: JournalistProfile | null;
  _count: { articles: number; payments: number };
}

// Common KYC rejection reasons. The label shown in the dropdown IS the text
// stored on JournalistProfile.kycRejectionNote and shown to the reporter in
// the app's red KYC banner — keep them short, plain-English, actionable.
// "other" is a sentinel that reveals a free-text input for one-off cases.
const REJECTION_REASONS = [
  "Aadhaar photo unclear or blurry",
  "PAN card photo unclear or blurry",
  "Selfie does not match the Aadhaar photo",
  "Aadhaar number does not match the document",
  "PAN number is invalid",
  "Bank account details look incorrect",
  "Documents appear edited or tampered",
  "Wrong document type uploaded",
] as const;
const REJECTION_OTHER = "__other__";

// ---- table row ----
interface JournalistRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  district: string;
  kyc: string;
  articles: number;
  pendingUpdates: number;     // reporter-initiated profile changes awaiting review
  joinedAt: string;
  raw: Journalist;
}

const KYC_BADGE: Record<string, string> = {
  VERIFIED: "bg-green-100 text-green-700 border-green-200",
  SUBMITTED: "bg-blue-100 text-blue-700 border-blue-200",
  PENDING: "bg-amber-100 text-amber-700 border-amber-200",
  REJECTED: "bg-red-100 text-red-700 border-red-200",
  "NO PROFILE": "bg-muted text-muted-foreground border-transparent",
};

// Test/QA reporter account(s) — editable, but never deletable.
const PROTECTED_EMAILS = new Set(["reporter@rayalaseemaexpress.com"]);
const isProtected = (email: string) => PROTECTED_EMAILS.has((email || "").trim().toLowerCase());

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : "—");
const fmtAadhaar = (n?: string | null) => (n ? n.replace(/(\d{4})(?=\d)/g, "$1 ") : "");

// Search across name / email / phone
const multiColumnFilterFn: FilterFn<JournalistRow> = (row, _columnId, filterValue) => {
  const content = `${row.original.name} ${row.original.email} ${row.original.phone}`.toLowerCase();
  return content.includes((filterValue ?? "").toLowerCase());
};

const kycFilterFn: FilterFn<JournalistRow> = (row, columnId, filterValue: string[]) => {
  if (!filterValue?.length) return true;
  return filterValue.includes(row.getValue(columnId) as string);
};

function toRow(j: Journalist): JournalistRow {
  return {
    id: j.id,
    name: j.name,
    email: j.email,
    phone: j.phone || "",
    district: j.journalistProfile?.primaryDistrict || "",
    kyc: j.journalistProfile?.kycStatus || "NO PROFILE",
    articles: j._count.articles,
    pendingUpdates: j.journalistProfile?._count?.profileUpdateRequests || 0,
    joinedAt: j.createdAt,
    raw: j,
  };
}

export default function JournalistsPage() {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState<JournalistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<Journalist | null>(null);
  const [resetting, setResetting] = useState<Journalist | null>(null);

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }]);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/journalists")
      .then((r) => r.json())
      .then((rows: Journalist[]) => {
        setData(Array.isArray(rows) ? rows.map(toRow) : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // keep the open review dialog in sync after a refetch
  useEffect(() => {
    if (!reviewing) return;
    const fresh = data.find((d) => d.id === reviewing.id);
    if (fresh) setReviewing(fresh.raw);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const openReview = useCallback((j: Journalist) => setReviewing(j), []);
  const openReset = useCallback((j: Journalist) => setResetting(j), []);

  const [formFor, setFormFor] = useState<
    { mode: "create" } | { mode: "edit"; journalist: Journalist } | null
  >(null);
  const openEdit = useCallback((j: Journalist) => setFormFor({ mode: "edit", journalist: j }), []);

  const [confirmDelete, setConfirmDelete] = useState<JournalistRow[] | null>(null);
  const openDelete = useCallback((row: JournalistRow) => setConfirmDelete([row]), []);

  // One-click reactivate from the row dropdown for soft-deleted journalists.
  // No confirmation dialog — activation is non-destructive.
  const activate = useCallback(
    async (j: Journalist) => {
      try {
        await fetch("/api/journalists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "activate", userIds: [j.id] }),
        });
      } finally {
        load();
      }
    },
    [load],
  );

  const columns = useMemo<ColumnDef<JournalistRow>[]>(
    () => [
      {
        id: "select",
        size: 28,
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
            disabled={!row.getCanSelect()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
          />
        ),
      },
      {
        accessorKey: "name",
        header: "Name",
        size: 170,
        enableHiding: false,
        filterFn: multiColumnFilterFn,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.getValue("name")}</span>
            {!row.original.raw.active && (
              <Badge
                variant="outline"
                className="border-slate-300 bg-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-600"
              >
                Inactive
              </Badge>
            )}
          </div>
        ),
      },
      { accessorKey: "email", header: "Email", size: 220 },
      {
        accessorKey: "phone",
        header: "Phone",
        size: 130,
        cell: ({ row }) =>
          row.getValue("phone") || <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: "district",
        header: "District",
        size: 130,
        cell: ({ row }) =>
          row.getValue("district") || <span className="text-muted-foreground">—</span>,
      },
      {
        accessorKey: "kyc",
        header: "KYC Status",
        size: 120,
        filterFn: kycFilterFn,
        cell: ({ row }) => {
          const k = row.getValue("kyc") as string;
          return (
            <Badge variant="outline" className={cn("border", KYC_BADGE[k] ?? KYC_BADGE["NO PROFILE"])}>
              {k}
            </Badge>
          );
        },
      },
      {
        accessorKey: "articles",
        header: "Articles",
        size: 90,
        cell: ({ row }) => <span className="tabular-nums">{row.getValue("articles")}</span>,
      },
      {
        accessorKey: "pendingUpdates",
        header: "Updates",
        size: 130,
        enableSorting: false,
        // "View" links straight to the per-journalist filter on the
        // profile-requests review page. Shows a pending count when there's
        // something awaiting action; otherwise a quiet "—".
        cell: ({ row }) => {
          const count = row.getValue("pendingUpdates") as number;
          const journalistId = row.original.raw.journalistProfile?.id;
          if (!journalistId) return <span className="text-muted-foreground">—</span>;
          return count > 0 ? (
            <Link href={`/profile-requests?journalistId=${journalistId}`}>
              <Button size="sm" variant="default" className="h-7 gap-1.5 px-2.5">
                <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] tabular-nums">{count}</Badge>
                Review
              </Button>
            </Link>
          ) : (
            <Link href={`/profile-requests?journalistId=${journalistId}&status=ALL`}>
              <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs">View</Button>
            </Link>
          );
        },
      },
      {
        accessorKey: "joinedAt",
        header: "Joined",
        size: 120,
        cell: ({ row }) => <span className="text-muted-foreground">{fmtDate(row.getValue("joinedAt"))}</span>,
      },
      {
        id: "actions",
        size: 60,
        enableSorting: false,
        enableHiding: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <RowActions
            row={row.original}
            onReview={openReview}
            onEdit={openEdit}
            onReset={openReset}
            onActivate={activate}
            onDelete={openDelete}
          />
        ),
      },
    ],
    [openReview, openEdit, openReset, activate, openDelete],
  );

  const table = useReactTable({
    columns,
    data,
    enableSortingRemoval: false,
    enableRowSelection: (row) => !isProtected(row.original.email),
    getCoreRowModel: getCoreRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    state: { columnFilters, columnVisibility, pagination, sorting },
  });

  const kycColumn = table.getColumn("kyc");
  const uniqueKycValues = useMemo(() => {
    if (!kycColumn) return [] as string[];
    return Array.from(kycColumn.getFacetedUniqueValues().keys()).sort();
  }, [kycColumn, data]);
  const kycCounts = useMemo(() => {
    return kycColumn ? kycColumn.getFacetedUniqueValues() : new Map<string, number>();
  }, [kycColumn, data]);
  const selectedKyc = (kycColumn?.getFilterValue() as string[]) ?? [];

  const handleKycChange = (checked: boolean, value: string) => {
    const current = (kycColumn?.getFilterValue() as string[]) ?? [];
    const next = checked ? [...current, value] : current.filter((v) => v !== value);
    kycColumn?.setFilterValue(next.length ? next : undefined);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      const res = await fetch("/api/journalists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", userIds: confirmDelete.map((r) => r.id) }),
      });
      const result = await res.json().catch(() => ({}));
      table.resetRowSelection();
      setConfirmDelete(null);
      load();
      if (result.skipped?.length) {
        alert(
          `Deleted ${result.deleted}. Skipped ${result.skipped.length} — they have content and can't be deleted:\n` +
            result.skipped
              .map((s: { name: string; reason: string }) => `• ${s.name} (${s.reason})`)
              .join("\n") +
            `\n\nDeactivate those instead (⋯ → Edit details → Account status).`,
        );
      }
    } catch {
      setConfirmDelete(null);
      alert("Delete failed. Please try again.");
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111", marginBottom: 4 }}>Reporters &amp; KYC</h1>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
          Manage reporter profiles, verify KYC, track performance
        </p>

        <div className="shadcn-scope space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Input
                aria-label="Filter by name, email or phone"
                className={cn(
                  "peer min-w-60 ps-9",
                  Boolean(table.getColumn("name")?.getFilterValue()) && "pe-9",
                )}
                id={`${id}-input`}
                onChange={(e) => table.getColumn("name")?.setFilterValue(e.target.value)}
                placeholder="Filter by name, email or phone..."
                ref={inputRef}
                type="text"
                value={(table.getColumn("name")?.getFilterValue() ?? "") as string}
              />
              <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-muted-foreground/80">
                <ListFilterIcon aria-hidden="true" size={16} />
              </div>
              {Boolean(table.getColumn("name")?.getFilterValue()) && (
                <button
                  aria-label="Clear filter"
                  className="absolute inset-y-0 end-0 flex h-full w-9 items-center justify-center rounded-e-md text-muted-foreground/80 outline-none transition-colors hover:text-foreground"
                  onClick={() => {
                    table.getColumn("name")?.setFilterValue("");
                    inputRef.current?.focus();
                  }}
                  type="button"
                >
                  <CircleXIcon aria-hidden="true" size={16} />
                </button>
              )}
            </div>

            {/* KYC status filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline">
                  <FilterIcon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
                  KYC Status
                  {selectedKyc.length > 0 && (
                    <span className="-me-1 inline-flex h-5 items-center rounded border bg-background px-1 text-[0.625rem] font-medium text-muted-foreground/70">
                      {selectedKyc.length}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto min-w-40 p-3">
                <div className="space-y-3">
                  <div className="text-xs font-medium text-muted-foreground">Filters</div>
                  <div className="space-y-3">
                    {uniqueKycValues.map((value, i) => (
                      <div className="flex items-center gap-2" key={value}>
                        <Checkbox
                          checked={selectedKyc.includes(value)}
                          id={`${id}-kyc-${i}`}
                          onCheckedChange={(checked: boolean) => handleKycChange(checked, value)}
                        />
                        <Label
                          className="flex grow justify-between gap-2 font-normal"
                          htmlFor={`${id}-kyc-${i}`}
                        >
                          {value}
                          <span className="ms-2 text-xs text-muted-foreground">{kycCounts.get(value)}</span>
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
                {table.getRowCount()} reporter{table.getRowCount() === 1 ? "" : "s"}
              </span>
              {table.getSelectedRowModel().rows.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() =>
                    setConfirmDelete(table.getSelectedRowModel().rows.map((r) => r.original))
                  }
                >
                  <TrashIcon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
                  Deactivate ({table.getSelectedRowModel().rows.length})
                </Button>
              )}
              <Button onClick={() => setFormFor({ mode: "create" })}>
                <UserPlusIcon aria-hidden="true" className="-ms-1 opacity-90" size={16} />
                Add Reporter
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-md border bg-background">
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
                        {header.isPlaceholder ? null : header.column.getCanSort() ? (
                          <div
                            className="flex h-full cursor-pointer select-none items-center justify-between gap-2"
                            onClick={header.column.getToggleSortingHandler()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                header.column.getToggleSortingHandler()?.(e);
                              }
                            }}
                            tabIndex={0}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {{
                              asc: <ChevronUpIcon className="shrink-0 opacity-60" size={16} />,
                              desc: <ChevronDownIcon className="shrink-0 opacity-60" size={16} />,
                            }[header.column.getIsSorted() as string] ?? null}
                          </div>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
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
                      {loading ? "Loading reporters..." : "No reporters found."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between gap-8">
            <div className="flex items-center gap-3">
              <Label className="max-sm:sr-only" htmlFor={id}>
                Rows per page
              </Label>
              <Select
                onValueChange={(value) => table.setPageSize(Number(value))}
                value={table.getState().pagination.pageSize.toString()}
              >
                <SelectTrigger className="w-fit whitespace-nowrap" id={id}>
                  <SelectValue placeholder="Rows" />
                </SelectTrigger>
                <SelectContent>
                  {[5, 10, 25, 50].map((pageSize) => (
                    <SelectItem key={pageSize} value={pageSize.toString()}>
                      {pageSize}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex grow justify-end whitespace-nowrap text-sm text-muted-foreground">
              <p aria-live="polite">
                <span className="text-foreground">
                  {table.getRowCount() === 0
                    ? 0
                    : table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}
                  -
                  {Math.min(
                    (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                    table.getRowCount(),
                  )}
                </span>{" "}
                of <span className="text-foreground">{table.getRowCount()}</span>
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

          {/* KYC review dialog */}
          <ReviewDialog journalist={reviewing} onClose={() => setReviewing(null)} onChanged={load} />

          {/* Focused password-reset dialog (custom password + one-time flag) */}
          <PasswordResetDialog journalist={resetting} onClose={() => setResetting(null)} />

          {/* Create / edit journalist form */}
          <JournalistFormDialog target={formFor} onClose={() => setFormFor(null)} onSaved={load} />

          {/* Deactivate confirmation */}
          <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Deactivate {confirmDelete?.length ?? 0} reporter
                  {(confirmDelete?.length ?? 0) === 1 ? "" : "s"}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  They&apos;ll be unable to log in to the reporter app. Their articles, payments,
                  and KYC documents are preserved. To reactivate later, edit the reporter and
                  tick &ldquo;Active&rdquo; — or resetting their password also reactivates the
                  account automatically.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleDelete}
                >
                  Deactivate
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </main>
    </div>
  );
}

function RowActions({
  row,
  onReview,
  onEdit,
  onReset,
  onActivate,
  onDelete,
}: {
  row: JournalistRow;
  onReview: (j: Journalist) => void;
  onEdit: (j: Journalist) => void;
  onReset: (j: Journalist) => void;
  onActivate: (j: Journalist) => void;
  onDelete: (row: JournalistRow) => void;
}) {
  const isActive = row.raw.active;
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
        <DropdownMenuItem onClick={() => onReview(row.raw)}>Review &amp; documents</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEdit(row.raw)}>Edit details</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onReset(row.raw)}>Reset password</DropdownMenuItem>
        {!isProtected(row.email) && (
          <>
            <DropdownMenuSeparator />
            {isActive ? (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete(row)}
              >
                Deactivate reporter
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                className="text-green-700 focus:text-green-700"
                onClick={() => onActivate(row.raw)}
              >
                Activate reporter
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <p className="leading-relaxed">
      <span className="font-semibold text-foreground">{label}:</span>{" "}
      <span className="text-muted-foreground">{value}</span>
    </p>
  );
}

function DocThumb({ label, url }: { label: string; url?: string | null }) {
  if (!url) return null;
  return (
    <div>
      <p className="mb-1 text-[10px] text-muted-foreground">{label}</p>
      <a href={url} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={label} className="block w-full rounded-md border" src={url} />
      </a>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 mt-4 border-b pb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

function ReviewDialog({
  journalist,
  onClose,
  onChanged,
}: {
  journalist: Journalist | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  // rejectReason holds the SELECT value: "" = nothing chosen, a preset string
  // from REJECTION_REASONS, or REJECTION_OTHER. rejectNote is the free-text
  // override used only when "Other" is chosen.
  const [rejectReason, setRejectReason] = useState<string>("");
  const [rejectNote, setRejectNote] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // reset transient state whenever a different journalist opens
  useEffect(() => {
    setRejectReason("");
    setRejectNote("");
    setRejectError(null);
    setTempPassword("");
  }, [journalist?.id]);

  const p = journalist?.journalistProfile ?? null;

  const act = async (action: string, note?: string) => {
    if (!p) return;
    setBusy(true);
    try {
      await fetch("/api/journalists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: p.id, action, note }),
      });
      onChanged();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!p) return;
    if (!confirm("Reset this reporter's password? Their current password stops working immediately.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/journalists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: p.id, action: "reset-password" }),
      });
      const data = await res.json();
      if (data.tempPassword) setTempPassword(data.tempPassword);
      else alert(data.error || "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  const hasDocs = !!(
    p &&
    (p.photoUrl || p.aadhaarFrontUrl || p.aadhaarBackUrl || p.panCardUrl || p.idCardUrl)
  );

  return (
    <Dialog open={!!journalist} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        {journalist && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {journalist.name}
                <Badge
                  variant="outline"
                  className={cn("border", KYC_BADGE[p?.kycStatus || "NO PROFILE"])}
                >
                  {p?.kycStatus || "NO PROFILE"}
                </Badge>
              </DialogTitle>
              <DialogDescription>
                {journalist.email}
                {journalist.phone ? ` · ${journalist.phone}` : ""}
              </DialogDescription>
            </DialogHeader>

            {!p ? (
              <p className="text-sm text-muted-foreground">
                This reporter has not submitted a KYC profile yet.
              </p>
            ) : (
              <div className="text-sm">
                {hasDocs && (
                  <>
                    <SectionTitle>Documents</SectionTitle>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <DocThumb label="Passport Photo" url={p.photoUrl} />
                      <DocThumb label="Aadhaar Front" url={p.aadhaarFrontUrl} />
                      <DocThumb label="Aadhaar Back" url={p.aadhaarBackUrl} />
                      <DocThumb label="PAN Card" url={p.panCardUrl} />
                      <DocThumb label="Press / ID Card" url={p.idCardUrl} />
                    </div>
                  </>
                )}

                <SectionTitle>Personal</SectionTitle>
                <Field label="Father's Name" value={p.fatherName} />
                <Field label="Date of Birth" value={p.dateOfBirth ? fmtDate(p.dateOfBirth) : null} />
                <Field label="Gender" value={p.gender} />
                <Field label="Address" value={p.address} />
                <Field label="City" value={p.city} />
                <Field label="Pincode" value={p.pincode} />
                <Field label="Primary District" value={p.primaryDistrict} />
                <Field label="Other Districts" value={p.secondaryDistricts?.join(", ")} />
                <Field label="Languages" value={p.languages?.join(", ")} />
                <Field label="Specialization" value={p.specialization} />
                <Field label="Experience" value={p.experience} />

                <SectionTitle>KYC Details</SectionTitle>
                <Field label="Aadhaar No." value={fmtAadhaar(p.aadhaarNumber)} />
                <Field label="PAN No." value={p.panNumber} />

                <SectionTitle>Bank / Payment</SectionTitle>
                <Field label="UPI ID" value={p.upiId} />
                <Field label="Bank Name" value={p.bankName} />
                <Field label="Account No." value={p.bankAccount} />
                <Field label="IFSC" value={p.bankIfsc} />
                <Field label="Branch" value={p.bankBranch} />

                <SectionTitle>Activity</SectionTitle>
                <Field label="Articles" value={String(journalist._count.articles)} />
                <Field label="Payments" value={String(journalist._count.payments)} />
                <Field label="Account" value={journalist.active ? "Active" : "Inactive"} />
                <Field label="Joined" value={fmtDate(journalist.createdAt)} />
                <Field label="Verified" value={p.verifiedAt ? fmtDate(p.verifiedAt) : null} />

                {p.kycRejectionNote && (
                  <div className="mt-3 rounded-md border-l-2 border-red-500 bg-red-50 p-2.5">
                    <p className="text-[11px] font-bold text-red-600">Rejection Note</p>
                    <p className="text-xs text-muted-foreground">{p.kycRejectionNote}</p>
                  </div>
                )}

                {/* KYC decision — available for any not-yet-final state, so a
                    PENDING profile (registered without docs) can still be approved. */}
                <SectionTitle>KYC Decision</SectionTitle>
                <div className="space-y-2">
                  {p.kycStatus !== "VERIFIED" && (
                    <Button
                      className="w-full bg-green-600 hover:bg-green-700"
                      disabled={busy}
                      onClick={() => act("verify")}
                    >
                      Verify &amp; Approve KYC ✓
                    </Button>
                  )}
                  {p.kycStatus !== "REJECTED" && (
                    <>
                      <Select
                        value={rejectReason}
                        onValueChange={(v) => {
                          setRejectReason(v);
                          if (rejectError) setRejectError(null);
                        }}
                      >
                        <SelectTrigger className="w-full" aria-invalid={!!rejectError}>
                          <SelectValue placeholder="Select a rejection reason (required)" />
                        </SelectTrigger>
                        <SelectContent>
                          {REJECTION_REASONS.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                          <SelectItem value={REJECTION_OTHER}>Other (type a custom reason)</SelectItem>
                        </SelectContent>
                      </Select>
                      {rejectReason === REJECTION_OTHER && (
                        <Input
                          onChange={(e) => {
                            setRejectNote(e.target.value);
                            if (rejectError) setRejectError(null);
                          }}
                          placeholder="Describe the reason — the reporter will see this"
                          value={rejectNote}
                          aria-invalid={!!rejectError}
                        />
                      )}
                      {rejectError && (
                        <p className="text-xs text-red-600 -mt-1">{rejectError}</p>
                      )}
                      <Button
                        className="w-full"
                        disabled={busy}
                        onClick={() => {
                          if (!rejectReason) {
                            setRejectError("Please select a rejection reason.");
                            return;
                          }
                          const finalNote =
                            rejectReason === REJECTION_OTHER ? rejectNote.trim() : rejectReason;
                          if (!finalNote) {
                            setRejectError("Please describe the reason — the reporter sees this in the app.");
                            return;
                          }
                          act("reject", finalNote);
                        }}
                        variant="destructive"
                      >
                        {p.kycStatus === "VERIFIED" ? "Revoke Verification" : "Reject KYC"}
                      </Button>
                    </>
                  )}
                  {p.kycStatus === "VERIFIED" && (
                    <p className="text-xs text-muted-foreground">
                      KYC is verified. Use “Revoke Verification” only if this was a mistake.
                    </p>
                  )}
                </div>

                {/* Password reset */}
                <SectionTitle>Password</SectionTitle>
                <Button className="w-full" disabled={busy} onClick={resetPassword} variant="outline">
                  Reset Password
                </Button>
                {tempPassword && (
                  <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-3">
                    <p className="text-[11px] font-bold text-amber-800">
                      Temporary password — share it with the reporter:
                    </p>
                    <div className="my-1.5 flex items-center gap-2">
                      <code className="text-lg font-extrabold tracking-wide text-foreground">{tempPassword}</code>
                      <Button
                        className="h-7"
                        onClick={() => navigator.clipboard?.writeText(tempPassword)}
                        size="sm"
                        variant="outline"
                      >
                        Copy
                      </Button>
                    </div>
                    <p className="text-[11px] text-amber-700">
                      They log in with this password. It won&apos;t be shown again.
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Focused password-reset modal ──────────────────────────────────────────
//
// Triggered by the row "Reset password" action. Two-step flow:
//   1. Admin types a password (or hits Generate) + chooses one-time vs
//      permanent, then submits.
//   2. Backend returns the password we just set; we surface it once so the
//      admin can copy/relay it.
function PasswordResetDialog({
  journalist,
  onClose,
}: {
  journalist: Journalist | null;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [oneTime, setOneTime] = useState(true);
  const [busy, setBusy] = useState(false);
  const [resultPassword, setResultPassword] = useState("");
  const [error, setError] = useState("");

  // Fresh state each time a different journalist opens.
  useEffect(() => {
    setPassword("");
    setOneTime(true);
    setResultPassword("");
    setError("");
    setBusy(false);
  }, [journalist?.id]);

  const generate = () => {
    setPassword(makeStrongPassword());
    setError("");
  };

  const submit = async () => {
    if (!journalist?.journalistProfile) {
      setError("This reporter has no profile yet.");
      return;
    }
    if (password && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/journalists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: journalist.journalistProfile.id,
          action: "reset-password",
          customPassword: password || undefined,
          oneTime,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Reset failed");
        return;
      }
      setResultPassword(data.password || data.tempPassword || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  const done = !!resultPassword;

  return (
    <Dialog open={!!journalist} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        {journalist && (
          <>
            <DialogHeader>
              <DialogTitle>Reset password</DialogTitle>
              <DialogDescription>
                Set a new password for <span className="font-semibold">{journalist.name}</span>.
              </DialogDescription>
            </DialogHeader>

            {!done ? (
              <>
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs" htmlFor="rp-password">New password</Label>
                    <div className="mt-1 flex gap-2">
                      <Input
                        id="rp-password"
                        type="text"
                        placeholder="Type or click Generate"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setError(""); }}
                        autoComplete="new-password"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        disabled={busy}
                      />
                      <Button type="button" variant="outline" onClick={generate} disabled={busy}>
                        Generate
                      </Button>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Leave blank to let the system generate one for you.
                    </p>
                    {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
                  </div>

                  <label className="flex cursor-pointer items-start gap-2">
                    <Checkbox
                      checked={oneTime}
                      onCheckedChange={(v) => setOneTime(v === true)}
                      className="mt-0.5"
                      disabled={busy}
                    />
                    <div className="text-sm leading-tight">
                      <p className="font-semibold">Require password change at next sign-in</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Reporter must replace this one-time password the first time they log in.
                        Uncheck for a permanent password.
                      </p>
                    </div>
                  </label>
                </div>

                <DialogFooter className="mt-2">
                  <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
                  <Button onClick={submit} disabled={busy}>
                    {busy ? "Resetting…" : "Reset password"}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
                  <p className="mb-2 text-[11px] font-bold text-amber-800">
                    {oneTime
                      ? "One-time password — they must change it at next sign-in."
                      : "New password set."}
                  </p>
                  <div className="flex gap-2">
                    {/* Read-only shadcn Input so the result mirrors the form
                        above visually — same border, same padding, same
                        focus ring. The user can also tap-select-all. */}
                    <Input
                      readOnly
                      value={resultPassword}
                      onFocus={(e) => e.currentTarget.select()}
                      className="font-mono tracking-wide"
                      aria-label="Generated password"
                    />
                    <Button
                      variant="outline"
                      onClick={() => navigator.clipboard?.writeText(resultPassword)}
                    >
                      Copy
                    </Button>
                  </div>
                  <p className="mt-2 text-[11px] text-amber-700">
                    Share it with the reporter. It won&apos;t be shown again.
                  </p>
                </div>
                <DialogFooter className="mt-2">
                  <Button onClick={onClose}>Done</Button>
                </DialogFooter>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Strong 14-char password mixing upper / lower / digit / symbol, with
// lookalike chars (0/O, 1/l/I) excluded so it survives reading aloud and
// chat copy-paste. We deliberately don't use crypto.randomBytes here —
// this runs in the browser, and the modal surfaces the result once
// rather than persisting it as a secret.
function makeStrongPassword(length = 14): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*-_=+";
  const all = upper + lower + digits + symbols;
  const pickFrom = (s: string) => s[Math.floor(Math.random() * s.length)];
  // Seed with one of each character class so the result always passes
  // typical strength checks.
  const seeded = [pickFrom(upper), pickFrom(lower), pickFrom(digits), pickFrom(symbols)];
  while (seeded.length < length) seeded.push(pickFrom(all));
  return seeded.sort(() => Math.random() - 0.5).join("");
}

const DISTRICTS = [
  { value: "kurnool", label: "Kurnool" },
  { value: "nandyal", label: "Nandyal" },
  { value: "ananthapuramu", label: "Anantapur" },
  { value: "sri-sathya-sai", label: "Sri Sathya Sai" },
  { value: "ysr-kadapa", label: "YSR Kadapa" },
  { value: "annamayya", label: "Annamayya" },
  { value: "tirupati", label: "Tirupati" },
  { value: "chittoor", label: "Chittoor" },
];

interface FormState {
  name: string;
  email: string;
  phone: string;
  password: string;
  active: boolean;
  fatherName: string;
  dateOfBirth: string;
  gender: string;
  address: string;
  city: string;
  pincode: string;
  primaryDistrict: string;
  specialization: string;
  experience: string;
  languages: string;
  aadhaarNumber: string;
  panNumber: string;
  upiId: string;
  bankName: string;
  bankAccount: string;
  bankIfsc: string;
  bankBranch: string;
  kycStatus: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  email: "",
  phone: "",
  password: "",
  active: true,
  fatherName: "",
  dateOfBirth: "",
  gender: "",
  address: "",
  city: "",
  pincode: "",
  primaryDistrict: "",
  specialization: "",
  experience: "",
  languages: "Telugu",
  aadhaarNumber: "",
  panNumber: "",
  upiId: "",
  bankName: "",
  bankAccount: "",
  bankIfsc: "",
  bankBranch: "",
  kycStatus: "PENDING",
};

function formFromJournalist(j: Journalist): FormState {
  const p = j.journalistProfile;
  return {
    name: j.name,
    email: j.email,
    phone: j.phone || "",
    password: "",
    active: j.active,
    fatherName: p?.fatherName || "",
    dateOfBirth: p?.dateOfBirth ? p.dateOfBirth.slice(0, 10) : "",
    gender: p?.gender || "",
    address: p?.address || "",
    city: p?.city || "",
    pincode: p?.pincode || "",
    primaryDistrict: p?.primaryDistrict || "",
    specialization: p?.specialization || "",
    experience: p?.experience || "",
    languages: (p?.languages || []).join(", "),
    aadhaarNumber: p?.aadhaarNumber || "",
    panNumber: p?.panNumber || "",
    upiId: p?.upiId || "",
    bankName: p?.bankName || "",
    bankAccount: p?.bankAccount || "",
    bankIfsc: p?.bankIfsc || "",
    bankBranch: p?.bankBranch || "",
    kycStatus: p?.kycStatus || "PENDING",
  };
}

function FormField({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1", full && "col-span-2")}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function JournalistFormDialog({
  target,
  onClose,
  onSaved,
}: {
  target: { mode: "create" } | { mode: "edit"; journalist: Journalist } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = target?.mode === "edit";
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!target) return;
    setError("");
    setForm(target.mode === "edit" ? formFromJournalist(target.journalist) : EMPTY_FORM);
  }, [target]);

  const set = (key: keyof FormState, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (!isEdit && !form.password.trim()) {
      setError("A password is required for a new reporter.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload =
        target && target.mode === "edit"
          ? {
              action: "update",
              userId: target.journalist.id,
              // KYC status is omitted on edit — it moves only via verify/reject.
              data: { ...form, kycStatus: undefined },
            }
          : { action: "create", data: form };
      const res = await fetch("/api/journalists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        setError(json.error || "Could not save. Please try again.");
        setBusy(false);
        return;
      }
      setBusy(false);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit reporter" : "Add reporter"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this reporter's account and profile."
              : "Create a reporter account and profile — they can log in immediately."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 text-sm">
          <SectionTitle>Account</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Name *">
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
            </FormField>
            <FormField label="Email *">
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </FormField>
            <FormField label="Phone">
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </FormField>
            {isEdit ? (
              <FormField label="Account status">
                <label className="flex h-9 items-center gap-2">
                  <Checkbox checked={form.active} onCheckedChange={(v) => set("active", !!v)} />
                  <span className="text-sm">{form.active ? "Active" : "Inactive"}</span>
                </label>
              </FormField>
            ) : (
              <FormField label="Password *">
                <Input value={form.password} onChange={(e) => set("password", e.target.value)} />
              </FormField>
            )}
          </div>

          <SectionTitle>Personal</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Father's Name">
              <Input value={form.fatherName} onChange={(e) => set("fatherName", e.target.value)} />
            </FormField>
            <FormField label="Date of Birth">
              <DatePicker
                value={form.dateOfBirth}
                onChange={(v) => set("dateOfBirth", v)}
                placeholder="Select date of birth"
                toYear={new Date().getFullYear()}
              />
            </FormField>
            <FormField label="Gender">
              <Select value={form.gender} onValueChange={(v) => set("gender", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Primary District">
              <Select value={form.primaryDistrict} onValueChange={(v) => set("primaryDistrict", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select district" />
                </SelectTrigger>
                <SelectContent>
                  {DISTRICTS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="City">
              <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
            </FormField>
            <FormField label="Pincode">
              <Input value={form.pincode} onChange={(e) => set("pincode", e.target.value)} />
            </FormField>
            <FormField label="Specialization">
              <Input value={form.specialization} onChange={(e) => set("specialization", e.target.value)} />
            </FormField>
            <FormField label="Languages (comma-separated)">
              <Input value={form.languages} onChange={(e) => set("languages", e.target.value)} />
            </FormField>
            <FormField full label="Address">
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
            </FormField>
            <FormField full label="Experience">
              <Input value={form.experience} onChange={(e) => set("experience", e.target.value)} />
            </FormField>
          </div>

          <SectionTitle>KYC</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Aadhaar Number">
              <Input value={form.aadhaarNumber} onChange={(e) => set("aadhaarNumber", e.target.value)} />
            </FormField>
            <FormField label="PAN Number">
              <Input value={form.panNumber} onChange={(e) => set("panNumber", e.target.value)} />
            </FormField>
            {!isEdit && (
              <FormField label="KYC Status">
                <Select value={form.kycStatus} onValueChange={(v) => set("kycStatus", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="SUBMITTED">Submitted</SelectItem>
                    <SelectItem value="VERIFIED">Verified</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            )}
          </div>
          {isEdit && (
            <p className="pt-1 text-xs text-muted-foreground">
              Documents and KYC status are managed from “Review &amp; documents”.
            </p>
          )}

          <SectionTitle>Bank / Payment</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="UPI ID">
              <Input value={form.upiId} onChange={(e) => set("upiId", e.target.value)} />
            </FormField>
            <FormField label="Bank Name">
              <Input value={form.bankName} onChange={(e) => set("bankName", e.target.value)} />
            </FormField>
            <FormField label="Account Number">
              <Input value={form.bankAccount} onChange={(e) => set("bankAccount", e.target.value)} />
            </FormField>
            <FormField label="IFSC">
              <Input value={form.bankIfsc} onChange={(e) => set("bankIfsc", e.target.value)} />
            </FormField>
            <FormField label="Branch">
              <Input value={form.bankBranch} onChange={(e) => set("bankBranch", e.target.value)} />
            </FormField>
          </div>
        </div>

        {error && <p className="text-sm font-medium text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving..." : isEdit ? "Save changes" : "Create reporter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
