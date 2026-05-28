// Desks list — client-side TanStack + shadcn Table (mirrors /categories).
// Dataset is small (~30 rows even with auto-seeded geographic desks), so
// pagination/sorting/filtering all run in memory. CRUD is wired to
// /api/desks with the same dialog ergonomics as the rest of the admin.
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
  type RowSelectionState,
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
  PlusIcon,
  RefreshCwIcon,
  TrashIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

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

const BRANCHES = ["TOPICAL", "GEOGRAPHIC", "EDITORIAL"] as const;
type Branch = (typeof BRANCHES)[number];

// Branch badge palette — same shape as the type-chip palette on /content.
const BRANCH_BADGE: Record<string, string> = {
  TOPICAL: "border-blue-200 bg-blue-100 text-blue-800",
  GEOGRAPHIC: "border-emerald-200 bg-emerald-100 text-emerald-800",
  EDITORIAL: "border-amber-200 bg-amber-100 text-amber-800",
};

export interface DeskRow {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  branch: Branch;
  sortOrder: number;
  active: boolean;
  _count?: { contents: number };
}

interface FormState {
  nameEn: string;
  name: string;
  slug: string;
  branch: Branch;
  sortOrder: number;
  active: boolean;
}

const EMPTY_FORM: FormState = {
  nameEn: "",
  name: "",
  slug: "",
  branch: "TOPICAL",
  sortOrder: 0,
  active: true,
};

const fuzzyFilterFn: FilterFn<DeskRow> = (row, _columnId, filterValue) => {
  const haystack = `${row.original.nameEn} ${row.original.name} ${row.original.slug}`.toLowerCase();
  return haystack.includes(String(filterValue ?? "").toLowerCase());
};

const arrayFilterFn: FilterFn<DeskRow> = (row, columnId, filterValue: string[]) => {
  if (!filterValue?.length) return true;
  const val = String(row.getValue(columnId) ?? "");
  return filterValue.includes(val);
};

const activeFilterFn: FilterFn<DeskRow> = (row, _columnId, filterValue: string[]) => {
  if (!filterValue?.length) return true;
  return filterValue.includes(row.original.active ? "Active" : "Inactive");
};

