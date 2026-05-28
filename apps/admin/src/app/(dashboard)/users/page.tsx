"use client";

// /users — admin user management. Mirrors the table architecture of
// /journalists (Tanstack React Table + shadcn primitives): search +
// faceted role filter + column visibility + sortable columns + bulk select +
// per-row dropdown. Create/edit happens in a small Dialog form.

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
  RefreshCwIcon,
  Sparkles,
  TrashIcon,
  UserPlusIcon,
} from "lucide-react";
import { z } from "zod";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Sidebar } from "@/components/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// ------------------------------ Types ------------------------------

interface User {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "EDITOR" | "SUB_EDITOR" | "REPORTER" | "USER";
  active: boolean;
  phone: string | null;
  createdAt: string;
  _count: { contents: number };
  // Pre-fill in the edit dialog when role is SUB_EDITOR / EDITOR. The
  // /api/users GET already includes this; the row shape just needs to know
  // about it.
  assignedCategories?: { category: { id: string; name: string; nameEn: string } }[];
  mustChangePassword?: boolean;
  // Reporter-only — null for every other role. Nested pending-update count
  // drives the "Review N" deep link in the merged Users table.
  reporterProfile?: {
    id: string;
    primaryDistrict: string | null;
    kycStatus: "PENDING" | "SUBMITTED" | "VERIFIED" | "REJECTED";
    kycRejectionNote: string | null;
    verifiedAt: string | null;
    _count: { profileUpdateRequests: number };
  } | null;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  articles: number;
  joinedAt: string;
  // Reporter-specific projections (empty / null for non-reporter rows).
  phone: string;
  district: string;
  kycStatus: string;
  pendingUpdates: number;
  reporterProfileId: string | null;
  raw: User;
}

function toRow(u: User): UserRow {
  return {
    id: u.id,
    name: u.name || "—",
    email: u.email,
    role: u.role,
    active: u.active,
    articles: u._count?.contents ?? 0,
    joinedAt: u.createdAt,
    phone: u.phone ?? "",
    district: u.reporterProfile?.primaryDistrict ?? "",
    kycStatus: u.reporterProfile?.kycStatus ?? "",
    pendingUpdates: u.reporterProfile?._count?.profileUpdateRequests ?? 0,
    reporterProfileId: u.reporterProfile?.id ?? null,
    raw: u,
  };
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  EDITOR: "Editor",
  SUB_EDITOR: "Sub Editor",
  REPORTER: "Reporter",
  USER: "User",
};

const ROLE_BADGE: Record<string, string> = {
  ADMIN: "border-red-300 bg-red-50 text-red-700",
  EDITOR: "border-blue-300 bg-blue-50 text-blue-700",
  SUB_EDITOR: "border-amber-300 bg-amber-50 text-amber-700",
  REPORTER: "border-emerald-300 bg-emerald-50 text-emerald-700",
  USER: "border-slate-300 bg-slate-50 text-slate-600",
};

const KYC_BADGE: Record<string, string> = {
  PENDING: "border-slate-300 bg-slate-50 text-slate-600",
  SUBMITTED: "border-blue-300 bg-blue-50 text-blue-700",
  VERIFIED: "border-emerald-300 bg-emerald-50 text-emerald-700",
  REJECTED: "border-red-300 bg-red-50 text-red-700",
};

// Multi-column text search — matches against name + email + phone.
const userSearchFilter: FilterFn<UserRow> = (row, _columnId, filterValue: string) => {
  if (!filterValue) return true;
  const q = filterValue.toLowerCase();
  const hay = [row.original.name, row.original.email, row.original.raw.phone ?? ""].join(" ").toLowerCase();
  return hay.includes(q);
};

