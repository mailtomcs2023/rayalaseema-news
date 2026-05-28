// Categories list — client-side TanStack + shadcn Table (mirrors /content).
// Dataset is small (≈60 rows), so pagination/sorting/filtering all run in
// memory. CRUD is wired to /api/categories with the same translate-from-
// English + auto-slug ergonomics the legacy CrudTable shipped with.
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
  Languages,
  ListFilterIcon,
  PlusIcon,
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

// English text → URL-safe slug. Lowercase, dashes, alphanumerics only, ≤60 chars.
const slugify = (s: string) =>
  String(s)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 60);

export interface CategoryRow {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
  color: string | null;
  description: string | null;
  sortOrder: number;
  active: boolean;
  parentId: string | null;
  parent?: { id: string; nameEn: string; slug: string } | null;
  _count?: { contents: number };
}

interface FormState {
  nameEn: string;
  name: string;
  slug: string;
  color: string;
  description: string;
  sortOrder: number;
  parentId: string;
  active: boolean;
}

const EMPTY_FORM: FormState = {
  nameEn: "",
  name: "",
  slug: "",
  color: "#888888",
  description: "",
  sortOrder: 0,
  parentId: "",
  active: true,
};

// Search across English name, Telugu name, slug — covers the cases an
// editor is most likely to type.
const fuzzyFilterFn: FilterFn<CategoryRow> = (row, _columnId, filterValue) => {
  const haystack = `${row.original.nameEn} ${row.original.name} ${row.original.slug}`.toLowerCase();
  return haystack.includes(String(filterValue ?? "").toLowerCase());
};

const activeFilterFn: FilterFn<CategoryRow> = (row, _columnId, filterValue: string[]) => {
  if (!filterValue?.length) return true;
  const isActive = row.original.active ? "Active" : "Inactive";
  return filterValue.includes(isActive);
};

const hierarchyFilterFn: FilterFn<CategoryRow> = (row, _columnId, filterValue: string[]) => {
  if (!filterValue?.length) return true;
  const kind = row.original.parentId ? "Sub-category" : "Top-level";
  return filterValue.includes(kind);
};