export function DesksTable({ data: initialData }: { data: DeskRow[] }) {
  const id = useId();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState<DeskRow[]>(initialData);
  useEffect(() => setData(initialData), [initialData]);

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [sorting, setSorting] = useState<SortingState>([
    { id: "branch", desc: false },
    { id: "nameEn", desc: false },
  ]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const [formFor, setFormFor] = useState<{ mode: "create" } | { mode: "edit"; row: DeskRow } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DeskRow | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState<DeskRow[] | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  // Refresh button — re-runs the server fetch via router.refresh(). We track
  // the loading state locally so the icon can spin without a route loader.
  const [refreshing, setRefreshing] = useState(false);

  const [toast, setToast] = useState<{ msg: string; type: "error" | "success" } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    router.refresh();
    // No explicit "done" event from router.refresh — clear after a short delay.
    setTimeout(() => setRefreshing(false), 800);
  }, [router]);

  const openEdit = useCallback((row: DeskRow) => setFormFor({ mode: "edit", row }), []);
  const openDelete = useCallback((row: DeskRow) => setConfirmDelete(row), []);

  const columns = useMemo<ColumnDef<DeskRow>[]>(
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
        accessorKey: "branch",
        header: "Branch",
        size: 130,
        filterFn: arrayFilterFn,
        cell: ({ row }) => (
          <Badge
            variant="outline"
            className={cn("border text-[11px]", BRANCH_BADGE[row.original.branch] ?? "")}
          >
            {row.original.branch}
          </Badge>
        ),
      },
      {
        accessorKey: "name",
        header: "Name (Telugu)",
        size: 200,
        filterFn: fuzzyFilterFn,
        cell: ({ row }) => (
          <span className="text-sm font-semibold text-foreground" lang="te">
            {row.original.name}
          </span>
        ),
      },
      {
        accessorKey: "nameEn",
        header: "Name (English)",
        size: 200,
        cell: ({ row }) => <span className="text-sm">{row.original.nameEn}</span>,
      },
      {
        accessorKey: "slug",
        header: "Slug",
        size: 180,
        cell: ({ row }) => (
          <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {row.original.slug}
          </code>
        ),
      },
      {
        id: "articles",
        header: "Articles",
        size: 90,
        accessorFn: (row) => row._count?.contents ?? 0,
        cell: ({ row }) => (
          <span className="tabular-nums text-sm text-muted-foreground">
            {row.original._count?.contents ?? 0}
          </span>
        ),
      },
      {
        accessorKey: "active",
        header: "Status",
        size: 110,
        filterFn: activeFilterFn,
        cell: ({ row }) =>
          row.original.active ? (
            <Badge variant="outline" className="border-green-200 bg-green-100 text-green-700">
              Active
            </Badge>
          ) : (
            <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-600">
              Inactive
            </Badge>
          ),
      },
      {
        id: "actions",
        size: 50,
        enableSorting: false,
        enableHiding: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <RowActions row={row.original} onEdit={openEdit} onDelete={openDelete} />
        ),
      },
    ],
    [openEdit, openDelete],
  );

  const table = useReactTable({
    columns,
    data,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    state: { columnFilters, columnVisibility, pagination, sorting, rowSelection },
  });

  const branchCol = table.getColumn("branch");
  const activeCol = table.getColumn("active");
  const selectedBranch = (branchCol?.getFilterValue() as string[]) ?? [];
  const selectedActive = (activeCol?.getFilterValue() as string[]) ?? [];

  const toggleArrayFilter = (
    col: ReturnType<typeof table.getColumn>,
    value: string,
    checked: boolean,
  ) => {
    if (!col) return;
    const current = (col.getFilterValue() as string[]) ?? [];
    const next = checked ? [...current, value] : current.filter((v) => v !== value);
    col.setFilterValue(next.length ? next : undefined);
  };

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);

  const handleBulkActive = async (active: boolean) => {
    if (selectedRows.length === 0) return;
    setBulkLoading(true);
    try {
      const results = await Promise.all(
        selectedRows.map((r) =>
          fetch(`/api/desks/${r.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active }),
          }),
        ),
      );
      const failed = results.filter((r) => !r.ok).length;
      const ok = results.length - failed;
      setToast({
        msg:
          failed === 0
            ? `${active ? "Activated" : "Deactivated"} ${ok}`
            : `${ok} updated, ${failed} failed`,
        type: failed === 0 ? "success" : "error",
      });
      setRowSelection({});
      router.refresh();
    } catch (e: any) {
      setToast({ msg: e.message || "Bulk update failed", type: "error" });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!confirmBulkDelete) return;
    setBulkLoading(true);
    try {
      const results = await Promise.all(
        confirmBulkDelete.map((r) => fetch(`/api/desks/${r.id}`, { method: "DELETE" })),
      );
      const failed = results.filter((r) => !r.ok).length;
      const ok = results.length - failed;
      setToast({
        msg:
          failed === 0
            ? `Deleted ${ok}`
            : `${ok} deleted, ${failed} failed — desks with articles can't be deleted`,
        type: failed === 0 ? "success" : "error",
      });
      setConfirmBulkDelete(null);
      setRowSelection({});
      router.refresh();
    } catch (e: any) {
      setToast({ msg: e.message || "Bulk delete failed", type: "error" });
      setConfirmBulkDelete(null);
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div className="shadcn-scope space-y-4">
      {toast && (
        <div
          className={cn(
            "fixed right-5 top-5 z-50 rounded-md px-4 py-2 text-sm font-semibold text-white shadow-lg",
            toast.type === "error" ? "bg-red-600" : "bg-green-600",
          )}
        >
          {toast.msg}
        </div>
      )}

      {/* Filters toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Input
            aria-label="Search by name or slug"
            className={cn(
              "peer min-w-60 bg-white ps-9",
              Boolean(table.getColumn("name")?.getFilterValue()) && "pe-9",
            )}
            id={`${id}-search`}
            onChange={(e) => table.getColumn("name")?.setFilterValue(e.target.value)}
            placeholder="Search by name or slug..."
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

        {/* Branch filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <FilterIcon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
              Branch
              {selectedBranch.length > 0 && (
                <span className="-me-1 inline-flex h-5 items-center rounded border bg-background px-1 text-[0.625rem] font-medium text-muted-foreground/70">
                  {selectedBranch.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto min-w-44 p-3">
            <div className="space-y-3">
              <div className="text-xs font-medium text-muted-foreground">Filters</div>
              <div className="space-y-2.5">
                {BRANCHES.map((b) => (
                  <div className="flex items-center gap-2" key={b}>
                    <Checkbox
                      checked={selectedBranch.includes(b)}
                      id={`${id}-branch-${b}`}
                      onCheckedChange={(checked: boolean) => toggleArrayFilter(branchCol, b, checked)}
                    />
                    <Label className="cursor-pointer font-normal" htmlFor={`${id}-branch-${b}`}>
                      {b}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Status filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <FilterIcon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
              Status
              {selectedActive.length > 0 && (
                <span className="-me-1 inline-flex h-5 items-center rounded border bg-background px-1 text-[0.625rem] font-medium text-muted-foreground/70">
                  {selectedActive.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto min-w-40 p-3">
            <div className="space-y-3">
              <div className="text-xs font-medium text-muted-foreground">Filters</div>
              <div className="space-y-2.5">
                {["Active", "Inactive"].map((v) => (
                  <div className="flex items-center gap-2" key={v}>
                    <Checkbox
                      checked={selectedActive.includes(v)}
                      id={`${id}-active-${v}`}
                      onCheckedChange={(checked: boolean) => toggleArrayFilter(activeCol, v, checked)}
                    />
                    <Label className="cursor-pointer font-normal" htmlFor={`${id}-active-${v}`}>
                      {v}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

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

        <div className="ms-auto flex items-center gap-2">
          <Button
            aria-label="Refresh desks"
            title="Refresh"
            variant="outline"
            size="icon"
            disabled={refreshing}
            onClick={refresh}
          >
            <RefreshCwIcon
              size={16}
              className={cn("opacity-70", refreshing && "animate-spin")}
            />
          </Button>
          <Button onClick={() => setFormFor({ mode: "create" })}>
            <PlusIcon aria-hidden="true" className="-ms-1 opacity-90" size={16} />
            Add Desk
          </Button>
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
            onClick={() => handleBulkActive(true)}
          >
            Activate
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
            disabled={bulkLoading}
            onClick={() => handleBulkActive(false)}
          >
            Deactivate
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
            disabled={bulkLoading}
            onClick={() => setConfirmBulkDelete(selectedRows)}
          >
            <TrashIcon aria-hidden="true" className="-ms-1 opacity-70" size={14} />
            Delete {selectedRows.length}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRowSelection({})}>
            Cancel
          </Button>
        </div>
      )}

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
                  No desks found.
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
              {[10, 25, 50, 100].map((size) => (
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

      <DeskFormDialog
        target={formFor}
        onClose={() => setFormFor(null)}
        onSaved={(msg) => {
          setToast({ msg, type: "success" });
          setFormFor(null);
          router.refresh();
        }}
        onError={(msg) => setToast({ msg, type: "error" })}
      />

      {/* Bulk delete confirmation */}
      <AlertDialog
        open={!!confirmBulkDelete}
        onOpenChange={(open) => !open && !bulkLoading && setConfirmBulkDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {confirmBulkDelete?.length ?? 0} desk
              {(confirmBulkDelete?.length ?? 0) === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Desks with linked articles cannot be deleted — the API will reject those and the rest
              will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkLoading}
              onClick={handleBulkDelete}
            >
              {bulkLoading ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Single-row delete confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{confirmDelete?.nameEn}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              {(confirmDelete?._count?.contents ?? 0) > 0
                ? `This desk has ${confirmDelete?._count?.contents} article${
                    confirmDelete?._count?.contents === 1 ? "" : "s"
                  }. The delete API will reject this — reassign or archive those first.`
                : "This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!confirmDelete) return;
                try {
                  const res = await fetch(`/api/desks/${confirmDelete.id}`, { method: "DELETE" });
                  if (!res.ok) {
                    const json = await res.json().catch(() => ({}));
                    setToast({ msg: json.error || `Delete failed (HTTP ${res.status})`, type: "error" });
                    setConfirmDelete(null);
                    return;
                  }
                  setToast({ msg: "Deleted", type: "success" });
                  setConfirmDelete(null);
                  router.refresh();
                } catch (e: any) {
                  setToast({ msg: e.message || "Delete failed", type: "error" });
                  setConfirmDelete(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RowActions({
  row,
  onEdit,
  onDelete,
}: {
  row: DeskRow;
  onEdit: (row: DeskRow) => void;
  onDelete: (row: DeskRow) => void;
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
        <DropdownMenuItem onClick={() => onEdit(row)}>Edit</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => onDelete(row)}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DeskFormDialog({
  target,
  onClose,
  onSaved,
  onError,
}: {
  target: { mode: "create" } | { mode: "edit"; row: DeskRow } | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const isEdit = target?.mode === "edit";
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!target) return;
    setError("");
    if (target.mode === "edit") {
      const r = target.row;
      setForm({
        nameEn: r.nameEn || "",
        name: r.name || "",
        slug: r.slug || "",
        branch: r.branch,
        sortOrder: r.sortOrder ?? 0,
        active: r.active,
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [target]);

  const set = (key: keyof FormState, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    if (!form.name.trim() || !form.nameEn.trim() || !form.slug.trim()) {
      setError("Telugu name, English name and slug are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const url = isEdit && target.mode === "edit"
        ? `/api/desks/${target.row.id}`
        : "/api/desks";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Could not save");
        setSaving(false);
        return;
      }
      setSaving(false);
      onSaved(isEdit ? "Desk updated" : "Desk created");
    } catch (e: any) {
      setError(e.message || "Could not save");
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit desk" : "Add desk"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this desk's display name, slug, or branch."
              : "Create a new editorial desk. Most desks are auto-seeded from districts and categories — only add new ones for EDITORIAL branches or one-off bureaus."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="desk-name-te">Name (Telugu) *</Label>
            <Input
              id="desk-name-te"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Byline text shown to readers"
              lang="te"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desk-name-en">Name (English) *</Label>
            <Input
              id="desk-name-en"
              value={form.nameEn}
              onChange={(e) => set("nameEn", e.target.value)}
              placeholder="English name (admin only)"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="desk-slug">Slug *</Label>
              <Input
                id="desk-slug"
                value={form.slug}
                onChange={(e) => set("slug", e.target.value)}
                placeholder="desk-something"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desk-sort">Sort order</Label>
              <Input
                id="desk-sort"
                type="number"
                value={form.sortOrder}
                onChange={(e) => set("sortOrder", parseInt(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desk-branch">Branch *</Label>
            <Select value={form.branch} onValueChange={(v) => set("branch", v as Branch)}>
              <SelectTrigger id="desk-branch">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TOPICAL">Topical (per category)</SelectItem>
                <SelectItem value="GEOGRAPHIC">Geographic (region / district / AC)</SelectItem>
                <SelectItem value="EDITORIAL">Editorial (opinion / letters)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={form.active}
              onCheckedChange={(v) => set("active", v === true)}
            />
            <span className="text-sm">Active (selectable in editor)</span>
          </label>

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : isEdit ? "Save changes" : "Create desk"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
