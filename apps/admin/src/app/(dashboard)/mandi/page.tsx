"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  CircleXIcon,
  Eye,
  EyeOff,
  ListFilterIcon,
  Pencil,
  Plus,
  RefreshCwIcon,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  RowSelectionState,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface MandiPrice {
  id: string;
  commodity: string;
  commodityEn: string;
  market: string;
  marketEn: string;
  price: number;
  unit: string;
  change: number;
  date: string;
  active: boolean;
}

const defaultCommodities = [
  { commodity: "మిర్చి", commodityEn: "Chilli" },
  { commodity: "పత్తి", commodityEn: "Cotton" },
  { commodity: "వేరుశనగ", commodityEn: "Groundnut" },
  { commodity: "వరి", commodityEn: "Paddy" },
  { commodity: "జొన్నలు", commodityEn: "Jowar" },
  { commodity: "కందులు", commodityEn: "Toor Dal" },
  { commodity: "శనగలు", commodityEn: "Bengal Gram" },
  { commodity: "ప్రత్తి గింజలు", commodityEn: "Cottonseed" },
];

const defaultMarkets = [
  { market: "కర్నూలు", marketEn: "Kurnool" },
  { market: "అనంతపురం", marketEn: "Anantapur" },
  { market: "కడప", marketEn: "Kadapa" },
  { market: "చిత్తూరు", marketEn: "Chittoor" },
];