export function CategoriesTable({ data: initialData }: { data: CategoryRow[] }) {
  const id = useId();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState<CategoryRow[]>(initialData);
  useEffect(() => setData(initialData), [initialData]);

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [sorting, setSorting] = useState<SortingState>([{ id: "sortOrder", desc: false }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const [formFor, setFormFor] = useState<{ mode: "create" } | { mode: "edit"; row: CategoryRow } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CategoryRow | null>(null);
  // Separate state for bulk delete so the single-row delete dialog above
  // doesn't have to know how many rows are involved.
  const [confirmBulkDelete, setConfirmBulkDelete] = useState<CategoryRow[] | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  const [toast, setToast] = useState<{ msg: string; type: "error" | "success" } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const openEdit = useCallback((row: CategoryRow) => setFormFor({ mode: "edit", row }), []);
  const openDelete = useCallback((row: CategoryRow) => setConfirmDelete(row), []);

  const columns = useMemo<ColumnDef<CategoryRow>[]>(
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
        accessorKey: "color",
        header: "Color",
        size: 70,
        enableSorting: false,
        cell: ({ row }) => (
          <span
            className="inline-block h-5 w-5 rounded border border-border"
            style={{ background: row.original.color || "#888" }}
            title={row.original.color || ""}
          />
        ),
      },
      {
        accessorKey: "name",
        header: "Telugu",
        size: 180,
        filterFn: fuzzyFilterFn,
        cell: ({ row }) => (
          <span className="text-sm font-semibold text-foreground" lang="te">
            {row.original.name}
          </span>
        ),
      },
      {
        accessorKey: "nameEn",
        header: "English",
        size: 180,
        cell: ({ row }) => <span className="text-sm">{row.original.nameEn}</span>,
      },
      {
        accessorKey: "slug",
        header: "Slug",
        size: 160,
        cell: ({ row }) => (
          <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {row.original.slug}
          </code>
        ),
      },
      {
        id: "parent",
        header: "Parent",
        size: 130,
        accessorFn: (row) => (row.parentId ? "Sub-category" : "Top-level"),
        filterFn: hierarchyFilterFn,
        cell: ({ row }) =>
          row.original.parent ? (
            <span className="text-xs text-muted-foreground">{row.original.parent.nameEn}</span>
          ) : (
            <span className="text-xs text-muted-foreground/60">—</span>
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
        size: 100,
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

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);

  const handleBulkActive = async (active: boolean) => {
    if (selectedRows.length === 0) return;
    setBulkLoading(true);
    try {
      const results = await Promise.all(
        selectedRows.map((r) =>
          fetch(`/api/categories/${r.id}`, {
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
      refresh();
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
        confirmBulkDelete.map((r) =>
          fetch(`/api/categories/${r.id}`, { method: "DELETE" }),
        ),
      );
      const failed = results.filter((r) => !r.ok).length;
      const ok = results.length - failed;
      setToast({
        msg:
          failed === 0
            ? `Deleted ${ok}`
            : `${ok} deleted, ${failed} failed — categories with articles can't be deleted`,
        type: failed === 0 ? "success" : "error",
      });
      setConfirmBulkDelete(null);
      setRowSelection({});
      refresh();
    } catch (e: any) {
      setToast({ msg: e.message || "Bulk delete failed", type: "error" });
      setConfirmBulkDelete(null);
    } finally {
      setBulkLoading(false);
    }
  };

  const activeCol = table.getColumn("active");
  const hierarchyCol = table.getColumn("parent");
  const selectedActive = (activeCol?.getFilterValue() as string[]) ?? [];
  const selectedHierarchy = (hierarchyCol?.getFilterValue() as string[]) ?? [];

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

  const refresh = () => router.refresh();

  return (
    <div className="shadcn-scope space-y-4">
      {/* Toast — fixed top-right, auto-dismiss */}
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

        {/* Hierarchy filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <FilterIcon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
              Hierarchy
              {selectedHierarchy.length > 0 && (
                <span className="-me-1 inline-flex h-5 items-center rounded border bg-background px-1 text-[0.625rem] font-medium text-muted-foreground/70">
                  {selectedHierarchy.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto min-w-44 p-3">
            <div className="space-y-3">
              <div className="text-xs font-medium text-muted-foreground">Filters</div>
              <div className="space-y-2.5">
                {["Top-level", "Sub-category"].map((v) => (
                  <div className="flex items-center gap-2" key={v}>
                    <Checkbox
                      checked={selectedHierarchy.includes(v)}
                      id={`${id}-hier-${v}`}
                      onCheckedChange={(checked: boolean) => toggleArrayFilter(hierarchyCol, v, checked)}
                    />
                    <Label className="cursor-pointer font-normal" htmlFor={`${id}-hier-${v}`}>
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

        <div className="ms-auto flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {table.getRowCount()} categor{table.getRowCount() === 1 ? "y" : "ies"}
          </span>
          <Button onClick={() => setFormFor({ mode: "create" })}>
            <PlusIcon aria-hidden="true" className="-ms-1 opacity-90" size={16} />
            Add Category
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
                  No categories found.
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

      {/* Create / edit dialog */}
      <CategoryFormDialog
        target={formFor}
        topLevelCategories={data.filter((c) => !c.parentId)}
        onClose={() => setFormFor(null)}
        onSaved={(msg) => {
          setToast({ msg, type: "success" });
          setFormFor(null);
          refresh();
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
              Delete {confirmBulkDelete?.length ?? 0} categor
              {(confirmBulkDelete?.length ?? 0) === 1 ? "y" : "ies"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Categories with linked articles cannot be deleted — the API will reject those and the
              rest will be removed.
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
                ? `This category has ${confirmDelete?._count?.contents} article${
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
                  const res = await fetch(`/api/categories/${confirmDelete.id}`, { method: "DELETE" });
                  if (!res.ok) {
                    const json = await res.json().catch(() => ({}));
                    setToast({ msg: json.error || `Delete failed (HTTP ${res.status})`, type: "error" });
                    setConfirmDelete(null);
                    return;
                  }
                  setToast({ msg: "Deleted", type: "success" });
                  setConfirmDelete(null);
                  refresh();
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
  row: CategoryRow;
  onEdit: (row: CategoryRow) => void;
  onDelete: (row: CategoryRow) => void;
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

function CategoryFormDialog({
  target,
  topLevelCategories,
  onClose,
  onSaved,
  onError,
}: {
  target: { mode: "create" } | { mode: "edit"; row: CategoryRow } | null;
  topLevelCategories: CategoryRow[];
  onClose: () => void;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const isEdit = target?.mode === "edit";
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [translating, setTranslating] = useState(false);
  // Track the slug we auto-derived so the user's manual edits aren't trampled.
  const [autoDerivedSlug, setAutoDerivedSlug] = useState("");

  useEffect(() => {
    if (!target) return;
    setError("");
    if (target.mode === "edit") {
      const r = target.row;
      setForm({
        nameEn: r.nameEn || "",
        name: r.name || "",
        slug: r.slug || "",
        color: r.color || "#888888",
        description: r.description || "",
        sortOrder: r.sortOrder ?? 0,
        parentId: r.parentId || "",
        active: r.active,
      });
      setAutoDerivedSlug(r.slug || "");
    } else {
      setForm(EMPTY_FORM);
      setAutoDerivedSlug("");
    }
  }, [target]);

  const set = (key: keyof FormState, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const onNameEnChange = (value: string) => {
    setForm((f) => {
      const derived = slugify(value);
      // Only auto-update the slug while it still matches what we last derived
      // — once the user edits it, leave them alone.
      const slugCol = !f.slug || f.slug === autoDerivedSlug ? derived : f.slug;
      return { ...f, nameEn: value, slug: slugCol };
    });
    setAutoDerivedSlug(slugify(value));
  };

  const translateTelugu = async () => {
    const src = form.nameEn.trim();
    if (!src) {
      onError("Enter the English name first");
      return;
    }
    setTranslating(true);
    try {
      const res = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: src, action: "phrase" }),
      });
      const json = await res.json();
      if (!res.ok || !json.result) {
        onError(json.error || "Translation failed");
      } else {
        const cleaned = String(json.result).trim().replace(/^["']|["']$/g, "");
        set("name", cleaned);
      }
    } catch (e: any) {
      onError(e.message || "Translation failed");
    }
    setTranslating(false);
  };

  const save = async () => {
    if (!form.nameEn.trim() || !form.name.trim()) {
      setError("Both English and Telugu names are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const url = isEdit && target.mode === "edit"
        ? `/api/categories/${target.row.id}`
        : "/api/categories";
      const method = isEdit ? "PUT" : "POST";
      const payload = {
        ...form,
        // Convert "" → null so the API can clear the parent on demand.
        parentId: form.parentId || null,
      };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Could not save");
        setSaving(false);
        return;
      }
      setSaving(false);
      onSaved(isEdit ? "Category updated" : "Category created");
    } catch (e: any) {
      setError(e.message || "Could not save");
      setSaving(false);
    }
  };

  // Editing a category can't re-parent it to itself — filter it out of the
  // parent dropdown.
  const parentOptions = topLevelCategories.filter(
    (c) => !isEdit || (target.mode === "edit" && c.id !== target.row.id),
  );

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit category" : "Add category"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this category's display name, slug, color, or hierarchy."
              : "Create a new category. The slug auto-derives from the English name."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="cat-name-en">Name (English) *</Label>
            <Input
              id="cat-name-en"
              value={form.nameEn}
              onChange={(e) => onNameEnChange(e.target.value)}
              placeholder="Category name in English"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="cat-name-te">Name (Telugu) *</Label>
            <div className="flex gap-2">
              <Input
                id="cat-name-te"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Category name in Telugu"
                lang="te"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={translateTelugu}
                disabled={translating || !form.nameEn.trim()}
                title="Translate English to Telugu"
              >
                <Languages size={16} className={translating ? "animate-pulse" : ""} />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="cat-slug">Slug</Label>
              <Input
                id="cat-slug"
                value={form.slug}
                onChange={(e) => set("slug", e.target.value)}
                placeholder="auto-generated"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cat-sort">Sort order</Label>
              <Input
                id="cat-sort"
                type="number"
                value={form.sortOrder}
                onChange={(e) => set("sortOrder", parseInt(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="cat-color">Color</Label>
              <div className="flex gap-2">
                <input
                  id="cat-color"
                  type="color"
                  value={form.color}
                  onChange={(e) => set("color", e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-input bg-transparent"
                />
                <Input
                  value={form.color}
                  onChange={(e) => set("color", e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cat-parent">Parent</Label>
              <Select value={form.parentId || "__none__"} onValueChange={(v) => set("parentId", v === "__none__" ? "" : v)}>
                <SelectTrigger id="cat-parent">
                  <SelectValue placeholder="Top-level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Top-level</SelectItem>
                  {parentOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nameEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="cat-desc">Description</Label>
            <Input
              id="cat-desc"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Optional"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={form.active}
              onCheckedChange={(v) => set("active", v === true)}
            />
            <span className="text-sm">Active</span>
          </label>

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : isEdit ? "Save changes" : "Create category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
