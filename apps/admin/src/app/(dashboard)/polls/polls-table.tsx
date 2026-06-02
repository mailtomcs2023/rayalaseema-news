// Polls list - mirrors categories-table.tsx (TanStack + shadcn) so the admin
// has a single CRUD-table idiom. Create / edit live in a Dialog launched from
// the top-right "Create poll" button; deletes go through an AlertDialog.
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
  BarChart3,
  CircleDot,
  CircleXIcon,
  Clock,
  Columns3Icon,
  EllipsisIcon,
  FilterIcon,
  ListChecks,
  ListFilterIcon,
  Plus,
  PlusIcon,
  TrashIcon,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
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
import { DateTimePicker } from "@/components/ui/date-time-picker";
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

export interface PollOptionRow {
  id: string;
  text: string;
  votes: number;
}

export interface PollRow {
  id: string;
  question: string;
  active: boolean;
  allowMultiple: boolean;
  expiresAt: string | null;
  createdAt: string;
  options: PollOptionRow[];
}

// `key` is the React key + framer-motion AnimatePresence key. For existing
// options it's the DB id; for unsaved ones it's a generated string we mint
// once and keep stable for the life of the row. Without this, removing item
// 1 of 3 would re-key items 2/3 and AnimatePresence would animate the wrong
// elements.
interface FormOption {
  id?: string;
  key: string;
  text: string;
}

interface FormState {
  question: string;
  allowMultiple: boolean;
  expiresAt: string;
  active: boolean;
  options: FormOption[];
}

let _draftKeySeq = 0;
const newDraftKey = () => `draft-${++_draftKeySeq}-${Date.now()}`;

const emptyForm = (): FormState => ({
  question: "",
  allowMultiple: false,
  expiresAt: "",
  active: true,
  options: [
    { key: newDraftKey(), text: "" },
    { key: newDraftKey(), text: "" },
  ],
});

function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const fuzzyFilterFn: FilterFn<PollRow> = (row, _columnId, filterValue) => {
  const haystack = `${row.original.question} ${row.original.options.map((o) => o.text).join(" ")}`.toLowerCase();
  return haystack.includes(String(filterValue ?? "").toLowerCase());
};

// Status filter compares against the same derived label the badge shows so the
// chip text and the filter chip text stay in lockstep ("Closed" wins over
// "Active" once expiresAt passes).
const statusOf = (row: PollRow): "Active" | "Inactive" | "Closed" => {
  if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) return "Closed";
  return row.active ? "Active" : "Inactive";
};

const statusFilterFn: FilterFn<PollRow> = (row, _columnId, filterValue: string[]) => {
  if (!filterValue?.length) return true;
  return filterValue.includes(statusOf(row.original));
};

const typeFilterFn: FilterFn<PollRow> = (row, _columnId, filterValue: string[]) => {
  if (!filterValue?.length) return true;
  const t = row.original.allowMultiple ? "Multi" : "Single";
  return filterValue.includes(t);
};

