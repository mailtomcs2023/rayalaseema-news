"use client";

// /payments - admin payouts dashboard. Lists every ContentPayment row with a
// status filter, totals per status, and a "Mark Paid" action for APPROVED
// rows. Table chrome mirrors /journalists (TanStack Table + shadcn primitives)
// so the two admin tables look and behave the same.

import {
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  flexRender,
  getCoreRowModel,
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
  ListFilterIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
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

type Status = "CALCULATED" | "APPROVED" | "PROCESSING" | "PAID" | "DISPUTED" | "CANCELLED";

interface Payment {
  id: string;
  baseAmount: number;
  totalAmount: number;
  currency: string;
  status: Status;
  approvedAt: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  transactionId: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  content: {
    id: string;
    title: string;
    slug: string | null;
    status: string;
    category: { name: string; nameEn: string; slug: string; color: string | null } | null;
  };
  journalist: { id: string; name: string; email: string };
}

const FILTERS: { value: "ALL" | Status; label: string }[] = [
  { value: "ALL",        label: "All" },
  { value: "CALCULATED", label: "Pending" },
  { value: "APPROVED",   label: "Approved" },
  { value: "PAID",       label: "Settled" },
  { value: "CANCELLED",  label: "Cancelled" },
];

// Status pill colour map - same shadcn-style palette as /journalists' KYC
// badge so the two pages feel like the same product.
const STATUS_BADGE: Record<Status, { label: string; cls: string }> = {
  CALCULATED: { label: "Pending",         cls: "bg-amber-100 text-amber-700 border-amber-200" },
  APPROVED:   { label: "Awaiting payout", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  PROCESSING: { label: "Processing",      cls: "bg-violet-100 text-violet-700 border-violet-200" },
  PAID:       { label: "Settled",         cls: "bg-green-100 text-green-700 border-green-200" },
  CANCELLED:  { label: "Cancelled",       cls: "bg-muted text-muted-foreground border-transparent" },
  DISPUTED:   { label: "Disputed",        cls: "bg-red-100 text-red-700 border-red-200" },
};

function formatINR(n: number) {
  return `₹${new Intl.NumberFormat("en-IN").format(Math.round(n))}`;
}
function formatDate(iso: string | null) {
  if (!iso) return "-";
  try { return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); } catch { return "-"; }
}

// Search across article title + reporter name. Mirrors /journalists' search.
const multiColumnFilterFn: FilterFn<Payment> = (row, _columnId, filterValue) => {
  const haystack = `${row.original.content.title} ${row.original.journalist.name}`.toLowerCase();
  return haystack.includes((filterValue ?? "").toLowerCase());
};

export default function PaymentsPage() {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [filter, setFilter] = useState<"ALL" | Status>("ALL");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [payTarget, setPayTarget] = useState<Payment | null>(null);

  // TanStack state - mirrors /journalists shape.
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);

  const load = (status: "ALL" | Status) => {
    setLoading(true);
    fetch(`/api/payments?status=${status}`)
      .then((r) => r.json())
      .then((data) => {
        setPayments(Array.isArray(data.payments) ? data.payments : []);
        setCounts(data.counts || {});
      })
      .catch(() => setPayments([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(filter); }, [filter]);

  const columns = useMemo<ColumnDef<Payment>[]>(
    () => [
      {
        id: "article",
        accessorFn: (p) => p.content.title || "(untitled)",
        header: "Article",
        size: 280,
        enableHiding: false,
        filterFn: multiColumnFilterFn,
        cell: ({ row }) => (
          <Link
            href={`/content/${row.original.content.id}`}
            className="font-medium text-foreground hover:underline"
          >
            {row.original.content.title || "(untitled)"}
          </Link>
        ),
      },
      {
        id: "reporter",
        accessorFn: (p) => p.journalist.name,
        header: "Reporter",
        size: 160,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.journalist.name}</span>
        ),
      },
      {
        id: "category",
        accessorFn: (p) => p.content.category?.nameEn ?? "",
        header: "Category",
        size: 140,
        cell: ({ row }) => {
          const c = row.original.content.category;
          return c ? (
            <Badge variant="outline" style={{ borderColor: c.color ?? undefined }}>
              {c.nameEn}
            </Badge>
          ) : (
            <span className="text-muted-foreground">-</span>
          );
        },
      },
      {
        accessorKey: "totalAmount",
        header: "Amount",
        size: 110,
        cell: ({ row }) => (
          <span className="tabular-nums font-semibold">
            {formatINR(row.original.totalAmount)}
          </span>
        ),
        sortingFn: "basic",
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 140,
        cell: ({ row }) => {
          const ui = STATUS_BADGE[row.original.status];
          return (
            <Badge variant="outline" className={cn("border", ui.cls)}>
              {ui.label}
            </Badge>
          );
        },
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        size: 120,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{formatDate(row.original.createdAt)}</span>
        ),
        sortingFn: "datetime",
      },
      {
        accessorKey: "paidAt",
        header: "Paid On",
        size: 160,
        cell: ({ row }) => {
          const p = row.original;
          if (!p.paidAt) return <span className="text-xs text-muted-foreground">-</span>;
          return (
            <span className="text-xs text-muted-foreground">
              {formatDate(p.paidAt)}
              {p.paymentMethod ? ` · ${p.paymentMethod}` : ""}
            </span>
          );
        },
        sortingFn: "datetime",
      },
      {
        id: "actions",
        size: 110,
        enableSorting: false,
        enableHiding: false,
        header: () => <div className="text-right">Action</div>,
        cell: ({ row }) =>
          row.original.status === "APPROVED" ? (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setPayTarget(row.original)}>Mark Paid</Button>
            </div>
          ) : (
            <div className="text-right text-muted-foreground">-</div>
          ),
      },
    ],
    [],
  );

  const table = useReactTable({
    columns,
    data: payments,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    state: { columnFilters, columnVisibility, pagination, sorting },
  });

  // Total amount = sum of currently-visible (post-filter) rows.
  const visibleTotal = table
    .getFilteredRowModel()
    .rows.reduce((s, r) => s + r.original.totalAmount, 0);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111", marginBottom: 4 }}>Payments</h1>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
          Approve, mark paid, and review per-article reporter payments. All amounts in INR (₹).
        </p>

        <div className="shadcn-scope space-y-4">
          {/* Status filter chips with counts - server-side refetch */}
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <Button
                key={f.value}
                size="sm"
                variant={filter === f.value ? "default" : "outline"}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
                <span className="ms-1 inline-flex h-5 items-center rounded border bg-background px-1 text-[0.625rem] font-medium text-muted-foreground/70">
                  {f.value === "ALL"
                    ? Object.values(counts).reduce((s, n) => s + n, 0)
                    : counts[f.value] ?? 0}
                </span>
              </Button>
            ))}
          </div>

          {/* Table toolbar - search + view columns + count/total summary */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Input
                aria-label="Filter by article or reporter"
                className={cn(
                  "peer min-w-64 ps-9",
                  Boolean(table.getColumn("article")?.getFilterValue()) && "pe-9",
                )}
                id={`${id}-input`}
                onChange={(e) => table.getColumn("article")?.setFilterValue(e.target.value)}
                placeholder="Filter by article or reporter..."
                ref={inputRef}
                type="text"
                value={(table.getColumn("article")?.getFilterValue() ?? "") as string}
              />
              <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-muted-foreground/80">
                <ListFilterIcon aria-hidden="true" size={16} />
              </div>
              {Boolean(table.getColumn("article")?.getFilterValue()) && (
                <button
                  aria-label="Clear filter"
                  className="absolute inset-y-0 end-0 flex h-full w-9 items-center justify-center rounded-e-md text-muted-foreground/80 outline-none transition-colors hover:text-foreground"
                  onClick={() => {
                    table.getColumn("article")?.setFilterValue("");
                    inputRef.current?.focus();
                  }}
                  type="button"
                >
                  <CircleXIcon aria-hidden="true" size={16} />
                </button>
              )}
            </div>

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

            <div className="ms-auto text-sm text-muted-foreground">
              {table.getFilteredRowModel().rows.length} row
              {table.getFilteredRowModel().rows.length === 1 ? "" : "s"} · total{" "}
              <span className="font-semibold text-foreground tabular-nums">{formatINR(visibleTotal)}</span>
            </div>
          </div>

          {/* Table - same shell as /journalists */}
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
                      {loading ? "Loading payments..." : "No payments in this view."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination row - page-size on the left, range counter + nav
              buttons grouped together on the right. No empty gap in middle. */}
          <div className="flex items-center justify-between gap-4">
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
            <div className="flex items-center gap-3">
              <p aria-live="polite" className="whitespace-nowrap text-sm text-muted-foreground">
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
              <Pagination className="mx-0 w-auto">
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
          </div>
        </div>
      </main>

      {payTarget && (
        <MarkPaidDialog
          payment={payTarget}
          onClose={() => setPayTarget(null)}
          onPaid={() => { setPayTarget(null); load(filter); }}
        />
      )}
    </div>
  );
}