export default function MandiPage() {
  // Role-gate destructive actions: only ADMINs can hard-delete, editors can
  // toggle active / edit price. Matches the backend route's auth check.
  const { data: session } = useSession();
  const role = (session?.user as any)?.role || "REPORTER";
  const canDelete = role === "ADMIN";

  const [prices, setPrices] = useState<MandiPrice[]>([]);
  // Commodity / market options live in state so the "+ Add new" inline forms
  // can extend them at runtime. Custom entries don't need a DB schema change
  // because each MandiPrice row already stores the names as strings - the
  // effect below scans existing prices and merges any unknown names back into
  // these option lists, so previously-added customs reappear on next load.
  const [commodities, setCommodities] = useState(defaultCommodities);
  const [markets, setMarkets] = useState(defaultMarkets);
  const [commodityEn, setCommodityEn] = useState(defaultCommodities[0].commodityEn);
  const [marketEn, setMarketEn] = useState(defaultMarkets[0].marketEn);
  const [price, setPrice] = useState("");
  const [change, setChange] = useState("0");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  // Inline + Add new state - one pair of toggles + EN/Te inputs per dropdown.
  const [addingCommodity, setAddingCommodity] = useState(false);
  const [newCommodityEn, setNewCommodityEn] = useState("");
  const [newCommodityTe, setNewCommodityTe] = useState("");
  const [addingMarket, setAddingMarket] = useState(false);
  const [newMarketEn, setNewMarketEn] = useState("");
  const [newMarketTe, setNewMarketTe] = useState("");

  // TanStack table state - mirrors the /review page so the two tables feel
  // identical to navigate (sort headers, global search, per-column filter
  // dropdowns, pagination footer).
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  // Status tabs - Active is what the public site sees, Inactive is the
  // hidden-but-kept archive, All is everything.
  const [statusTab, setStatusTab] = useState<"active" | "inactive" | "all">("active");
  // Row + bulk action state.
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  // Edit dialog - opens from the pencil icon. We mutate price + change only;
  // commodity / market would change the row's identity and is better done by
  // delete + re-add.
  const [editTarget, setEditTarget] = useState<MandiPrice | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editChange, setEditChange] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  // Delete confirm dialog - shared for single-row trash icon and bulk Delete N.
  type DeleteTarget =
    | { mode: "single"; id: string; label: string }
    | { mode: "bulk"; count: number };
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const loadPrices = () => {
    setLoading(true);
    fetch("/api/mandi")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setPrices(data);
      })
      .catch(() => toast.error("Failed to load mandi prices"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPrices();
  }, []);

  // Merge distinct commodities / markets from existing prices into the option
  // lists, so an "Onion" added last week shows up in today's dropdown.
  // Case-insensitive de-dupe on the English name.
  useEffect(() => {
    if (prices.length === 0) return;
    setCommodities((prev) => {
      const map = new Map(prev.map((c) => [c.commodityEn.toLowerCase(), c]));
      for (const p of prices) {
        const key = p.commodityEn.toLowerCase();
        if (!map.has(key)) map.set(key, { commodity: p.commodity, commodityEn: p.commodityEn });
      }
      return Array.from(map.values());
    });
    setMarkets((prev) => {
      const map = new Map(prev.map((m) => [m.marketEn.toLowerCase(), m]));
      for (const p of prices) {
        const key = p.marketEn.toLowerCase();
        if (!map.has(key)) map.set(key, { market: p.market, marketEn: p.marketEn });
      }
      return Array.from(map.values());
    });
  }, [prices]);

  const saveNewCommodity = () => {
    const en = newCommodityEn.trim();
    const te = newCommodityTe.trim();
    if (!en) { toast.error("English name required"); return; }
    if (commodities.some((c) => c.commodityEn.toLowerCase() === en.toLowerCase())) {
      toast.error("Already exists - pick it from the dropdown");
      return;
    }
    setCommodities((prev) => [...prev, { commodity: te || en, commodityEn: en }]);
    setCommodityEn(en);
    setNewCommodityEn("");
    setNewCommodityTe("");
    setAddingCommodity(false);
    toast.success(`Added "${en}" - you can now save a price for it`);
  };

  const saveNewMarket = () => {
    const en = newMarketEn.trim();
    const te = newMarketTe.trim();
    if (!en) { toast.error("English name required"); return; }
    if (markets.some((m) => m.marketEn.toLowerCase() === en.toLowerCase())) {
      toast.error("Already exists - pick it from the dropdown");
      return;
    }
    setMarkets((prev) => [...prev, { market: te || en, marketEn: en }]);
    setMarketEn(en);
    setNewMarketEn("");
    setNewMarketTe("");
    setAddingMarket(false);
    toast.success(`Added "${en}" - you can now save a price for it`);
  };

  // Row action helpers - each PATCHes a single row, optimistically updates
  // the prices list, and shows a toast. Used by the eye-icon toggle and the
  // pencil-icon edit dialog. doToggleActive is also fanned out in parallel
  // by the bulk Activate/Deactivate buttons.
  const patchPrice = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/mandi/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed (${res.status})`);
    }
    return (await res.json()) as MandiPrice;
  };

  const doToggleActive = async (id: string, nextActive: boolean) => {
    setBusyRowId(id);
    try {
      const updated = await patchPrice(id, { active: nextActive });
      setPrices((prev) => prev.map((p) => (p.id === id ? updated : p)));
      toast.success(nextActive ? "Activated - visible on site" : "Deactivated - hidden from site");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyRowId(null);
    }
  };

  const doDelete = async (id: string) => {
    const res = await fetch(`/api/mandi/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed (${res.status})`);
    }
    setPrices((prev) => prev.filter((p) => p.id !== id));
  };

  const openEditDialog = (p: MandiPrice) => {
    setEditTarget(p);
    setEditPrice(String(p.price));
    setEditChange(String(p.change));
    setEditError(null);
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    const priceNum = parseFloat(editPrice);
    const changeNum = parseFloat(editChange);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setEditError("Price must be a positive number");
      return;
    }
    if (!Number.isFinite(changeNum)) {
      setEditError("Change must be a valid number");
      return;
    }
    setEditError(null);
    setEditSubmitting(true);
    try {
      const updated = await patchPrice(editTarget.id, { price: priceNum, change: changeNum });
      setPrices((prev) => prev.map((p) => (p.id === editTarget.id ? updated : p)));
      toast.success(`Updated ${updated.commodityEn} @ ${updated.marketEn}`);
      setEditTarget(null);
    } catch (e) {
      setEditError((e as Error).message);
    } finally {
      setEditSubmitting(false);
    }
  };

  // Bulk actions - fan out per-row PATCH/DELETE calls in parallel.
  const selectedIds = useMemo(() => Object.keys(rowSelection), [rowSelection]);

  const doBulkActive = async (nextActive: boolean) => {
    if (selectedIds.length === 0) return;
    setBulkRunning(true);
    let okCount = 0;
    let failCount = 0;
    await Promise.all(
      selectedIds.map(async (id) => {
        try {
          const updated = await patchPrice(id, { active: nextActive });
          setPrices((prev) => prev.map((p) => (p.id === id ? updated : p)));
          okCount++;
        } catch {
          failCount++;
        }
      }),
    );
    setBulkRunning(false);
    setRowSelection({});
    if (failCount === 0) {
      toast.success(`${nextActive ? "Activated" : "Deactivated"} ${okCount} row${okCount === 1 ? "" : "s"}`);
    } else {
      toast.error(`${okCount} succeeded, ${failCount} failed`);
    }
  };

  const submitBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setDeleteSubmitting(true);
    let okCount = 0;
    let failCount = 0;
    await Promise.all(
      selectedIds.map(async (id) => {
        try {
          await doDelete(id);
          okCount++;
        } catch {
          failCount++;
        }
      }),
    );
    setDeleteSubmitting(false);
    setDeleteTarget(null);
    setRowSelection({});
    if (failCount === 0) {
      toast.success(`Deleted ${okCount} row${okCount === 1 ? "" : "s"}`);
    } else {
      toast.error(`${okCount} deleted, ${failCount} failed`);
    }
  };

  const submitSingleDelete = async (id: string) => {
    setDeleteSubmitting(true);
    try {
      await doDelete(id);
      toast.success("Row deleted");
      setDeleteTarget(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // Counts for the status tabs, computed off the full loaded set so they
  // stay accurate regardless of the active tab.
  const tabCounts = useMemo(() => {
    let active = 0;
    let inactive = 0;
    for (const p of prices) {
      if (p.active) active++;
      else inactive++;
    }
    return { active, inactive, all: prices.length };
  }, [prices]);

  // Tab-filtered data feeds the TanStack table; everything else (search,
  // column filters, sorting, pagination) layers on top of this slice.
  const tabFilteredPrices = useMemo(() => {
    if (statusTab === "all") return prices;
    return prices.filter((p) => (statusTab === "active" ? p.active : !p.active));
  }, [prices, statusTab]);

  // Unique commodity / market values from the loaded prices, feeding the
  // per-column filter dropdowns. Falls back to the option lists when no
  // prices have been recorded yet so the dropdowns aren't empty on a fresh DB.
  const uniqueCommodityOpts = useMemo(() => {
    const set = new Set<string>();
    for (const p of prices) set.add(p.commodityEn);
    if (set.size === 0) for (const c of commodities) set.add(c.commodityEn);
    return Array.from(set).sort().map((v) => ({ value: v, label: v }));
  }, [prices, commodities]);

  const uniqueMarketOpts = useMemo(() => {
    const set = new Set<string>();
    for (const p of prices) set.add(p.marketEn);
    if (set.size === 0) for (const m of markets) set.add(m.marketEn);
    return Array.from(set).sort().map((v) => ({ value: v, label: v }));
  }, [prices, markets]);

  const columns = useMemo<ColumnDef<MandiPrice>[]>(
    () => [
      {
        id: "select",
        enableSorting: false,
        enableColumnFilter: false,
        size: 32,
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected()
                ? true
                : table.getIsSomePageRowsSelected()
                  ? "indeterminate"
                  : false
            }
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            aria-label="Select row"
          />
        ),
      },
      {
        accessorKey: "commodityEn",
        id: "commodity",
        header: "Commodity",
        cell: ({ row }) => (
          <span className={cn("font-semibold", !row.original.active && "text-slate-400")}>
            {row.original.commodityEn}{" "}
            <span className={cn("font-normal", row.original.active ? "text-slate-500" : "text-slate-400")}>
              ({row.original.commodity})
            </span>
          </span>
        ),
        filterFn: (row, _id, value) => {
          if (!value) return true;
          return row.original.commodityEn === value;
        },
      },
      {
        accessorKey: "marketEn",
        id: "market",
        header: "Market",
        cell: ({ row }) => (
          <span>
            {row.original.marketEn} <span className="text-slate-500">({row.original.market})</span>
          </span>
        ),
        filterFn: (row, _id, value) => {
          if (!value) return true;
          return row.original.marketEn === value;
        },
      },
      {
        accessorKey: "price",
        id: "price",
        header: () => <div className="text-right">Price (₹)</div>,
        cell: ({ row }) => (
          <div className="text-right font-extrabold tabular-nums">
            ₹{row.original.price.toLocaleString()}
          </div>
        ),
        sortingFn: "basic",
      },
      {
        accessorKey: "change",
        id: "change",
        header: () => <div className="text-right">Change</div>,
        cell: ({ row }) => {
          const c = row.original.change;
          return (
            <div
              className={cn(
                "text-right font-bold tabular-nums",
                c > 0 ? "text-green-600" : c < 0 ? "text-red-600" : "text-slate-500",
              )}
            >
              <span className="inline-flex items-center justify-end gap-0.5">
                {c > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : c < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : null}
                {c > 0 ? "+" : ""}{c}%
              </span>
            </div>
          );
        },
        sortingFn: "basic",
      },
      {
        accessorKey: "date",
        id: "date",
        header: "Date",
        cell: ({ row }) => (
          <span className="text-xs text-slate-500">
            {new Date(row.original.date).toLocaleDateString()}
          </span>
        ),
        sortingFn: "datetime",
      },
      {
        id: "actions",
        header: () => <div className="text-right">Actions</div>,
        enableSorting: false,
        enableColumnFilter: false,
        cell: ({ row }) => {
          const r = row.original;
          const isBusy = busyRowId === r.id;
          return (
            <div className="flex items-center justify-end gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title={r.active ? "Deactivate (hide from site)" : "Activate (show on site)"}
                aria-label={r.active ? "Deactivate" : "Activate"}
                onClick={() => doToggleActive(r.id, !r.active)}
                disabled={isBusy}
                className="h-8 w-8 text-slate-500 hover:text-slate-900"
              >
                {r.active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Edit price / change"
                aria-label="Edit"
                onClick={() => openEditDialog(r)}
                disabled={isBusy}
                className="h-8 w-8 text-slate-500 hover:text-blue-600"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              {canDelete && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Delete permanently"
                  aria-label="Delete"
                  onClick={() => setDeleteTarget({ mode: "single", id: r.id, label: `${r.commodityEn} @ ${r.marketEn}` })}
                  disabled={isBusy}
                  className="h-8 w-8 text-slate-500 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [busyRowId, canDelete],
  );

  const table = useReactTable({
    data: tabFilteredPrices,
    columns,
    state: { sorting, globalFilter, columnFilters, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
    enableRowSelection: true,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  useEffect(() => {
    table.setPageIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prices, columnFilters, globalFilter, statusTab]);

  useEffect(() => {
    setRowSelection({});
  }, [statusTab]);

  const commodityFilterValue =
    (columnFilters.find((f) => f.id === "commodity")?.value as string | undefined) ?? "all";
  const marketFilterValue =
    (columnFilters.find((f) => f.id === "market")?.value as string | undefined) ?? "all";

  const addPrice = async () => {
    const priceNum = parseFloat(price);
    if (!price.trim() || Number.isNaN(priceNum) || priceNum <= 0) {
      toast.error("Enter a valid price (Rs/quintal)");
      return;
    }
    const c = commodities.find((x) => x.commodityEn === commodityEn);
    const m = markets.find((x) => x.marketEn === marketEn);
    if (!c || !m) {
      toast.error("Pick a commodity and market");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/mandi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commodity: c.commodity,
          commodityEn: c.commodityEn,
          market: m.market,
          marketEn: m.marketEn,
          price: priceNum,
          change: parseFloat(change) || 0,
          unit: "క్వింటల్",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || `Failed to add price (${res.status})`);
        return;
      }
      const newPrice = (await res.json()) as MandiPrice;
      setPrices((prev) => [newPrice, ...prev]);
      setPrice("");
      setChange("0");
      toast.success(`Added ${c.commodityEn} @ ${m.marketEn} - ₹${priceNum.toLocaleString()}`);
    } catch (e) {
      toast.error((e as Error)?.message || "Failed to add price");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-100">
      <main className="ml-60 flex-1 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-slate-900">Mandi Prices</h1>
          <p className="text-sm text-slate-500">మండి ధరలు - daily commodity rates across Rayalaseema markets</p>
        </div>

        <Card className="mb-6 border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Add Today&apos;s Price</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.2fr_1fr_140px_110px_auto] md:items-start">
              <div className="space-y-1.5">
                <Label htmlFor="commodity-select">Commodity</Label>
                <SearchableSelect
                  id="commodity-select"
                  value={commodityEn}
                  onValueChange={setCommodityEn}
                  searchPlaceholder="Search commodity..."
                  options={commodities.map((c) => ({
                    value: c.commodityEn,
                    label: c.commodityEn,
                    sublabel: c.commodity,
                  }))}
                />
                <button
                  type="button"
                  onClick={() => { setAddingCommodity((v) => !v); setAddingMarket(false); }}
                  className="text-[11px] font-medium text-blue-600 hover:underline"
                >
                  {addingCommodity ? "Cancel" : "+ Add new commodity"}
                </button>
                {addingCommodity && (
                  <div className="space-y-1.5 rounded-md border border-blue-200 bg-blue-50/40 p-2">
                    <Input
                      value={newCommodityEn}
                      onChange={(e) => setNewCommodityEn(e.target.value)}
                      placeholder="English name (e.g. Onion)"
                      className="h-8 bg-white text-xs"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter") saveNewCommodity(); }}
                    />
                    <Input
                      value={newCommodityTe}
                      onChange={(e) => setNewCommodityTe(e.target.value)}
                      placeholder="Telugu name (optional)"
                      className="h-8 bg-white text-xs"
                      onKeyDown={(e) => { if (e.key === "Enter") saveNewCommodity(); }}
                    />
                    <Button size="sm" onClick={saveNewCommodity} className="h-7 w-full bg-blue-600 text-xs text-white hover:bg-blue-700">
                      Save and select
                    </Button>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="market-select">Market</Label>
                <SearchableSelect
                  id="market-select"
                  value={marketEn}
                  onValueChange={setMarketEn}
                  searchPlaceholder="Search market..."
                  options={markets.map((m) => ({
                    value: m.marketEn,
                    label: m.marketEn,
                    sublabel: m.market,
                  }))}
                />
                <button
                  type="button"
                  onClick={() => { setAddingMarket((v) => !v); setAddingCommodity(false); }}
                  className="text-[11px] font-medium text-blue-600 hover:underline"
                >
                  {addingMarket ? "Cancel" : "+ Add new market"}
                </button>
                {addingMarket && (
                  <div className="space-y-1.5 rounded-md border border-blue-200 bg-blue-50/40 p-2">
                    <Input
                      value={newMarketEn}
                      onChange={(e) => setNewMarketEn(e.target.value)}
                      placeholder="English name (e.g. Nellore)"
                      className="h-8 bg-white text-xs"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter") saveNewMarket(); }}
                    />
                    <Input
                      value={newMarketTe}
                      onChange={(e) => setNewMarketTe(e.target.value)}
                      placeholder="Telugu name (optional)"
                      className="h-8 bg-white text-xs"
                      onKeyDown={(e) => { if (e.key === "Enter") saveNewMarket(); }}
                    />
                    <Button size="sm" onClick={saveNewMarket} className="h-7 w-full bg-blue-600 text-xs text-white hover:bg-blue-700">
                      Save and select
                    </Button>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="price-input">Price (Rs/Quintal)</Label>
                <Input
                  id="price-input"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="1"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="8500"
                  onKeyDown={(e) => { if (e.key === "Enter" && !creating) addPrice(); }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="change-input">Change %</Label>
                <Input
                  id="change-input"
                  type="number"
                  step="0.1"
                  value={change}
                  onChange={(e) => setChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !creating) addPrice(); }}
                />
              </div>
              <div className="space-y-1.5">
                {/* Invisible label keeps the button visually aligned with the
                    other columns' inputs once items-start is in play. */}
                <Label className="invisible">Action</Label>
                <Button
                  onClick={addPrice}
                  disabled={creating}
                  className="w-full gap-1.5 bg-green-600 text-white hover:bg-green-700"
                >
                  <Plus className="h-4 w-4" />
                  {creating ? "Adding..." : "Add price"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status tabs - Active is what the public /mandi-prices page + ticker
            actually show. Inactive is the archive. Counts come from the full
            loaded set, table data is then narrowed to the active tab. */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(["active", "inactive", "all"] as const).map((tab) => {
            const isActive = statusTab === tab;
            const count = tabCounts[tab];
            const label = tab === "active" ? "Active" : tab === "inactive" ? "Inactive" : "All";
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusTab(tab)}
                className={cn(
                  "rounded-md px-3.5 py-1.5 text-sm font-semibold transition-colors",
                  isActive
                    ? tab === "active"
                      ? "bg-green-600 text-white shadow-sm"
                      : tab === "inactive"
                        ? "bg-slate-700 text-white shadow-sm"
                        : "bg-blue-600 text-white shadow-sm"
                    : "bg-white text-slate-600 shadow-sm hover:text-slate-900",
                )}
              >
                {label} ({count})
              </button>
            );
          })}
        </div>

        {/* Bulk action toolbar - only visible when at least one row is
            selected. Activate / Deactivate are non-destructive and always
            available; Delete is admin-only and routes through the confirm
            dialog so accidental bulk wipes are gated. */}
        {selectedIds.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3.5 py-2.5">
            <span className="text-xs font-semibold text-blue-900">
              {selectedIds.length} selected
            </span>
            <Button
              size="sm"
              onClick={() => doBulkActive(true)}
              disabled={bulkRunning}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              <Eye className="h-3.5 w-3.5" />
              Activate {selectedIds.length}
            </Button>
            <Button
              size="sm"
              onClick={() => doBulkActive(false)}
              disabled={bulkRunning}
              variant="outline"
            >
              <EyeOff className="h-3.5 w-3.5" />
              Deactivate {selectedIds.length}
            </Button>
            {canDelete && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setDeleteTarget({ mode: "bulk", count: selectedIds.length })}
                disabled={bulkRunning}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete {selectedIds.length}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRowSelection({})}
              disabled={bulkRunning}
              className="ml-auto text-slate-600"
            >
              Clear
            </Button>
          </div>
        )}

        {/* Toolbar: search + commodity/market filters + refresh.
            Mirrors /review's pattern so editors who use both pages get the
            same muscle memory (leading filter icon, inline clear button,
            ms-auto refresh on the right). */}
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="relative">
            <Input
              aria-label="Search commodity or market"
              className={cn("peer min-w-60 bg-white ps-9", globalFilter && "pe-9")}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="Search commodity, market..."
              type="text"
              value={globalFilter}
            />
            <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-muted-foreground/80">
              <ListFilterIcon aria-hidden="true" size={16} />
            </div>
            {globalFilter && (
              <button
                aria-label="Clear filter"
                className="absolute inset-y-0 end-0 flex h-full w-9 items-center justify-center rounded-e-md text-muted-foreground/80 outline-none transition-colors hover:text-foreground"
                onClick={() => setGlobalFilter("")}
                type="button"
              >
                <CircleXIcon aria-hidden="true" size={16} />
              </button>
            )}
          </div>

          <Select
            value={commodityFilterValue}
            onValueChange={(v) =>
              table.getColumn("commodity")?.setFilterValue(v === "all" ? undefined : v)
            }
          >
            <SelectTrigger className="w-[180px] bg-white">
              <SelectValue placeholder="All commodities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All commodities</SelectItem>
              {uniqueCommodityOpts.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={marketFilterValue}
            onValueChange={(v) =>
              table.getColumn("market")?.setFilterValue(v === "all" ? undefined : v)
            }
          >
            <SelectTrigger className="w-[180px] bg-white">
              <SelectValue placeholder="All markets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All markets</SelectItem>
              {uniqueMarketOpts.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="ms-auto flex items-center gap-2">
            <Button
              aria-label="Refresh prices"
              title="Refresh"
              variant="outline"
              size="icon"
              disabled={loading}
              onClick={loadPrices}
            >
              <RefreshCwIcon
                size={16}
                className={cn("opacity-70", loading && "animate-spin")}
              />
            </Button>
          </div>
        </div>

        <Card className="border-slate-200">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id} className="bg-slate-50/60">
                    {hg.headers.map((header) => {
                      if (header.isPlaceholder) return <TableHead key={header.id} />;
                      const canSort = header.column.getCanSort();
                      const sorted = header.column.getIsSorted();
                      const content = flexRender(header.column.columnDef.header, header.getContext());
                      return (
                        <TableHead key={header.id} className="text-xs uppercase tracking-wide text-slate-500">
                          {canSort ? (
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className="inline-flex items-center gap-1 border-none bg-transparent p-0 font-inherit text-inherit hover:text-slate-900"
                            >
                              {content}
                              {sorted === "asc" && <span aria-hidden>▲</span>}
                              {sorted === "desc" && <span aria-hidden>▼</span>}
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
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="py-10 text-center text-sm text-slate-400">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="py-10 text-center text-sm text-slate-500">
                      {prices.length === 0
                        ? "No prices yet. Add today's price using the form above."
                        : "No matches. Adjust search or filters."}
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() ? "selected" : undefined}
                      className={cn(!row.original.active && "bg-slate-50/40")}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {!loading && prices.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
                <span>
                  Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
                </span>
                <div className="flex gap-1.5">
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
          </CardContent>
        </Card>
      </main>

      {/* Edit dialog - pencil icon. Only price + change are editable; commodity
          and market are identity-level fields and a typo there is better
          fixed by delete + re-add than mutation. */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => { if (!open && !editSubmitting) setEditTarget(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit price</DialogTitle>
            <DialogDescription>
              {editTarget && (
                <>Updating <span className="font-semibold">{editTarget.commodityEn}</span> @ <span className="font-semibold">{editTarget.marketEn}</span>. Commodity and market can&apos;t be changed - delete and re-add for those.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-price">Price (₹/Quintal)</Label>
              <Input
                id="edit-price"
                type="number"
                min={0}
                step="1"
                value={editPrice}
                onChange={(e) => { setEditPrice(e.target.value); if (editError) setEditError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter" && !editSubmitting) submitEdit(); }}
                aria-invalid={!!editError}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-change">Change %</Label>
              <Input
                id="edit-change"
                type="number"
                step="0.1"
                value={editChange}
                onChange={(e) => { setEditChange(e.target.value); if (editError) setEditError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter" && !editSubmitting) submitEdit(); }}
                aria-invalid={!!editError}
              />
            </div>
            {editError && <p className="text-xs text-destructive">{editError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditTarget(null)} disabled={editSubmitting}>
              Cancel
            </Button>
            <Button type="button" onClick={submitEdit} disabled={editSubmitting}>
              {editSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation - shared between single (trash icon) and bulk
          (Delete N) paths. Mode discriminator drives the title + body copy
          and which submit handler fires. */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open && !deleteSubmitting) setDeleteTarget(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-700">
              {deleteTarget?.mode === "bulk" ? `Delete ${deleteTarget.count} rows?` : "Delete this row?"}
            </DialogTitle>
            <DialogDescription>
              {deleteTarget?.mode === "single"
                ? <>This will permanently remove <span className="font-semibold">{deleteTarget.label}</span> from the database. To hide without deleting, use Deactivate instead.</>
                : deleteTarget?.mode === "bulk"
                  ? "These rows will be permanently removed from the database. This cannot be undone. To hide without deleting, use Deactivate instead."
                  : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteSubmitting}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!deleteTarget) return;
                if (deleteTarget.mode === "single") submitSingleDelete(deleteTarget.id);
                else submitBulkDelete();
              }}
              disabled={deleteSubmitting}
            >
              {deleteSubmitting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
