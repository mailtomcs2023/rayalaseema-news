// Admin: enter + manage daily gold / silver rates per Rayalaseema city.
// Public consumers: /api/tickers (homepage strip) and /gold-rate (full
// public page) both read the latest active row per (city, metal, purity).
// Simpler than /mandi - one "Add new rate" form + a grouped table per
// city. ADMIN can hard-delete; EDITOR can toggle active or edit price.
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Plus, Eye, EyeOff, Trash2, RefreshCw, DownloadCloud } from "lucide-react";
import { toast } from "sonner";
import { confirm } from "@/components/confirm-dialog";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface PreciousRate {
  id: string;
  city: string;
  cityTe: string | null;
  metal: "GOLD" | "SILVER" | "PLATINUM";
  purity: string | null;
  pricePerGram: number;
  unit: string;
  source: string | null;
  date: string;
  active: boolean;
}

// Rayalaseema cities + nearby commerce hubs that the /gold-rate page
// already lists. Keeping this aligned with that page so the homepage strip,
// the editor form and the dedicated page stay in sync.
const cities = [
  { en: "Kurnool", te: "కర్నూలు" },
  { en: "Nandyal", te: "నంద్యాల" },
  { en: "Anantapuramu", te: "అనంతపురం" },
  { en: "Kadapa", te: "కడప" },
  { en: "Tirupati", te: "తిరుపతి" },
  { en: "Chittoor", te: "చిత్తూరు" },
  { en: "Hyderabad", te: "హైదరాబాద్" },
  { en: "Vijayawada", te: "విజయవాడ" },
  { en: "Nellore", te: "నెల్లూరు" },
];

type MetalKey = "GOLD_24K" | "GOLD_22K" | "SILVER" | "PLATINUM";
const metalOptions: { key: MetalKey; label: string; metal: "GOLD" | "SILVER" | "PLATINUM"; purity: string | null }[] = [
  { key: "GOLD_24K", label: "Gold 24K (per gram)", metal: "GOLD", purity: "24K" },
  { key: "GOLD_22K", label: "Gold 22K (per gram)", metal: "GOLD", purity: "22K" },
  { key: "SILVER", label: "Silver (per gram)", metal: "SILVER", purity: null },
  { key: "PLATINUM", label: "Platinum (per gram)", metal: "PLATINUM", purity: null },
];

export default function PreciousMetalsPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role || "REPORTER";
  const canDelete = role === "ADMIN";

  const [rates, setRates] = useState<PreciousRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState(cities[0].en);
  const [metalKey, setMetalKey] = useState<MetalKey>("GOLD_24K");
  const [price, setPrice] = useState("");
  const [source, setSource] = useState("Editorial desk");
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/precious-metals")
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setRates(d))
      .catch(() => toast.error("Failed to load rates"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const submit = async () => {
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) {
      toast.error("Enter a positive price per gram");
      return;
    }
    const meta = metalOptions.find((m) => m.key === metalKey)!;
    const cityRow = cities.find((c) => c.en === city)!;
    setCreating(true);
    try {
      const res = await fetch("/api/precious-metals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: cityRow.en,
          cityTe: cityRow.te,
          metal: meta.metal,
          purity: meta.purity,
          pricePerGram: p,
          source: source || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      const created = (await res.json()) as PreciousRate;
      setRates((prev) => [created, ...prev]);
      setPrice("");
      toast.success(`Saved ${meta.label.split(" (")[0]} for ${cityRow.en}: ₹${p}/g`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const syncFromApi = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/precious-metals/sync", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        throw new Error(body.error || `Sync failed (${res.status})`);
      }
      toast.success(`Synced ${body.written} rows from ${body.source}`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const toggleActive = async (row: PreciousRate) => {
    setBusyRowId(row.id);
    try {
      const res = await fetch(`/api/precious-metals/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !row.active }),
      });
      if (!res.ok) throw new Error("Toggle failed");
      const updated = (await res.json()) as PreciousRate;
      setRates((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyRowId(null);
    }
  };

  const remove = async (row: PreciousRate) => {
    if (
      !(await confirm({
        title: `Delete ${row.metal} ${row.purity ?? ""} for ${row.city}?`,
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    setBusyRowId(row.id);
    try {
      const res = await fetch(`/api/precious-metals/${row.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setRates((prev) => prev.filter((r) => r.id !== row.id));
      toast.success("Deleted");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyRowId(null);
    }
  };

  // Group rates per city for the table - latest row per (city, metal,
  // purity). Older rows are kept in the DB (so we can chart history later)
  // but not surfaced here to keep the table readable.
  const latestByCity = new Map<string, PreciousRate[]>();
  for (const r of rates) {
    const key = `${r.city}|${r.metal}|${r.purity ?? ""}`;
    if (!latestByCity.has(r.city)) latestByCity.set(r.city, []);
    const list = latestByCity.get(r.city)!;
    if (!list.find((x) => `${x.metal}|${x.purity ?? ""}` === `${r.metal}|${r.purity ?? ""}`)) {
      list.push(r);
    }
  }

  return (
    <div className="ml-60 p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gold &amp; silver rates</h1>
          <p className="text-sm text-slate-500 mt-1">
            Daily rates per Rayalaseema city. The homepage ticker and the public /gold-rate page read the latest active row per city + metal + purity.
          </p>
        </div>
        <Button onClick={syncFromApi} disabled={syncing} variant="default">
          <DownloadCloud className={`w-4 h-4 mr-1 ${syncing ? "animate-pulse" : ""}`} />
          {syncing ? "Syncing..." : "Sync now from API"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add today&apos;s rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div>
              <Label>City</Label>
              <Select value={city} onValueChange={setCity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cities.map((c) => <SelectItem key={c.en} value={c.en}>{c.te} ({c.en})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Metal / purity</Label>
              <Select value={metalKey} onValueChange={(v) => setMetalKey(v as MetalKey)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {metalOptions.map((m) => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Price per gram (₹)</Label>
              <Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 10120" />
            </div>
            <div>
              <Label>Source</Label>
              <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. IBJA / local jeweller" />
            </div>
            <Button onClick={submit} disabled={creating}>
              <Plus className="w-4 h-4 mr-1" />
              {creating ? "Saving..." : "Save rate"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Latest rate per city</CardTitle>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-500 text-center py-8">Loading...</p>
          ) : latestByCity.size === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">No rates yet. Add one above to populate the homepage ticker.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>City</TableHead>
                  <TableHead>Metal</TableHead>
                  <TableHead>Purity</TableHead>
                  <TableHead className="text-right">Price (₹/g)</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...latestByCity.entries()].flatMap(([cityName, list]) =>
                  list.map((r) => (
                    <TableRow key={r.id} className={!r.active ? "opacity-50" : ""}>
                      <TableCell className="font-medium">
                        {r.cityTe ? `${r.cityTe} (${cityName})` : cityName}
                      </TableCell>
                      <TableCell>{r.metal === "GOLD" ? "Gold" : "Silver"}</TableCell>
                      <TableCell>{r.purity ?? "-"}</TableCell>
                      <TableCell className="text-right font-mono">
                        {r.pricePerGram.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {new Date(r.date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">{r.source ?? "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleActive(r)}
                          disabled={busyRowId === r.id}
                          title={r.active ? "Hide from site" : "Show on site"}
                        >
                          {r.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </Button>
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => remove(r)}
                            disabled={busyRowId === r.id}
                            title="Delete row"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
