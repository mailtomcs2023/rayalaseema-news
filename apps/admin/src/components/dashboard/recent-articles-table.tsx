"use client";

// Dashboard "Recent Articles" widget — visual chrome mirrors the /content
// page exactly: overflow-hidden rounded border wrapper, table-fixed with
// per-column sizes, h-11 headers, last:py-0 cells, h-24 empty state.
// Pagination + bulk-select are intentionally omitted — this is a 10-row
// preview widget, not a full listing. Use /content for paged browsing.

import {
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CircleXIcon,
  Columns3Icon,
  ListFilterIcon,
} from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface ArticleRow {
  id: string;
  title: string;
  status: string;
  viewCount: number;
  category: { name: string; nameEn: string | null; slug: string; color: string | null } | null;
  author: { name: string } | null;
}

// Per-status badge palette — mirrors /content + /users so a status looks
// identical wherever it appears in the admin.
const STATUS_BADGE: Record<string, string> = {
  PUBLISHED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  SCHEDULED: "border-violet-200 bg-violet-50 text-violet-700",
  DRAFT: "border-amber-200 bg-amber-50 text-amber-700",
  SUBMITTED: "border-blue-200 bg-blue-50 text-blue-700",
  IN_REVIEW: "border-blue-200 bg-blue-50 text-blue-700",
  APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  REJECTED: "border-red-200 bg-red-50 text-red-700",
  ARCHIVED: "border-slate-200 bg-slate-100 text-slate-600",
};

// Hex → rgba so a category's stored color (e.g. "#DC2626") becomes a
// soft tinted badge background; foreground keeps the full hex. Falls
// back to brand red when the color is missing or malformed.
function hexToTint(hex: string | null | undefined, alpha = 0.12): string {
  const h = (hex || "#FF2C2C").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return "rgba(255, 44, 44, 0.12)";
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Multi-column search — title + author + category, same pattern as
// userSearchFilter on /users.
const articleSearchFilter: FilterFn<ArticleRow> = (row, _columnId, filterValue: string) => {
  if (!filterValue) return true;
  const q = filterValue.toLowerCase();
  const hay = [
    row.original.title,
    row.original.author?.name ?? "",
    row.original.category?.name ?? "",
    row.original.category?.nameEn ?? "",
  ].join(" ").toLowerCase();
  return hay.includes(q);
};

export function RecentArticlesTable({ articles }: { articles: ArticleRow[] }) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const columns = useMemo<ColumnDef<ArticleRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Title",
        size: 360,
        enableHiding: false,
        filterFn: articleSearchFilter,
        cell: ({ row }) => (
          <Link
            href={`/content/${row.original.id}`}
            className="block max-w-[360px] truncate font-semibold text-foreground hover:text-primary"
            title={row.original.title}
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        accessorKey: "category.nameEn",
        id: "category",
        header: "Category",
        size: 140,
        cell: ({ row }) => {
          const c = row.original.category;
          if (!c) return <span className="text-muted-foreground">—</span>;
          const color = c.color || "#FF2C2C";
          return (
            <span
              className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold"
              style={{
                background: hexToTint(color, 0.14),
                color,
                border: `1px solid ${hexToTint(color, 0.32)}`,
              }}
            >
              {c.nameEn || c.name}
            </span>
          );
        },
      },
      {
        accessorKey: "author.name",
        id: "author",
        header: "Author",
        size: 140,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.author?.name || "—"}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 110,
        cell: ({ row }) => {
          const s = row.original.status;
          return (
            <Badge
              variant="outline"
              className={cn(
                "border text-[10px] font-semibold uppercase tracking-wide",
                STATUS_BADGE[s] ?? "border-slate-200 bg-slate-50 text-slate-700",
              )}
            >
              {s}
            </Badge>
          );
        },
      },
      {
        accessorKey: "viewCount",
        header: "Views",
        size: 90,
        cell: ({ row }) => (
          <span className="tabular-nums text-sm text-muted-foreground">
            {row.original.viewCount.toLocaleString()}
          </span>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: articles,
    columns,
    state: { sorting, columnFilters, columnVisibility },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableSortingRemoval: false,
  });

  const filterValue = (table.getColumn("title")?.getFilterValue() ?? "") as string;

  return (
    // shadcn-scope wrapper + space-y-4 matches /content + /users.
    <div className="shadcn-scope space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* Search — same Input + icon + clear-button pattern as /content. */}
        <div className="relative">
          <Input
            aria-label="Filter by title, author, or category"
            className={cn("peer min-w-60 bg-white ps-9", filterValue && "pe-9")}
            id={`${id}-input`}
            onChange={(e) => table.getColumn("title")?.setFilterValue(e.target.value)}
            placeholder="Filter by title, author, or category…"
            ref={inputRef}
            type="text"
            value={filterValue}
          />
          <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-muted-foreground/80">
            <ListFilterIcon aria-hidden="true" size={16} />
          </div>
          {filterValue && (
            <button
              aria-label="Clear filter"
              className="absolute inset-y-0 end-0 flex h-full w-9 items-center justify-center rounded-e-md text-muted-foreground/80 outline-none transition-colors hover:text-foreground"
              onClick={() => {
                table.getColumn("title")?.setFilterValue("");
                inputRef.current?.focus();
              }}
              type="button"
            >
              <CircleXIcon aria-hidden="true" size={16} />
            </button>
          )}
        </div>

        {/* Column visibility — identical to /content's View button. */}
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

        <span className="ms-auto whitespace-nowrap text-sm text-muted-foreground tabular-nums">
          <span className="text-foreground">{table.getFilteredRowModel().rows.length}</span> of{" "}
          <span className="text-foreground">{articles.length}</span>
        </span>
      </div>

      {/* Table — overflow-hidden rounded border + table-fixed, identical
          markup to /content/page.tsx. */}
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
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="flex h-full select-none items-center gap-1.5"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: <ChevronUpIcon size={14} className="opacity-60" />,
                          desc: <ChevronDownIcon size={14} className="opacity-60" />,
                        }[header.column.getIsSorted() as string] ?? null}
                      </button>
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
                  {filterValue ? "No articles match your filter." : "No recent articles."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