export function PollsTable({ data: initialData }: { data: PollRow[] }) {
  const id = useId();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState<PollRow[]>(initialData);
  useEffect(() => setData(initialData), [initialData]);

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({ createdAt: false });
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const [formFor, setFormFor] = useState<{ mode: "create" } | { mode: "edit"; row: PollRow } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PollRow | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState<PollRow[] | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  const refresh = useCallback(() => router.refresh(), [router]);

  const openEdit = useCallback((row: PollRow) => setFormFor({ mode: "edit", row }), []);
  const openDelete = useCallback((row: PollRow) => setConfirmDelete(row), []);

  const toggleActive = useCallback(
    async (row: PollRow) => {
      const next = !row.active;
      setData((prev) => prev.map((p) => (p.id === row.id ? { ...p, active: next } : p)));
      try {
        const res = await fetch(`/api/polls/${row.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: next }),
        });
        if (!res.ok) throw new Error("Toggle failed");
        toast.success(next ? "Poll activated" : "Poll deactivated");
        refresh();
      } catch (e: any) {
        setData((prev) => prev.map((p) => (p.id === row.id ? { ...p, active: !next } : p)));
        toast.error(e.message || "Toggle failed");
      }
    },
    [refresh],
  );

  const columns = useMemo<ColumnDef<PollRow>[]>(
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
        accessorKey: "question",
        header: "Question",
        size: 320,
        filterFn: fuzzyFilterFn,
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground" title={row.original.question}>
              {row.original.question}
            </div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {row.original.options.length} option{row.original.options.length === 1 ? "" : "s"} ·{" "}
              {row.original.options
                .slice(0, 3)
                .map((o) => o.text)
                .join(" / ")}
              {row.original.options.length > 3 && " …"}
            </div>
          </div>
        ),
      },
      {
        id: "type",
        header: "Type",
        size: 120,
        accessorFn: (row) => (row.allowMultiple ? "Multi" : "Single"),
        filterFn: typeFilterFn,
        cell: ({ row }) =>
          row.original.allowMultiple ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <ListChecks size={13} /> Multi
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <CircleDot size={13} /> Single
            </span>
          ),
      },
      {
        id: "votes",
        header: "Votes",
        size: 100,
        accessorFn: (row) => row.options.reduce((s, o) => s + o.votes, 0),
        cell: ({ row }) => {
          const total = row.original.options.reduce((s, o) => s + o.votes, 0);
          return (
            <span className="inline-flex items-center gap-1.5 tabular-nums text-sm text-foreground">
              <BarChart3 size={13} className="opacity-60" /> {total}
            </span>
          );
        },
      },
      {
        accessorKey: "active",
        header: "Status",
        size: 110,
        filterFn: statusFilterFn,
        cell: ({ row }) => {
          const expired = row.original.expiresAt && new Date(row.original.expiresAt).getTime() < Date.now();
          if (expired) {
            return (
              <Badge variant="outline" className="border-amber-200 bg-amber-100 text-amber-700">
                Closed
              </Badge>
            );
          }
          return row.original.active ? (
            <Badge variant="outline" className="border-green-200 bg-green-100 text-green-700">
              Active
            </Badge>
          ) : (
            <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-600">
              Inactive
            </Badge>
          );
        },
      },
      {
        accessorKey: "expiresAt",
        header: "Closes",
        size: 140,
        cell: ({ row }) =>
          row.original.expiresAt ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock size={12} />
              {new Date(row.original.expiresAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground/50">-</span>
          ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        size: 120,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
        ),
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
            onEdit={openEdit}
            onDelete={openDelete}
            onToggleActive={toggleActive}
          />
        ),
      },
    ],
    [openEdit, openDelete, toggleActive],
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
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    state: { columnFilters, columnVisibility, pagination, rowSelection, sorting },
  });

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);

  const handleBulkActive = async (active: boolean) => {
    if (selectedRows.length === 0) return;
    setBulkLoading(true);
    try {
      const results = await Promise.all(
        selectedRows.map((r) =>
          fetch(`/api/polls/${r.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active }),
          }),
        ),
      );
      const failed = results.filter((r) => !r.ok).length;
      const ok = results.length - failed;
      if (failed === 0) {
        toast.success(`${active ? "Activated" : "Deactivated"} ${ok}`);
      } else {
        toast.error(`${ok} updated, ${failed} failed`);
      }
      setRowSelection({});
      refresh();
    } catch (e: any) {
      toast.error(e.message || "Bulk update failed");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!confirmBulkDelete) return;
    setBulkLoading(true);
    try {
      const results = await Promise.all(
        confirmBulkDelete.map((r) => fetch(`/api/polls/${r.id}`, { method: "DELETE" })),
      );
      const failed = results.filter((r) => !r.ok).length;
      const ok = results.length - failed;
      if (failed === 0) {
        toast.success(`Deleted ${ok}`);
      } else {
        toast.error(`${ok} deleted, ${failed} failed`);
      }
      setConfirmBulkDelete(null);
      setRowSelection({});
      refresh();
    } catch (e: any) {
      toast.error(e.message || "Bulk delete failed");
      setConfirmBulkDelete(null);
    } finally {
      setBulkLoading(false);
    }
  };

  // Filter column helpers — read current values for the popovers + view toggle.
  const statusCol = table.getColumn("active");
  const typeCol = table.getColumn("type");
  const selectedStatus = (statusCol?.getFilterValue() as string[]) ?? [];
  const selectedType = (typeCol?.getFilterValue() as string[]) ?? [];

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

  return (
    <div className="shadcn-scope space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Input
            aria-label="Search by question or option"
            className={cn(
              "peer min-w-60 bg-white ps-9",
              Boolean(table.getColumn("question")?.getFilterValue()) && "pe-9",
            )}
            id={`${id}-search`}
            onChange={(e) => table.getColumn("question")?.setFilterValue(e.target.value)}
            placeholder="Search polls..."
            ref={inputRef}
            type="text"
            value={(table.getColumn("question")?.getFilterValue() ?? "") as string}
          />
          <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-muted-foreground/80">
            <ListFilterIcon aria-hidden="true" size={16} />
          </div>
          {Boolean(table.getColumn("question")?.getFilterValue()) && (
            <button
              aria-label="Clear filter"
              className="absolute inset-y-0 end-0 flex h-full w-9 items-center justify-center rounded-e-md text-muted-foreground/80 outline-none transition-colors hover:text-foreground"
              onClick={() => {
                table.getColumn("question")?.setFilterValue("");
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
              {selectedStatus.length > 0 && (
                <span className="-me-1 inline-flex h-5 items-center rounded border bg-background px-1 text-[0.625rem] font-medium text-muted-foreground/70">
                  {selectedStatus.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto min-w-44 p-3">
            <div className="space-y-3">
              <div className="text-xs font-medium text-muted-foreground">Filters</div>
              <div className="space-y-2.5">
                {["Active", "Inactive", "Closed"].map((v) => (
                  <div className="flex items-center gap-2" key={v}>
                    <Checkbox
                      checked={selectedStatus.includes(v)}
                      id={`${id}-status-${v}`}
                      onCheckedChange={(checked: boolean) => toggleArrayFilter(statusCol, v, checked)}
                    />
                    <Label className="cursor-pointer font-normal" htmlFor={`${id}-status-${v}`}>
                      {v}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Type filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <FilterIcon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
              Type
              {selectedType.length > 0 && (
                <span className="-me-1 inline-flex h-5 items-center rounded border bg-background px-1 text-[0.625rem] font-medium text-muted-foreground/70">
                  {selectedType.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto min-w-40 p-3">
            <div className="space-y-3">
              <div className="text-xs font-medium text-muted-foreground">Filters</div>
              <div className="space-y-2.5">
                {["Single", "Multi"].map((v) => (
                  <div className="flex items-center gap-2" key={v}>
                    <Checkbox
                      checked={selectedType.includes(v)}
                      id={`${id}-type-${v}`}
                      onCheckedChange={(checked: boolean) => toggleArrayFilter(typeCol, v, checked)}
                    />
                    <Label className="cursor-pointer font-normal" htmlFor={`${id}-type-${v}`}>
                      {v}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* View toggle (column visibility) */}
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
          {selectedRows.length > 0 && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                disabled={bulkLoading}
                onClick={() => handleBulkActive(true)}
              >
                Activate {selectedRows.length}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                disabled={bulkLoading}
                onClick={() => handleBulkActive(false)}
              >
                Deactivate {selectedRows.length}
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
              <div className="mx-1 h-5 w-px bg-border" />
            </>
          )}
          {selectedRows.length === 0 && (
            <span className="text-sm text-muted-foreground">
              {table.getRowCount()} poll{table.getRowCount() === 1 ? "" : "s"}
            </span>
          )}
          <Button onClick={() => setFormFor({ mode: "create" })}>
            <PlusIcon aria-hidden="true" className="-ms-1 opacity-90" size={16} />
            Create poll
          </Button>
        </div>
      </div>

      {/* Table - wrapped in a white card with pagination footer inside,
          mirroring the /review queue layout. */}
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
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  if (header.isPlaceholder) return <TableHead key={header.id} />;
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const content = flexRender(header.column.columnDef.header, header.getContext());
                  return (
                    <TableHead key={header.id} style={{ width: `${header.getSize()}px` }}>
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
                <TableCell
                  colSpan={columns.length}
                  style={{ textAlign: "center", padding: 40, color: "#aaa" }}
                >
                  No polls yet. Click &quot;Create poll&quot; to add one.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Pagination footer inside the card, matching /review */}
        {data.length > 0 && (
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
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <Label className="text-xs" htmlFor={`${id}-pagesize`}>
                Rows
              </Label>
              <Select
                onValueChange={(value) => table.setPageSize(Number(value))}
                value={pagination.pageSize.toString()}
              >
                <SelectTrigger className="h-8 w-fit whitespace-nowrap" id={`${id}-pagesize`}>
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

      <PollFormDialog
        target={formFor}
        onClose={() => setFormFor(null)}
        onSaved={(msg) => {
          toast.success(msg);
          setFormFor(null);
          refresh();
        }}
      />

      <AlertDialog
        open={!!confirmBulkDelete}
        onOpenChange={(open) => !open && !bulkLoading && setConfirmBulkDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {confirmBulkDelete?.length ?? 0} poll
              {(confirmBulkDelete?.length ?? 0) === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmBulkDelete && (() => {
                const totalVotes = confirmBulkDelete.reduce(
                  (s, p) => s + p.options.reduce((ss, o) => ss + o.votes, 0),
                  0,
                );
                return totalVotes > 0
                  ? `${totalVotes} cast vote${totalVotes === 1 ? "" : "s"} will be deleted with them. This cannot be undone.`
                  : "This cannot be undone.";
              })()}
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

      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{confirmDelete?.question}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              All {confirmDelete?.options.reduce((s, o) => s + o.votes, 0) ?? 0} cast votes will be deleted with the poll. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!confirmDelete) return;
                try {
                  const res = await fetch(`/api/polls/${confirmDelete.id}`, { method: "DELETE" });
                  if (!res.ok) {
                    const json = await res.json().catch(() => ({}));
                    toast.error(json.error || `Delete failed (HTTP ${res.status})`);
                    setConfirmDelete(null);
                    return;
                  }
                  toast.success("Poll deleted");
                  setConfirmDelete(null);
                  refresh();
                } catch (e: any) {
                  toast.error(e.message || "Delete failed");
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
  onToggleActive,
}: {
  row: PollRow;
  onEdit: (row: PollRow) => void;
  onDelete: (row: PollRow) => void;
  onToggleActive: (row: PollRow) => void;
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
        <DropdownMenuItem onClick={() => onToggleActive(row)}>
          {row.active ? "Deactivate" : "Activate"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(row)}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PollFormDialog({
  target,
  onClose,
  onSaved,
}: {
  target: { mode: "create" } | { mode: "edit"; row: PollRow } | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const isEdit = target?.mode === "edit";
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!target) return;
    setError("");
    if (target.mode === "edit") {
      const r = target.row;
      setForm({
        question: r.question,
        allowMultiple: r.allowMultiple,
        expiresAt: isoToLocalInput(r.expiresAt),
        active: r.active,
        options: r.options.map((o) => ({ id: o.id, key: o.id, text: o.text })),
      });
    } else {
      setForm(emptyForm());
    }
  }, [target]);

  const setOption = (key: string, text: string) => {
    setForm((f) => ({ ...f, options: f.options.map((o) => (o.key === key ? { ...o, text } : o)) }));
  };
  const addOption = () => {
    if (form.options.length >= 12) return;
    setForm((f) => ({ ...f, options: [...f.options, { key: newDraftKey(), text: "" }] }));
  };
  const removeOption = (key: string) => {
    if (form.options.length <= 2) return;
    setForm((f) => ({ ...f, options: f.options.filter((o) => o.key !== key) }));
  };

  const save = async () => {
    const validOptions = form.options.map((o) => ({ id: o.id, text: o.text.trim() })).filter((o) => o.text);
    if (!form.question.trim()) {
      setError("Question is required.");
      return;
    }
    if (validOptions.length < 2) {
      setError("At least 2 non-empty options are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const url = isEdit && target.mode === "edit" ? `/api/polls/${target.row.id}` : "/api/polls";
      const method = isEdit ? "PUT" : "POST";
      const payload: any = {
        question: form.question.trim(),
        allowMultiple: form.allowMultiple,
        expiresAt: form.expiresAt || null,
        options: isEdit ? validOptions : validOptions.map((o) => o.text),
      };
      if (isEdit) payload.active = form.active;

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
      onSaved(isEdit ? "Poll updated" : "Poll created");
    } catch (e: any) {
      setError(e.message || "Could not save");
      setSaving(false);
    }
  };

  // Read-only results panel when editing - lets the admin see current vote
  // counts without leaving the dialog.
  const totalVotes =
    target?.mode === "edit"
      ? target.row.options.reduce((s, o) => s + o.votes, 0)
      : 0;

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit poll" : "Create poll"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the question, options, or close time. Removed options lose their votes."
              : "WhatsApp-style poll. Single or multiple answers, optional close time, up to 12 options."}
          </DialogDescription>
        </DialogHeader>

        {isEdit && target?.mode === "edit" && totalVotes > 0 && (
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Current results</span>
              <span className="tabular-nums">{totalVotes} vote{totalVotes === 1 ? "" : "s"}</span>
            </div>
            <div className="space-y-1.5">
              {target.row.options.map((o) => {
                const pct = totalVotes > 0 ? Math.round((o.votes / totalVotes) * 100) : 0;
                return (
                  <div key={o.id} className="relative overflow-hidden rounded border bg-background">
                    <div
                      className="absolute inset-y-0 left-0 bg-primary/15"
                      style={{ width: `${pct}%`, transition: "width 300ms ease" }}
                    />
                    <div className="relative flex items-center justify-between gap-2 px-2.5 py-1.5">
                      <span className="truncate text-xs">{o.text}</span>
                      <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                        {o.votes} ({pct}%)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="poll-question">Question *</Label>
            <Input
              id="poll-question"
              value={form.question}
              onChange={(e) => setForm({ ...form, question: e.target.value })}
              placeholder="ఏది మీ అభిప్రాయం?"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>Options ({form.options.length}/12) *</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addOption}
                disabled={form.options.length >= 12}
                className="h-7 gap-1 px-2 text-xs"
              >
                <Plus size={12} /> Add option
              </Button>
            </div>
            <div className="space-y-1.5">
              <AnimatePresence initial={false}>
                {form.options.map((o, i) => (
                  <motion.div
                    key={o.key}
                    layout
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -16, scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 480, damping: 32, mass: 0.7 }}
                    className="flex items-center gap-1.5"
                  >
                    <Input
                      value={o.text}
                      onChange={(e) => setOption(o.key, e.target.value)}
                      placeholder={`Option ${i + 1}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeOption(o.key)}
                      disabled={form.options.length <= 2}
                      aria-label="Remove option"
                      className="size-9 shrink-0"
                    >
                      <X size={14} />
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="flex items-center gap-2">
                <ListChecks size={14} className="opacity-70" /> Answer type
              </Label>
              <div className="flex items-center gap-2 pt-1.5">
                <Checkbox
                  id="poll-multi"
                  checked={form.allowMultiple}
                  onCheckedChange={(checked) => setForm({ ...form, allowMultiple: !!checked })}
                />
                <Label htmlFor="poll-multi" className="cursor-pointer font-normal">
                  Allow multiple answers
                </Label>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="flex items-center gap-2">
                <Clock size={14} className="opacity-70" /> Closes (optional)
              </Label>
              <DateTimePicker
                value={form.expiresAt}
                onChange={(v) => setForm({ ...form, expiresAt: v })}
                placeholder="No close time"
              />
            </div>
          </div>

          {isEdit && (
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="poll-active"
                checked={form.active}
                onCheckedChange={(checked) => setForm({ ...form, active: !!checked })}
              />
              <Label htmlFor="poll-active" className="cursor-pointer font-normal">
                Active (visible on the public site)
              </Label>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "Saving..." : isEdit ? "Save changes" : "Create poll"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
