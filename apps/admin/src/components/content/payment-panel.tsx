"use client";

// Per-article payment panel embedded on /content/[id]. Shows the current
// payment status + amount, with an inline Edit dialog for Editors/Admins to
// override the sub-editor's number before payout.
//
// States and edges:
//   • No row yet (sub-editor hasn't claimed for review) → empty muted card
//   • CALCULATED  → "Pending" amber
//   • APPROVED    → "Awaiting payout" blue
//   • PAID        → "Settled" green + paid-on date + method
//   • CANCELLED   → "Cancelled" grey, last amount in faded text
//   Edit pencil shows for Editor/Admin only when status ≠ PAID.

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Pencil } from "lucide-react";

interface Payment {
  id: string;
  baseAmount: number;
  totalAmount: number;
  currency: string;
  status: "CALCULATED" | "APPROVED" | "PROCESSING" | "PAID" | "DISPUTED" | "CANCELLED";
  approvedAt: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  transactionId: string | null;
  note: string | null;
  journalist: { id: string; name: string };
}

const STATUS_UI: Record<Payment["status"], { label: string; bg: string; fg: string }> = {
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
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return null;
  }
}

export function PaymentPanel({ contentId }: { contentId: string }) {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const canEdit = role === "ADMIN" || role === "EDITOR";

  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`/api/content/${contentId}/payment`)
      .then((r) => r.json())
      .then((data) => setPayment(data ?? null))
      .catch(() => setPayment(null))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (contentId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentId]);

  // No panel until there's an actual payment row to show. While loading and
  // before the sub-editor sets a payment, the sidebar stays clean - the panel
  // appears the moment real data exists.
  if (loading || !payment) return null;

  const ui = STATUS_UI[payment.status];
  const editable = canEdit && payment.status !== "PAID";

  return (
    <section className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Payment</h3>
        <span
          className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: ui.bg, color: ui.fg }}
        >
          {ui.label}
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div className="text-2xl font-bold tabular-nums">{formatINR(payment.totalAmount)}</div>
        {editable && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)} className="h-7 px-2">
            <Pencil className="size-3.5 mr-1" />
            Edit
          </Button>
        )}
      </div>

      <dl className="text-xs space-y-1 text-muted-foreground">
        <div className="flex justify-between">
          <dt>Reporter</dt>
          <dd className="text-foreground">{payment.journalist.name}</dd>
        </div>
        {payment.approvedAt && (
          <div className="flex justify-between">
            <dt>Approved</dt>
            <dd>{formatDate(payment.approvedAt)}</dd>
          </div>
        )}
        {payment.paidAt && (
          <div className="flex justify-between">
            <dt>Paid</dt>
            <dd>
              {formatDate(payment.paidAt)}
              {payment.paymentMethod ? ` · ${payment.paymentMethod}` : ""}
            </dd>
          </div>
        )}
        {payment.transactionId && (
          <div className="flex justify-between">
            <dt>Txn ID</dt>
            <dd className="font-mono text-foreground">{payment.transactionId}</dd>
          </div>
        )}
        {payment.note && (
          <div className="pt-1">
            <dt className="font-medium text-foreground">Note</dt>
            <dd className="italic">{payment.note}</dd>
          </div>
        )}
      </dl>

      {editing && (
        <EditDialog
          payment={payment}
          contentId={contentId}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); load(); }}
        />
      )}
    </section>
  );
}

function EditDialog({
  payment,
  contentId,
  onClose,
  onSaved,
}: {
  payment: Payment;
  contentId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(String(payment.baseAmount));
  const [note, setNote] = useState(payment.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0) {
      setError("Enter a valid amount (₹0 or more)");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/content/${contentId}/payment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseAmount: n, note }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || `Failed (${res.status})`);
        setBusy(false);
        return;
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message || "Network error");
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit payment amount</DialogTitle>
          <DialogDescription>
            Override the amount set by the sub-editor. Reporter will see the new number
            immediately. Cannot be edited once the payment is settled (paid out).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount">Amount (₹)</Label>
            <Input
              id="pay-amount"
              type="number"
              inputMode="numeric"
              min={0}
              step="1"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); if (error) setError(null); }}
              aria-invalid={!!error}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-note">Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              id="pay-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason for override"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
