"use client";

// /payments — admin payouts dashboard. Lists every ContentPayment row with a
// status filter, totals per status, and a "Mark Paid" action for APPROVED
// rows. Per-article rate cards (PaymentConfig) are intentionally not part of
// this v1 — the CEO-approved flow has sub-editors set per-article amounts
// during review, not derive from a category-level rate card.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/sidebar";
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

const STATUS_UI: Record<Status, { label: string; bg: string; fg: string }> = {
  CALCULATED: { label: "Pending",        bg: "#fef3c7", fg: "#92400e" },
  APPROVED:   { label: "Awaiting payout", bg: "#dbeafe", fg: "#1e3a8a" },
  PROCESSING: { label: "Processing",     bg: "#ede9fe", fg: "#5b21b6" },
  PAID:       { label: "Settled",        bg: "#dcfce7", fg: "#166534" },
  CANCELLED:  { label: "Cancelled",      bg: "#f3f4f6", fg: "#6b7280" },
  DISPUTED:   { label: "Disputed",       bg: "#fee2e2", fg: "#991b1b" },
};

function formatINR(n: number) {
  return `₹${new Intl.NumberFormat("en-IN").format(Math.round(n))}`;
}
function formatDate(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); } catch { return "—"; }
}

export default function PaymentsPage() {
  const [filter, setFilter] = useState<"ALL" | Status>("ALL");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [payTarget, setPayTarget] = useState<Payment | null>(null);

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

  // Total amount shown in the toolbar — sums all currently-visible payments.
  const total = payments.reduce((s, p) => s + p.totalAmount, 0);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111", marginBottom: 4 }}>Payments</h1>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
          Approve, mark paid, and review per-article reporter payments. All amounts in INR (₹).
        </p>

        <div className="shadcn-scope space-y-4">
          {/* Status filter chips with counts */}
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
            <div className="ms-auto text-sm text-muted-foreground">
              {payments.length} row{payments.length === 1 ? "" : "s"} · total {formatINR(total)}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Article</TableHead>
                  <TableHead>Reporter</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Paid On</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      {loading ? "Loading payments..." : "No payments in this view."}
                    </TableCell>
                  </TableRow>
                ) : (
                  payments.map((p) => {
                    const ui = STATUS_UI[p.status];
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <Link href={`/content/${p.content.id}`} className="text-foreground hover:underline">
                            <span className="font-medium">{p.content.title || "(untitled)"}</span>
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{p.journalist.name}</TableCell>
                        <TableCell>
                          {p.content.category ? (
                            <Badge variant="outline" style={{ borderColor: p.content.category.color ?? undefined }}>
                              {p.content.category.nameEn}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {formatINR(p.totalAmount)}
                        </TableCell>
                        <TableCell>
                          <span
                            className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                            style={{ background: ui.bg, color: ui.fg }}
                          >
                            {ui.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{formatDate(p.createdAt)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {p.paidAt
                            ? <>{formatDate(p.paidAt)}{p.paymentMethod ? ` · ${p.paymentMethod}` : ""}</>
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {p.status === "APPROVED" && (
                            <Button size="sm" onClick={() => setPayTarget(p)}>Mark Paid</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
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