const roleFilter: FilterFn<UserRow> = (row, columnId, filterValue: string[]) => {
  if (!filterValue || filterValue.length === 0) return true;
  return filterValue.includes(row.getValue<string>(columnId));
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

// ------------------------------ Page ------------------------------

export default function UsersPage() {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  // All reporter-specific columns visible by default. Non-reporter rows
  // render an em-dash in those cells, so admins always see at-a-glance
  // who's a reporter and their KYC / district / phone / pending updates
  // without having to pre-filter by role.
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }]);

  const [formFor, setFormFor] = useState<{ mode: "create" } | { mode: "edit"; user: User } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UserRow[] | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/users")
      .then((r) => r.json())
      .then((rows: User[]) => {
        setData(Array.isArray(rows) ? rows.map(toRow) : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-hide the Role column when the user has filtered to REPORTER only
  // — everyone in view shares the same role so the column is redundant.
  // Reporter-specific columns stay visible regardless (em-dash for non-
  // reporters) so the table layout is consistent across filter states.
  useEffect(() => {
    const roleFilterVal = columnFilters.find((f) => f.id === "role")?.value as string[] | undefined;
    const onlyReporter = roleFilterVal?.length === 1 && roleFilterVal[0] === "REPORTER";
    setColumnVisibility((prev) => ({
      ...prev,
      role: !onlyReporter,
    }));
  }, [columnFilters]);

  const openEdit = useCallback((u: User) => setFormFor({ mode: "edit", user: u }), []);
  const openDelete = useCallback((row: UserRow) => setConfirmDelete([row]), []);

  // Quick-action: verify a reporter's KYC straight from the row menu.
  // Reject + full profile edit live on /reporters where the existing
  // modals already handle the rejection-note input + KYC document review.
  // We just need fast-path "yes, this looks good" without leaving /users.
  const verifyReporterKyc = useCallback(async (row: UserRow) => {
    if (!row.reporterProfileId) return;
    try {
      const res = await fetch("/api/reporters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", profileId: row.reporterProfileId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Verify failed");
        return;
      }
      load();
    } catch (e: any) {
      alert(e.message || "Verify failed");
    }
  }, []);

  const columns = useMemo<ColumnDef<UserRow>[]>(
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
            onCheckedChange={(value) => row.toggleSelected(!!value)}
          />
        ),
      },
      {
        accessorKey: "name",
        header: "Name",
        size: 160,
        enableHiding: false,
        filterFn: userSearchFilter,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.getValue("name")}</span>
            {!row.original.active && (
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
      {
        accessorKey: "email",
        header: "Email",
        size: 220,
        cell: ({ row }) => (
          <span className="block truncate" title={row.getValue("email") as string}>
            {row.getValue("email")}
          </span>
        ),
      },
      {
        accessorKey: "role",
        header: "Role",
        size: 110,
        filterFn: roleFilter,
        cell: ({ row }) => {
          const r = row.getValue("role") as string;
          return (
            <Badge variant="outline" className={cn("border", ROLE_BADGE[r] ?? "border-slate-300 bg-slate-50 text-slate-700")}>
              {ROLE_LABEL[r] ?? r}
            </Badge>
          );
        },
      },
      // ---- Reporter-only columns. Hidden by default; the role-filter
      // effect below auto-shows them when the user filters to REPORTER.
      // Visibility can also be toggled via the View menu. Non-reporter
      // rows render an em-dash placeholder so the column stays well-
      // formed even when the user filters to "all roles".
      {
        accessorKey: "phone",
        header: "Phone",
        size: 115,
        cell: ({ row }) => {
          const p = row.original.phone;
          return p ? <span className="tabular-nums">{p}</span> : <span className="text-muted-foreground">—</span>;
        },
      },
      {
        accessorKey: "district",
        header: "District",
        size: 100,
        cell: ({ row }) => {
          const d = row.original.district;
          return d ? <span className="capitalize">{d}</span> : <span className="text-muted-foreground">—</span>;
        },
      },
      {
        accessorKey: "kycStatus",
        header: "KYC",
        size: 95,
        cell: ({ row }) => {
          const s = row.original.kycStatus;
          if (!s) return <span className="text-muted-foreground">—</span>;
          return (
            <Badge variant="outline" className={cn("border text-[10px] font-semibold uppercase tracking-wide", KYC_BADGE[s] ?? "border-slate-300 bg-slate-50 text-slate-700")}>
              {s}
            </Badge>
          );
        },
      },
      {
        accessorKey: "pendingUpdates",
        header: "Updates",
        size: 95,
        cell: ({ row }) => {
          const count = row.original.pendingUpdates;
          const reporterId = row.original.reporterProfileId;
          if (!reporterId) return <span className="text-muted-foreground">—</span>;
          return count > 0 ? (
            <Link href={`/profile-requests?reporterId=${reporterId}`}>
              <Button size="sm" variant="default" className="h-7 gap-1.5 px-2.5">
                <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] tabular-nums">{count}</Badge>
                Review
              </Button>
            </Link>
          ) : (
            <Link href={`/profile-requests?reporterId=${reporterId}&status=ALL`}>
              <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs">View</Button>
            </Link>
          );
        },
      },
      {
        accessorKey: "articles",
        header: "Articles",
        size: 75,
        cell: ({ row }) => <span className="tabular-nums">{row.getValue("articles")}</span>,
      },
      {
        accessorKey: "joinedAt",
        header: "Joined",
        size: 105,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{fmtDate(row.getValue("joinedAt"))}</span>
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
            onToggleActive={handleToggleActive}
            onVerifyKyc={verifyReporterKyc}
          />
        ),
      },
    ],
    [openEdit, openDelete, verifyReporterKyc],
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
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    state: { columnFilters, columnVisibility, pagination, sorting },
  });

  // Role facet — multi-select filter chips behind a Popover.
  const roleColumn = table.getColumn("role");
  const uniqueRoleValues = useMemo(() => {
    if (!roleColumn) return [] as string[];
    return Array.from(roleColumn.getFacetedUniqueValues().keys()).sort();
  }, [roleColumn, data]);
  const roleCounts = useMemo(() => {
    return roleColumn ? roleColumn.getFacetedUniqueValues() : new Map<string, number>();
  }, [roleColumn, data]);
  const selectedRoles = (roleColumn?.getFilterValue() as string[]) ?? [];

  const handleRoleChange = (checked: boolean, value: string) => {
    const current = (roleColumn?.getFilterValue() as string[]) ?? [];
    const next = checked ? [...current, value] : current.filter((v) => v !== value);
    roleColumn?.setFilterValue(next.length ? next : undefined);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      const results = await Promise.all(
        confirmDelete.map(async (r) => {
          const res = await fetch(`/api/users/${r.id}`, { method: "DELETE" });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            return { row: r, error: data.error || `HTTP ${res.status}` };
          }
          return { row: r, error: null };
        }),
      );
      const failures = results.filter((x) => x.error);
      table.resetRowSelection();
      setConfirmDelete(null);
      load();
      // Surface per-user 409s ("user has authored content") so the admin
      // knows which rows still need Deactivate instead.
      if (failures.length > 0) {
        const msg = failures
          .map((f) => `${f.row.name}: ${f.error}`)
          .join("\n");
        alert(`Some users couldn't be deleted:\n\n${msg}`);
      }
    } catch {
      setConfirmDelete(null);
      alert("Delete failed. Please try again.");
    }
  };

  // Toggle a single user's `active` flag via the PUT endpoint. Distinct from
  // Delete (which is a permanent DB remove) — Deactivate keeps the row but
  // blocks sign-in and pulls the user out of review pools.
  const handleToggleActive = async (row: UserRow) => {
    const nextActive = !row.active;
    try {
      const res = await fetch(`/api/users/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || `Failed (HTTP ${res.status})`);
        return;
      }
      load();
    } catch {
      alert("Toggle failed. Please try again.");
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111", marginBottom: 4 }}>Users</h1>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
          Manage admins, editors, sub-editors and reporters
        </p>

        <div className="shadcn-scope space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Input
                aria-label="Filter by name, email or phone"
                className={cn(
                  "peer min-w-60 bg-white ps-9",
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

            {/* Role filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline">
                  <FilterIcon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
                  Role
                  {selectedRoles.length > 0 && (
                    <span className="-me-1 inline-flex h-5 items-center rounded border bg-background px-1 text-[0.625rem] font-medium text-muted-foreground/70">
                      {selectedRoles.length}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto min-w-40 p-3">
                <div className="space-y-3">
                  <div className="text-xs font-medium text-muted-foreground">Filters</div>
                  <div className="space-y-3">
                    {uniqueRoleValues.map((value, i) => (
                      <div className="flex items-center gap-2" key={value}>
                        <Checkbox
                          checked={selectedRoles.includes(value)}
                          id={`${id}-role-${i}`}
                          onCheckedChange={(checked: boolean) => handleRoleChange(checked, value)}
                        />
                        <Label
                          className="flex grow justify-between gap-2 font-normal"
                          htmlFor={`${id}-role-${i}`}
                        >
                          {ROLE_LABEL[value] ?? value}
                          <span className="ms-2 text-xs text-muted-foreground">{roleCounts.get(value)}</span>
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
              {/* Refetch — re-runs /api/users via load(). spin while loading
                  so it's clear the click did something. */}
              <Button
                aria-label="Refresh users"
                title="Refresh"
                variant="outline"
                size="icon"
                disabled={loading}
                onClick={() => load()}
              >
                <RefreshCwIcon
                  size={16}
                  className={cn("opacity-70", loading && "animate-spin")}
                />
              </Button>
              {table.getSelectedRowModel().rows.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() =>
                    setConfirmDelete(table.getSelectedRowModel().rows.map((r) => r.original))
                  }
                >
                  <TrashIcon aria-hidden="true" className="-ms-1 opacity-60" size={16} />
                  Delete ({table.getSelectedRowModel().rows.length})
                </Button>
              )}
              <Button onClick={() => setFormFor({ mode: "create" })}>
                <UserPlusIcon aria-hidden="true" className="-ms-1 opacity-90" size={16} />
                Add User
              </Button>
            </div>
          </div>

          {/* Table — wrapper scrolls horizontally on narrow viewports so
              the rest of the page chrome stays put (sidebar / pagination
              don't shift). table-fixed + per-column widths keep alignment
              stable while scrolling. */}
          <div className="overflow-x-auto rounded-md border bg-background">
            <Table className="table-fixed min-w-[1100px]">
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
                      {loading ? "Loading users..." : "No users found."}
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
                  {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}-
                  {Math.min(
                    Math.max(
                      table.getState().pagination.pageIndex * table.getState().pagination.pageSize + table.getState().pagination.pageSize,
                      0,
                    ),
                    table.getRowCount(),
                  )}
                </span>{" "}
                of <span className="text-foreground">{table.getRowCount().toString()}</span>
              </p>
            </div>

            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <Button
                    aria-label="First page"
                    className="disabled:pointer-events-none disabled:opacity-50"
                    onClick={() => table.firstPage()}
                    disabled={!table.getCanPreviousPage()}
                    size="icon"
                    variant="outline"
                  >
                    <ChevronFirstIcon aria-hidden="true" size={16} />
                  </Button>
                </PaginationItem>
                <PaginationItem>
                  <Button
                    aria-label="Previous page"
                    className="disabled:pointer-events-none disabled:opacity-50"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                    size="icon"
                    variant="outline"
                  >
                    <ChevronLeftIcon aria-hidden="true" size={16} />
                  </Button>
                </PaginationItem>
                <PaginationItem>
                  <Button
                    aria-label="Next page"
                    className="disabled:pointer-events-none disabled:opacity-50"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                    size="icon"
                    variant="outline"
                  >
                    <ChevronRightIcon aria-hidden="true" size={16} />
                  </Button>
                </PaginationItem>
                <PaginationItem>
                  <Button
                    aria-label="Last page"
                    className="disabled:pointer-events-none disabled:opacity-50"
                    onClick={() => table.lastPage()}
                    disabled={!table.getCanNextPage()}
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

      {/* Create / Edit */}
      {formFor && (
        <UserFormDialog
          mode={formFor.mode}
          user={formFor.mode === "edit" ? formFor.user : null}
          onClose={() => setFormFor(null)}
          onSaved={() => {
            setFormFor(null);
            load();
          }}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Permanently delete {confirmDelete?.length ?? 0} user
              {confirmDelete && confirmDelete.length > 1 ? "s" : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the account from the database — there is no undo.
              Users who have authored articles can&apos;t be deleted; for those,
              use <strong>Deactivate</strong> in the row menu instead (the user
              can no longer sign in but their content stays attributed).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ------------------------------ Row actions ------------------------------

function RowActions({
  row,
  onEdit,
  onDelete,
  onToggleActive,
  onVerifyKyc,
}: {
  row: UserRow;
  onEdit: (u: User) => void;
  onDelete: (row: UserRow) => void;
  onToggleActive: (row: UserRow) => void;
  onVerifyKyc: (row: UserRow) => void;
}) {
  const isReporter = row.role === "REPORTER";
  const kycSubmitted = isReporter && row.kycStatus === "SUBMITTED";
  const hasUpdates = isReporter && row.pendingUpdates > 0;
  const reporterPid = row.reporterProfileId;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="size-7">
          <EllipsisIcon aria-hidden="true" size={16} />
          <span className="sr-only">Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEdit(row.raw)}>Edit</DropdownMenuItem>

        {/* Reporter-specific quick actions. Shown only on REPORTER rows so
            the menu stays lean for everyone else. The full KYC review
            workflow (reject with mandatory note, document viewer, banking
            inspection) lives on /reporters — the link below routes there. */}
        {isReporter && (
          <>
            <DropdownMenuSeparator />
            {kycSubmitted && (
              <DropdownMenuItem
                onSelect={() => onVerifyKyc(row)}
                className="text-emerald-700 focus:text-emerald-700"
              >
                Verify KYC
              </DropdownMenuItem>
            )}
            {hasUpdates && reporterPid && (
              <DropdownMenuItem asChild>
                <Link href={`/profile-requests?reporterId=${reporterPid}`}>
                  Review {row.pendingUpdates} profile update{row.pendingUpdates === 1 ? "" : "s"}
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link href="/reporters">Open reporter portal →</Link>
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />
        {/* Deactivate / Activate — soft action. Flips User.active so the
            user can no longer sign in (and is pulled out of review pools)
            but their authored content + audit trail stay intact. */}
        <DropdownMenuItem onSelect={() => onToggleActive(row)}>
          {row.active ? "Deactivate" : "Activate"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => onDelete(row)}
          className="text-destructive focus:text-destructive"
        >
          {/* Hard delete — permanently removes the row. Blocked server-side
              if the user has authored content; admins use Deactivate then. */}
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ------------------------------ Form Dialog ------------------------------

// ------------------------------ Zod schema ------------------------------

// `mode` is captured at submit time to swap "password required" rules
// between create (must have one) and edit (optional — empty means keep
// current). Categories are validated as an array but the requirement that
// SUB_EDITOR / EDITOR have at least one is enforced via `refine` so the
// error attaches to the right field.
function userFormSchema(mode: "create" | "edit") {
  const passwordRule = mode === "create"
    ? z.string().min(8, "Password must be at least 8 characters")
    : z.string().min(0).refine((v) => v === "" || v.length >= 8, "Password must be at least 8 characters");

  return z.object({
    name: z.string().trim().min(1, "Name is required"),
    email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
    password: passwordRule,
    role: z.enum(["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"]),
    active: z.boolean(),
    mustChangePassword: z.boolean(),
    categoryIds: z.array(z.string()),
  }).refine(
    (v) => !(v.role === "SUB_EDITOR" || v.role === "EDITOR") || v.categoryIds.length > 0,
    { path: ["categoryIds"], message: "Pick at least one category for this role" },
  );
}
type FormErrors = Partial<Record<"name" | "email" | "password" | "role" | "categoryIds", string>>;

// 12-char password with at least one upper / lower / digit / symbol, then
// shuffled. Ambiguous chars (0/O/1/l/I) omitted so admins can dictate it
// over the phone if they need to.
function generatePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "@#$%&*";
  const all = upper + lower + digits + symbols;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < 12) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

interface CategoryOption {
  id: string;
  name: string;
  nameEn: string;
  // The category's brand colour from the DB — used to tint the selected
  // chip in the assigned-categories picker. Falls back to the brand red.
  color?: string | null;
}

function UserFormDialog({
  mode,
  user,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  user: User | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<User["role"]>(user?.role ?? "REPORTER");
  const [active, setActive] = useState<boolean>(user?.active ?? true);
  // Default to forcing change on first login for new accounts — admin types
  // a temporary password and the user picks their own next time in. Editing
  // an existing user mirrors whatever the row currently has.
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(
    user?.mustChangePassword ?? mode === "create",
  );

  // Categories: fetched once on mount; selected state pre-fills from the
  // user being edited (when role is SUB_EDITOR / EDITOR — Admin/Reporter
  // ignore this even if it was set previously).
  const [allCategories, setAllCategories] = useState<CategoryOption[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(
    user?.assignedCategories?.map((a) => a.category.id) ?? [],
  );

  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAllCategories(data);
      })
      .catch(() => setAllCategories([]));
  }, []);

  const needsCategories = role === "SUB_EDITOR" || role === "EDITOR";

  const clearError = (field: keyof FormErrors) =>
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

  const toggleCategory = (catId: string, checked: boolean) => {
    setSelectedCategoryIds((prev) => (checked ? [...prev, catId] : prev.filter((id) => id !== catId)));
    clearError("categoryIds");
  };

  const onGeneratePassword = () => {
    setPassword(generatePassword());
    clearError("password");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    const parsed = userFormSchema(mode).safeParse({
      name,
      email,
      password,
      role,
      active,
      mustChangePassword,
      // Only send categoryIds when the role uses them; otherwise empty list
      // so the validation refine doesn't trip on Admin/Reporter.
      categoryIds: needsCategories ? selectedCategoryIds : [],
    });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setErrors({
        name: flat.name?.[0],
        email: flat.email?.[0],
        password: flat.password?.[0],
        role: flat.role?.[0],
        categoryIds: flat.categoryIds?.[0],
      });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const path = mode === "create" ? "/api/users" : `/api/users/${user!.id}`;
      const method = mode === "create" ? "POST" : "PUT";
      const body: Record<string, unknown> = {
        name: parsed.data.name,
        email: parsed.data.email,
        role: parsed.data.role,
        active: parsed.data.active,
        mustChangePassword: parsed.data.mustChangePassword,
      };
      if (parsed.data.password) body.password = parsed.data.password;
      if (needsCategories) body.categoryIds = parsed.data.categoryIds;
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setServerError(j.error || `Failed (${res.status})`);
        setBusy(false);
        return;
      }
      onSaved();
    } catch (e: any) {
      setServerError(e?.message || "Network error");
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add User" : "Edit User"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Create a new account with a role and starting password."
              : "Update this user's details. Leave password empty to keep current."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="u-name">Name</Label>
            <Input
              id="u-name"
              value={name}
              onChange={(e) => { setName(e.target.value); clearError("name"); }}
              aria-invalid={!!errors.name}
              autoFocus
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="u-email">Email</Label>
            <Input
              id="u-email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearError("email"); }}
              autoComplete="off"
              aria-invalid={!!errors.email}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="u-password">
              Password {mode === "edit" && <span className="text-muted-foreground font-normal">(leave empty to keep)</span>}
            </Label>
            <div className="flex gap-2">
              <Input
                id="u-password"
                type="text"
                value={password}
                onChange={(e) => { setPassword(e.target.value); clearError("password"); }}
                placeholder={mode === "create" ? "Min 8 characters" : "••••••••"}
                autoComplete="new-password"
                aria-invalid={!!errors.password}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={onGeneratePassword}
                aria-label="Generate password"
                title="Generate a strong password"
              >
                <Sparkles className="size-4" />
              </Button>
            </div>
            {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
            <label className="flex items-center gap-2 pt-1 cursor-pointer">
              <Checkbox
                id="u-must-change"
                checked={mustChangePassword}
                onCheckedChange={(v) => setMustChangePassword(!!v)}
              />
              <span className="text-xs text-muted-foreground">
                Force user to change password on first login (one-time temporary password)
              </span>
            </label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="u-role">Role</Label>
            <Select
              value={role}
              onValueChange={(v) => {
                setRole(v as User["role"]);
                // When switching AWAY from a category-using role, drop any
                // selections so the validation passes; when switching TO one,
                // surface the empty-list error after the next submit.
                clearError("categoryIds");
              }}
            >
              <SelectTrigger id="u-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="EDITOR">Editor</SelectItem>
                <SelectItem value="SUB_EDITOR">Sub Editor</SelectItem>
                <SelectItem value="REPORTER">Reporter</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {role === "ADMIN" && "Full access — HR, payments, settings, every editorial action."}
              {role === "EDITOR" && "Editorial workflow (approve, publish) + Page Builder + ePaper. Assign categories below."}
              {role === "SUB_EDITOR" && "Reviews articles in assigned categories. Cannot approve or publish."}
              {role === "REPORTER" && "Writes own articles. Uses the reporter mobile/web app, not this admin."}
            </p>
          </div>

          {/* Categories — MultiSelect dropdown with search, select-all/clear,
              and removable pills in the trigger. Same UX as the
              wds-shadcn-registry multi-select but built on the primitives
              already in this app (Popover + Checkbox), no `cmdk` dependency. */}
          {needsCategories && (
            <div className="space-y-1.5">
              <Label>Assigned categories</Label>
              <MultiSelect
                options={allCategories.map((c) => ({
                  value: c.id,
                  label: c.nameEn,
                  color: c.color ?? "#FF2C2C",
                }))}
                value={selectedCategoryIds}
                onChange={(next) => {
                  setSelectedCategoryIds(next);
                  clearError("categoryIds");
                }}
                placeholder={allCategories.length === 0 ? "No categories available" : "Select categories…"}
                searchPlaceholder="Search categories…"
                aria-invalid={!!errors.categoryIds}
                disabled={allCategories.length === 0}
              />
              {errors.categoryIds && <p className="text-xs text-destructive">{errors.categoryIds}</p>}
              <p className="text-xs text-muted-foreground">
                {selectedCategoryIds.length} selected · {role === "SUB_EDITOR"
                  ? "Articles in these categories route to this sub-editor's review queue."
                  : "Editor will see review queues across these categories."}
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Checkbox id="u-active" checked={active} onCheckedChange={(v) => setActive(!!v)} />
            <Label htmlFor="u-active" className="font-normal">Active</Label>
          </div>

          {serverError && <p className="text-xs text-destructive">{serverError}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy ? (mode === "create" ? "Creating..." : "Saving...") : mode === "create" ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
