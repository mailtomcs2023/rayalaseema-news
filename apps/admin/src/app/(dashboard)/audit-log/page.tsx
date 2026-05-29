// /audit-log - read-only stream of every write the API logged via
// lib/audit.ts. Server paginates because the table grows unbounded; the
// client uses TanStack with manualPagination so the chrome matches every
// other admin list (Content, Users, Reporters) - same Table / Select /
// Pagination / DatePicker components, same row-click expander pattern.
"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  type PaginationState,
  useReactTable,
} from "@tanstack/react-table";
import {
  ChevronFirstIcon,
  ChevronLastIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface AuditLog {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  resource: string | null;
  resourceId: string | null;
  meta: any;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  actor: { id: string; name: string; email: string; role: string } | null;
}

const ACTION_COLORS: Record<string, string> = {
  create: "#16a34a",
  publish: "#7c3aed",
  schedule: "#0891b2",
  update: "#0284c7",
  delete: "#dc2626",
  restore: "#ea580c",
  login: "#64748b",
  logout: "#64748b",
};

function actionTone(action: string) {
  const verb = action.split(".")[1] || action;
  for (const key of Object.keys(ACTION_COLORS)) {
    if (verb.includes(key)) return ACTION_COLORS[key];
  }
  return "#475569";
}

// "_blank" sentinel - shadcn Select rejects empty-string values, so we
// use this for the "All actions" / "All resources" options and translate
// back to "" before fetching.
const ALL = "_all";

const ACTION_OPTIONS = [
  { value: "article.create", label: "article.create" },
  { value: "article.update", label: "article.update" },
  { value: "article.publish", label: "article.publish" },
  { value: "article.schedule", label: "article.schedule" },
  { value: "article.delete", label: "article.delete" },
  { value: "article.restore", label: "article.restore" },
  { value: "user", label: "user.*" },
  { value: "auth", label: "auth.*" },
] as const;

const RESOURCE_OPTIONS = ["article", "user", "category", "comment", "settings"] as const;

export default function AuditLogPage() {
  const id = useId();

  // Server-driven filters + pagination. Default pageSize 10 matches every
  // other admin list; users pick higher via the rows-per-page select.
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [resource, setResource] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [expanded, setExpanded] = useState<string | null>(null);

  // Reset to page 0 whenever any filter changes - otherwise we'd keep
  // page=3 while the result set shrunk to 1 page.
  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [search, action, resource, from, to]);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(pagination.pageIndex + 1),
      limit: String(pagination.pageSize),
    });
    if (search) params.set("search", search);
    if (action) params.set("action", action);
    if (resource) params.set("resource", resource);
    if (from) params.set("from", new Date(from).toISOString());
    if (to) params.set("to", new Date(to).toISOString());

    fetch(`/api/audit-logs?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setLogs(data.logs || []);
        setTotal(data.total || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [pagination.pageIndex, pagination.pageSize, search, action, resource, from, to]);

  useEffect(() => { load(); }, [load]);

  const columns = useMemo<ColumnDef<AuditLog>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "When",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "medium" })}
          </span>
        ),
      },
      {
        accessorKey: "actor",
        header: "Actor",
        cell: ({ row }) => {
          const log = row.original;
          return (
            <span className="text-xs">
              {log.actor?.name || log.actorEmail || "system"}
              {log.actorRole && (
                <span className="ml-1.5 text-[10px] text-muted-foreground">· {log.actorRole}</span>
              )}
            </span>
          );
        },
      },
      {
        accessorKey: "action",
        header: "Action",
        cell: ({ row }) => {
          const tone = actionTone(row.original.action);
          return (
            <span
              className="inline-block rounded px-2 py-0.5 font-mono text-[11px] font-bold"
              style={{ background: tone + "22", color: tone }}
            >
              {row.original.action}
            </span>
          );
        },
      },
      {
        accessorKey: "resource",
        header: "Resource",
        cell: ({ row }) => {
          const log = row.original;
          return (
            <span className="text-xs text-muted-foreground">
              {log.resource}
              {log.resourceId && (
                <span className="ml-1 font-mono text-[11px] text-muted-foreground/70">{log.resourceId.slice(-8)}</span>
              )}
            </span>
          );
        },
      },
      {
        accessorKey: "ipAddress",
        header: "IP",
        cell: ({ row }) => (
          <span className="font-mono text-[11px] text-muted-foreground">{row.original.ipAddress || "-"}</span>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: logs,
    columns,
    state: { pagination },
    onPaginationChange: setPagination,
    pageCount: Math.max(1, Math.ceil(total / pagination.pageSize)),
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  return (
    <div className="flex min-h-screen bg-muted/40">
      <main className="shadcn-scope flex-1 p-6" style={{ marginLeft: 240 }}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">Audit Log</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {total.toLocaleString()} {total === 1 ? "entry" : "entries"}
            </p>
          </div>
        </div>

        {/* Filters - shadcn Input / Select / DatePicker for consistency
            with /content, /users, /reporters. */}
        <div className="mb-4 grid gap-2 rounded-lg border bg-background p-3 shadow-sm md:grid-cols-[1fr_180px_160px_170px_170px]">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email, action, resource ID…"
          />
          <Select
            value={action || ALL}
            onValueChange={(v) => setAction(v === ALL ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All actions</SelectItem>
              {ACTION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={resource || ALL}
            onValueChange={(v) => setResource(v === ALL ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All resources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All resources</SelectItem>
              {RESOURCE_OPTIONS.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DatePicker value={from} onChange={setFrom} placeholder="From date" />
          <DatePicker value={to} onChange={setTo} placeholder="To date" />
        </div>

        {/* Table */}
        <div
          className="overflow-hidden rounded-md border bg-background"
          style={{ opacity: loading ? 0.6 : 1 }}
        >
          <Table className="table-fixed">
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((header) => (
                    <TableHead key={header.id} className="h-11">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length > 0 ? (
                table.getRowModel().rows.map((row) => {
                  const isExpanded = expanded === row.original.id;
                  return (
                    <Fragment key={row.id}>
                      <TableRow
                        onClick={() => setExpanded(isExpanded ? null : row.original.id)}
                        className={`cursor-pointer ${isExpanded ? "bg-muted/40" : ""}`}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id} className="last:py-0">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                      {isExpanded && (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={columns.length} className="py-3">
                            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                              Metadata
                            </p>
                            <pre className="m-0 whitespace-pre-wrap rounded border bg-background p-2.5 font-mono text-[11px] text-foreground">
                              {JSON.stringify(row.original.meta, null, 2)}
                            </pre>
                            {row.original.userAgent && (
                              <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                                UA: {row.original.userAgent}
                              </p>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell className="h-24 text-center" colSpan={columns.length}>
                    {loading ? "Loading audit log…" : "No audit entries"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination - same layout as /content + /users. Page size left,
            range counter + nav buttons right. */}
        <div className="mt-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Label className="max-sm:sr-only" htmlFor={`${id}-pagesize`}>
              Rows per page
            </Label>
            <Select
              value={pagination.pageSize.toString()}
              onValueChange={(v) => setPagination((p) => ({ ...p, pageSize: Number(v), pageIndex: 0 }))}
            >
              <SelectTrigger className="w-fit whitespace-nowrap" id={`${id}-pagesize`}>
                <SelectValue placeholder="Rows" />
              </SelectTrigger>
              <SelectContent>
                {[10, 15, 25, 50, 100].map((size) => (
                  <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <p aria-live="polite" className="whitespace-nowrap text-sm text-muted-foreground">
              <span className="text-foreground">
                {total === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1}
                -
                {Math.min((pagination.pageIndex + 1) * pagination.pageSize, total)}
              </span>{" "}
              of <span className="text-foreground">{total}</span>
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
      </main>
    </div>
  );
}