function MarkPaidDialog({
  payment,
  onClose,
  onPaid,
}: {
  payment: Payment;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [method, setMethod] = useState<"UPI" | "BANK" | "CHEQUE">("UPI");
  const [transactionId, setTransactionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/payments/${payment.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod: method, transactionId: transactionId.trim() || undefined }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || `Failed (${res.status})`);
        setBusy(false);
        return;
      }
      onPaid();
    } catch (e: any) {
      setError(e?.message || "Network error");
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark payment as settled</DialogTitle>
          <DialogDescription>
            Reporter <span className="font-semibold">{payment.journalist.name}</span> ·{" "}
            <span className="font-semibold tabular-nums">{formatINR(payment.totalAmount)}</span>{" "}
            for &ldquo;{payment.content.title}&rdquo;.
            <br />Once marked paid, the amount can&apos;t be edited.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pay-method">Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as "UPI" | "BANK" | "CHEQUE")}>
              <SelectTrigger id="pay-method" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="UPI">UPI</SelectItem>
                <SelectItem value="BANK">Bank transfer</SelectItem>
                <SelectItem value="CHEQUE">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-txn">Transaction ID <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              id="pay-txn"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              placeholder="e.g. UPI ref or bank UTR"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={busy}>
            {busy ? "Marking paid..." : "Mark Paid"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
