"use client";

// Visual Pages list - TanStack + shadcn Table (mirrors /desks, /categories).
// Owns Create (new blank page), Clone (duplicate an existing page into a
// draft), and Delete. Edit links to the visual editor at
// /page-builder/visual/[id]. Dataset is small, so sort/filter/paginate run
// in memory.

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
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleXIcon,
  CopyIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  ListFilterIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";

import { confirm } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export interface VisualPageRow {
  id: string;
  name: string;
  slug: string;
  isPublished: boolean;
  updatedAt: string;
}

const fuzzyFilterFn: FilterFn<VisualPageRow> = (row, _columnId, filterValue) => {
  const haystack = `${row.original.name} ${row.original.slug}`.toLowerCase();
  return haystack.includes(String(filterValue ?? "").toLowerCase());
};

export function VisualPagesTable({ data: initialData, webUrl }: { data: VisualPageRow[]; webUrl: string }) {
  const id = useId();
  const router = useRouter();

  const [data, setData] = useState<VisualPageRow[]>(initialData);
  useEffect(() => setData(initialData), [initialData]);

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([{ id: "updatedAt", desc: true }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [bulkLoading, setBulkLoading] = useState(false);

  async function bulkPublish(publish: boolean, rows: VisualPageRow[]) {
    if (!rows.length) return;
    setBulkLoading(true);
    try {
      const results = await Promise.all(
        rows.map((r) =>
          fetch(`/api/page-builder/visual/${r.id}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ publish }),
          }),
        ),
      );
      const failed = results.filter((r) => !r.ok).length;
      const ok = results.length - failed;
      const verb = publish ? "Published" : "Unpublished";
      if (failed) toast.error(`${ok} ${verb.toLowerCase()}, ${failed} failed`);
      else toast.success(`${verb} ${ok}`);
      setRowSelection({});
      router.refresh();
    } finally {
      setBulkLoading(false);
    }
  }

  async function bulkDelete(rows: VisualPageRow[]) {
    if (!rows.length) return;
    if (
      !(await confirm({
        title: `Delete ${rows.length} page${rows.length === 1 ? "" : "s"}?`,
        description: "This permanently removes the selected pages and their published versions.",
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    setBulkLoading(true);
    try {
      const results = await Promise.all(
        rows.map((r) => fetch(`/api/page-builder/visual/${r.id}`, { method: "DELETE" })),
      );
      const failed = results.filter((r) => !r.ok).length;
      const ok = results.length - failed;
      if (failed) toast.error(`${ok} deleted, ${failed} failed`);
      else toast.success(`Deleted ${ok}`);
      setRowSelection({});
      router.refresh();
    } finally {
      setBulkLoading(false);
    }
  }

  async function createPage() {
    setCreating(true);
    try {
      const res = await fetch("/api/page-builder/visual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newName.trim() || "Untitled page" }),
      });
      if (!res.ok) {
        toast.error((await res.json().catch(() => ({}))).error || "Create failed");
        return;
      }
      const p = await res.json();
      router.push(`/page-builder/visual/${p.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function clonePage(row: VisualPageRow) {
    setBusyId(row.id);
    try {
      const res = await fetch("/api/page-builder/visual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cloneFromId: row.id }),
      });
      if (!res.ok) {
        toast.error((await res.json().catch(() => ({}))).error || "Clone failed");
        return;
      }
      toast.success(`Cloned “${row.name}”`);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function deletePage(row: VisualPageRow) {
    if (
      !(await confirm({
        title: `Delete “${row.name}”?`,
        description: "This permanently removes the page and its published version at /page/" + row.slug + ".",
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/page-builder/visual/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error((await res.json().catch(() => ({}))).error || "Delete failed");
        return;
      }
      toast.success("Deleted");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  const columns = useMemo<ColumnDef<VisualPageRow>[]>(
    () => [
      {
        id: "select",
        size: 36,
        enableSorting: false,
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
        accessorKey: "name",
        header: "Name",
        filterFn: fuzzyFilterFn,
        cell: ({ row }) => (
          <Link
            href={`/page-builder/visual/${row.original.id}`}
            className="font-semibold text-foreground hover:text-[#FF2C2C]"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: "slug",
        header: "URL",
        enableSorting: false,
        cell: ({ row }) => (
          <a
            href={`${webUrl}/page/${row.original.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <code className="rounded bg-muted px-1.5 py-0.5">/page/{row.original.slug}</code>
            <ExternalLinkIcon size={12} className="opacity-60" />
          </a>
        ),
      },
      {
        accessorKey: "isPublished",
        header: "Status",
        size: 110,
        cell: ({ row }) =>
          row.original.isPublished ? (
            <Badge variant="outline" className="border-green-200 bg-green-100 text-green-700">
              Published
            </Badge>
          ) : (
            <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-600">
              Draft
            </Badge>
          ),
      },
      {
        accessorKey: "updatedAt",
        header: "Last edit",
        size: 160,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {new Date(row.original.updatedAt).toLocaleString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        ),
      },
      {
        id: "actions",
        size: 130,
        enableSorting: false,
        header: () => <div className="text-right">Actions</div>,
        cell: ({ row }) => {
          const r = row.original;
          const busy = busyId === r.id;
          return (
            <div className="flex justify-end gap-1.5">
              <Button asChild size="icon" variant="outline" title="Edit">
                <Link href={`/page-builder/visual/${r.id}`} aria-label="Edit">
                  <PencilIcon size={15} className="opacity-70" />
                </Link>
              </Button>
              <Button size="icon" variant="outline" disabled={busy} onClick={() => clonePage(r)} title="Clone" aria-label="Clone">
                <CopyIcon size={15} className="opacity-70" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                disabled={busy}
                onClick={() => deletePage(r)}
                title="Delete"
                aria-label="Delete"
                className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-700"
              >
                <Trash2Icon size={15} className="opacity-70" />
              </Button>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busyId, webUrl],
  );

  const table = useReactTable({
    columns,
    data,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    state: { columnFilters, pagination, sorting, rowSelection },
  });

  const nameFilter = (table.getColumn("name")?.getFilterValue() ?? "") as string;
  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);

  return (
    <div className="shadcn-scope space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Visual Pages</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Free-form pages built with the visual (GrapesJS) editor. Published pages render at{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">/page/&lt;slug&gt;</code>.
        </p>
      </div>

      {/* Create + search toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          <Input
            className="w-60 bg-white"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createPage(); }}
            placeholder="New page name"
          />
          <Button onClick={createPage} disabled={creating}>
            <PlusIcon size={16} className="-ms-1 opacity-90" />
            {creating ? "Creating…" : "New page"}
          </Button>
        </div>

        {/* Bulk actions - appear inline when rows are selected. */}
        {selectedRows.length > 0 && (
          <div className="ms-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:text-green-700"
              disabled={bulkLoading}
              onClick={() => bulkPublish(true, selectedRows)}
            >
              <EyeIcon size={14} className="-ms-1 opacity-70" />
              Publish {selectedRows.length}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-700"
              disabled={bulkLoading}
              onClick={() => bulkPublish(false, selectedRows)}
            >
              <EyeOffIcon size={14} className="-ms-1 opacity-70" />
              Unpublish {selectedRows.length}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-700"
              disabled={bulkLoading}
              onClick={() => bulkDelete(selectedRows)}
            >
              <Trash2Icon size={14} className="-ms-1 opacity-70" />
              Delete {selectedRows.length}
            </Button>
          </div>
        )}

        <div className={selectedRows.length > 0 ? "relative" : "relative ms-auto"}>
          <Input
            aria-label="Search pages"
            className="peer w-60 bg-white ps-9"
            onChange={(e) => table.getColumn("name")?.setFilterValue(e.target.value)}
            placeholder="Search pages…"
            value={nameFilter}
          />
          <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-muted-foreground/80">
            <ListFilterIcon aria-hidden="true" size={16} />
          </div>
          {nameFilter && (
            <button
              aria-label="Clear search"
              className="absolute inset-y-0 end-0 flex h-full w-9 items-center justify-center text-muted-foreground/80 hover:text-foreground"
              onClick={() => table.getColumn("name")?.setFilterValue("")}
              type="button"
            >
              <CircleXIcon aria-hidden="true" size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-md border bg-background">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow className="hover:bg-transparent" key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead className="h-11" key={header.id} style={{ width: header.getSize() ? `${header.getSize()}px` : undefined }}>
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <div
                        className="flex h-full cursor-pointer select-none items-center gap-2"
                        onClick={header.column.getToggleSortingHandler()}
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
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell className="h-24 text-center text-muted-foreground" colSpan={columns.length}>
                  No visual pages yet. Create one above.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {table.getRowCount() > pagination.pageSize && (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Label className="max-sm:sr-only" htmlFor={`${id}-pagesize`}>Rows per page</Label>
            <Select onValueChange={(v) => table.setPageSize(Number(v))} value={pagination.pageSize.toString()}>
              <SelectTrigger className="w-fit whitespace-nowrap" id={`${id}-pagesize`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50].map((size) => (
                  <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button aria-label="Previous page" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()} size="icon" variant="outline">
              <ChevronLeftIcon size={16} />
            </Button>
            <Button aria-label="Next page" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()} size="icon" variant="outline">
              <ChevronRightIcon size={16} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
