"use client";

// Client-side renderer for the web reporter's earnings screen. Receives a
// pre-serialised list of payments from the server component, handles tab
// switching + per-category aggregation, and applies a date-range filter
// (Today / Yesterday / Last 7 days / This month / Last month / Custom).
//
// The filter is computed against each row's "relevant date" — paidAt for
// settled, approvedAt for approved, createdAt for pending — so picking
// "This month" really means "what entered its current state this month".

import { useMemo, useState } from "react";
import { Wallet, Hourglass, CheckCircle2, ShieldCheck, LockKeyhole, Star, CalendarRange, X, XCircle } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";

type Status = "CALCULATED" | "APPROVED" | "PAID" | "CANCELLED";

interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: Status;
  createdAt: string;
  approvedAt: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  transactionId: string | null;
  note: string | null;
  // Article's editorial rejection note — shown on CANCELLED rows so the
  // reporter can see why the payment was voided + what to fix to resubmit.
  rejectionNote: string | null;
  article: {
    id: string;
    title: string;
    slug: string | null;
    category: { name: string; nameEn: string; slug: string; color: string | null } | null;
  };
}

interface CategoryTotal {
  slug: string;
  name: string;
  nameEn: string;
  color: string | null;
  total: number;
  count: number;
}

type DatePreset = "all" | "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth" | "custom";

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: "all",       label: "All time"   },
  { key: "today",     label: "Today"      },
  { key: "yesterday", label: "Yesterday"  },
  { key: "last7",     label: "Last 7 days" },
  { key: "thisMonth", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "custom",    label: "Custom"     },
];

const TABS: { key: "pending" | "approved" | "settled" | "cancelled"; label: string; tint: string; Icon: React.ComponentType<{ size?: number; color?: string }> }[] = [
  { key: "pending",   label: "Pending",   tint: "#f59e0b", Icon: Hourglass    },
  { key: "approved",  label: "Approved",  tint: "#3b82f6", Icon: ShieldCheck  },
  { key: "settled",   label: "Settled",   tint: "#16a34a", Icon: CheckCircle2 },
  { key: "cancelled", label: "Cancelled", tint: "#dc2626", Icon: XCircle      },
];

const STATUS_LABEL: Record<Status, string> = {
  CALCULATED: "Pending",
  APPROVED: "Approved",
  PAID: "Settled",
  CANCELLED: "Cancelled",
};

function formatINR(n: number) {
  return `₹${new Intl.NumberFormat("en-IN").format(Math.round(n))}`;
}
function formatDate(iso: string | null) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); } catch { return ""; }
}
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function relevantDate(p: Payment): Date {
  // For each lifecycle state, pick the date that "stamped" the row at its
  // current status. Falling back to createdAt for legacy rows that don't
  // have an approvedAt/paidAt (shouldn't happen, but defensive).
  const iso =
    p.status === "PAID" ? p.paidAt ?? p.approvedAt ?? p.createdAt :
    p.status === "APPROVED" ? p.approvedAt ?? p.createdAt :
    p.createdAt;
  return new Date(iso);
}

// Build a [from, to] window for the picked preset. `to` is exclusive.
function rangeFor(preset: DatePreset, customFrom: string, customTo: string): { from: Date | null; to: Date | null } {
  const now = new Date();
  const today = startOfDay(now);
  switch (preset) {
    case "all":
      return { from: null, to: null };
    case "today":
      return { from: today, to: new Date(today.getTime() + 86_400_000) };
    case "yesterday": {
      const y = new Date(today.getTime() - 86_400_000);
      return { from: y, to: today };
    }
    case "last7":
      return { from: new Date(today.getTime() - 6 * 86_400_000), to: new Date(today.getTime() + 86_400_000) };
    case "thisMonth": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { from: start, to: next };
    }
    case "lastMonth": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: start, to: end };
    }
    case "custom": {
      const from = customFrom ? startOfDay(new Date(customFrom)) : null;
      // Custom "to" is INCLUSIVE — user picks "to: May 26" and means "through May 26 end-of-day".
      const to = customTo ? new Date(startOfDay(new Date(customTo)).getTime() + 86_400_000) : null;
      return { from, to };
    }
  }
}

export function ReporterEarningsClient({
  payments,
  locked,
}: {
  payments: Payment[];
  locked: boolean;
}) {
  const [active, setActive] = useState<"pending" | "approved" | "settled" | "cancelled">("pending");
  const [preset, setPreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  // Apply the date filter once, up-front. Every downstream view (tabs,
  // totals, by-category, list) reads from the filtered set so the screen
  // tells one consistent story for the chosen window.
  const filtered = useMemo(() => {
    const { from, to } = rangeFor(preset, customFrom, customTo);
    if (!from && !to) return payments;
    return payments.filter((p) => {
      const t = relevantDate(p).getTime();
      if (from && t < from.getTime()) return false;
      if (to && t >= to.getTime()) return false;
      return true;
    });
  }, [payments, preset, customFrom, customTo]);

  const buckets = useMemo(() => {
    const pending: Payment[] = [];
    const approved: Payment[] = [];
    const settled: Payment[] = [];
    const cancelled: Payment[] = [];
    for (const p of filtered) {
      if (p.status === "CALCULATED") pending.push(p);
      else if (p.status === "APPROVED") approved.push(p);
      else if (p.status === "PAID") settled.push(p);
      else if (p.status === "CANCELLED") cancelled.push(p);
    }
    return { pending, approved, settled, cancelled };
  }, [filtered]);

  const totals = useMemo(() => ({
    pending: buckets.pending.reduce((s, r) => s + r.amount, 0),
    approved: buckets.approved.reduce((s, r) => s + r.amount, 0),
    settled: buckets.settled.reduce((s, r) => s + r.amount, 0),
    cancelled: buckets.cancelled.reduce((s, r) => s + r.amount, 0),
  }), [buckets]);

  const byCategory = useMemo<CategoryTotal[]>(() => {
    const map = new Map<string, CategoryTotal>();
    for (const p of filtered) {
      if (p.status !== "PAID") continue;
      const c = p.article.category;
      if (!c) continue;
      const existing = map.get(c.slug);
      if (existing) { existing.total += p.amount; existing.count += 1; }
      else {
        map.set(c.slug, {
          slug: c.slug, name: c.name, nameEn: c.nameEn,
          color: c.color ?? null, total: p.amount, count: 1,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [filtered]);

  const rows = buckets[active];
  const bestCategory = byCategory[0] || null;

  return (
    <>
      {/* Hero — settled within current filter window */}
      <div style={{
        backgroundColor: "#FF2C2C",
        borderRadius: 20,
        padding: 24,
        boxShadow: "0 4px 12px rgba(255,44,44,0.3)",
        marginBottom: 12,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          backgroundColor: "rgba(255,255,255,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 12,
        }}>
          <Wallet size={22} color="#fff" />
        </div>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>
          {preset === "all" ? "Total earned" : `Earned · ${PRESETS.find((p) => p.key === preset)?.label}`}
        </p>
        <p style={{ fontSize: 36, fontWeight: 900, color: "#fff", marginTop: 2 }}>
          {formatINR(totals.settled)}
        </p>
        {bestCategory && (
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.9)", marginTop: 10, fontWeight: 600 }}>
            ★ Top: {bestCategory.nameEn} · {formatINR(bestCategory.total)} ({bestCategory.count} article{bestCategory.count === 1 ? "" : "s"})
          </p>
        )}
      </div>

      {/* Date preset chips + custom range */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <CalendarRange size={14} color="#6b7280" />
          <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Date range
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {PRESETS.map((p) => {
            const isActive = preset === p.key;
            return (
              <button
                key={p.key}
                onClick={() => setPreset(p.key)}
                style={{
                  fontSize: 12, fontWeight: 600,
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: `1px solid ${isActive ? "#111" : "#e5e7eb"}`,
                  background: isActive ? "#111" : "#fff",
                  color: isActive ? "#fff" : "#374151",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        {preset === "custom" && (
          <div style={{
            marginTop: 10,
            padding: 12,
            background: "#fff",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 180 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>From</label>
              <DatePicker value={customFrom} onChange={setCustomFrom} placeholder="Start date" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 180 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>To</label>
              <DatePicker value={customTo} onChange={setCustomTo} placeholder="End date" />
            </div>
            {(customFrom || customTo) && (
              <button
                onClick={() => { setCustomFrom(""); setCustomTo(""); }}
                style={{
                  fontSize: 12, fontWeight: 600,
                  color: "#6b7280", background: "transparent", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 4, padding: "6px 8px",
                }}
              >
                <X size={14} />
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tab strip — 4 lifecycle states */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
        {TABS.map((tab) => {
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              style={{
                backgroundColor: isActive ? tab.tint + "0A" : "#fff",
                borderRadius: 14,
                padding: 14,
                textAlign: "left",
                border: `1.5px solid ${isActive ? tab.tint : "#e5e7eb"}`,
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                cursor: "pointer",
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                backgroundColor: tab.tint + "1A",
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: 8,
              }}>
                <tab.Icon size={16} color={tab.tint} />
              </div>
              <p style={{ fontSize: 11, fontWeight: 700, color: isActive ? tab.tint : "#666" }}>{tab.label}</p>
              <p style={{ fontSize: 17, fontWeight: 900, color: "#111", marginTop: 2 }}>
                {formatINR(totals[tab.key])}
              </p>
            </button>
          );
        })}
      </div>

      {/* By-category breakdown */}
      {!locked && byCategory.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>By category</h2>
          <p style={{ fontSize: 11, color: "#888", marginTop: 2, marginBottom: 12 }}>Only counts paid articles in the selected range</p>
          <div style={{
            backgroundColor: "#fff",
            borderRadius: 14,
            padding: 16,
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            display: "flex", flexDirection: "column", gap: 14,
          }}>
            {byCategory.slice(0, 6).map((c, i) => {
              const max = byCategory[0].total || 1;
              const pct = Math.round((c.total / max) * 100);
              const color = c.color || "#FF2C2C";
              return (
                <div key={c.slug}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <p style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#111" }}>
                      {i === 0 && <Star size={12} fill={color} color={color} style={{ verticalAlign: "baseline", marginRight: 4 }} />}
                      {c.nameEn}
                    </p>
                    <p style={{ fontSize: 14, fontWeight: 900, color: "#111", fontVariantNumeric: "tabular-nums" }}>
                      {formatINR(c.total)}
                    </p>
                  </div>
                  <div style={{ height: 6, backgroundColor: "#f3f4f6", borderRadius: 3, marginTop: 6, overflow: "hidden" }}>
                    <div style={{ height: 6, width: `${pct}%`, backgroundColor: color, borderRadius: 3 }} />
                  </div>
                  <p style={{ fontSize: 10, color: "#888", marginTop: 4 }}>
                    {c.count} article{c.count === 1 ? "" : "s"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>
          {active === "pending"   ? "Pending payments"
            : active === "approved"  ? "Approved payments"
            : active === "settled"   ? "Settled payments"
            : /* cancelled */          "Cancelled payments"}
        </h2>
        <span style={{ fontSize: 12, color: "#6b7280" }}>
          {rows.length} {rows.length === 1 ? "item" : "items"}
        </span>
      </div>

      {locked ? (
        <div style={{ padding: 48, textAlign: "center", background: "#fff", borderRadius: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <LockKeyhole size={48} color="#d1d5db" style={{ margin: "0 auto 10px" }} />
          <p style={{ fontSize: 14, color: "#aaa" }}>
            Earnings will appear here once your KYC is verified.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 48, textAlign: "center", background: "#fff", borderRadius: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <Wallet size={48} color="#d1d5db" style={{ margin: "0 auto 10px" }} />
          <p style={{ fontSize: 14, color: "#aaa" }}>
            {preset === "all"
              ? (active === "pending"
                ? "Nothing pending. Submit an article to start."
                : active === "approved"
                ? "No approved payments yet."
                : active === "settled"
                ? "No settled payments yet. Earnings appear here after admin pays out."
                : "No cancelled payments — every payment has stayed on track.")
              : `No ${active} payments in this date range.`}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((p) => <PaymentCard key={p.id} row={p} />)}
        </div>
      )}
    </>
  );
}

// Redesigned payment row card — no border-left accent. Status is shown via:
//   1. The status pill (colored, top-left)
//   2. A status-tinted "indicator dot" right before the pill, like an LED
//   3. A subtle status-tinted ring on the card (1px, low opacity)
// The card itself is a clean rounded surface with a soft shadow that gets
// a tiny lift on hover.
//
// Layout:
//   ┌─────────────────────────────────────────────────────────────┐
//   │ • [PENDING pill]                                    ₹500    │
//   │                                                             │
//   │ Article title (up to 2 lines, semibold, large)              │
//   │                                                             │
//   │ [Politics]  Submitted May 26, 2026                          │
//   │ ─────────────────────── (only for PAID rows) ─────────────  │
//   │ UPI · ref txn123                                            │
//   │ "Optional note from sub-editor"                             │
//   └─────────────────────────────────────────────────────────────┘
function PaymentCard({ row }: { row: Payment }) {
  // Status palette — extends to CANCELLED (red) so the LED dot + pill
  // + ambient shadow all match the editorial "this got rejected" signal.
  const tint =
    row.status === "PAID"      ? "#16a34a" :
    row.status === "APPROVED"  ? "#3b82f6" :
    row.status === "CANCELLED" ? "#dc2626" :
    /* CALCULATED */             "#f59e0b";
  const tintBg =
    row.status === "PAID"      ? "#dcfce7" :
    row.status === "APPROVED"  ? "#dbeafe" :
    row.status === "CANCELLED" ? "#fee2e2" :
    /* CALCULATED */             "#fef3c7";
  const tintFg =
    row.status === "PAID"      ? "#166534" :
    row.status === "APPROVED"  ? "#1e3a8a" :
    row.status === "CANCELLED" ? "#991b1b" :
    /* CALCULATED */             "#92400e";
  const dateLabel =
    row.status === "PAID" && row.paidAt          ? formatDate(row.paidAt)
    : row.status === "APPROVED" && row.approvedAt ? formatDate(row.approvedAt)
    : formatDate(row.createdAt);
  const dateContext =
    row.status === "PAID"      ? "Paid"
    : row.status === "APPROVED"? "Approved"
    : row.status === "CANCELLED"? "Cancelled"
    : "Submitted";

  return (
    <div style={{
      backgroundColor: "#fff",
      borderRadius: 16,
      // Two-layer shadow: a tiny hairline tint at the bottom in the status
      // colour (subtle ambient awareness) + the standard soft drop shadow.
      // No border-left, no hard accent — the status pill carries the signal.
      boxShadow: `0 1px 2px ${tint}14, 0 4px 12px rgba(0,0,0,0.04)`,
      padding: 18,
      transition: "transform 0.12s ease, box-shadow 0.12s ease",
    }}>
      {/* Header — status pill + amount on the same line */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 10, fontWeight: 800,
          textTransform: "uppercase", letterSpacing: 0.6,
          color: tintFg, backgroundColor: tintBg,
          padding: "4px 10px", borderRadius: 999,
        }}>
          {/* Status indicator dot (LED-style) — same hue as the pill text */}
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            backgroundColor: tint,
            boxShadow: `0 0 0 2px ${tint}33`,
          }} />
          {STATUS_LABEL[row.status]}
        </span>
        <p style={{ fontSize: 22, fontWeight: 900, color: "#111", fontVariantNumeric: "tabular-nums", margin: 0 }}>
          {formatINR(row.amount)}
        </p>
      </div>

      {/* Title — up to 2 lines, semibold, with comfortable line-height */}
      <p style={{
        fontSize: 15, fontWeight: 700, color: "#111", lineHeight: 1.4,
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        margin: "0 0 12px",
      }}>
        {row.article.title}
      </p>

      {/* Meta row — category chip + dated context label */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {row.article.category && (
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: row.article.category.color || "#FF2C2C",
            backgroundColor: (row.article.category.color || "#FF2C2C") + "1A",
            padding: "3px 10px",
            borderRadius: 6,
          }}>
            {row.article.category.nameEn}
          </span>
        )}
        <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>
          {dateContext} {dateLabel}
        </span>
      </div>

      {/* Settled-only — payment method + transaction ID */}
      {row.status === "PAID" && (row.paymentMethod || row.transactionId) && (
        <>
          <div style={{ height: 1, background: "#f3f4f6", margin: "14px 0 10px" }} />
          <p style={{
            fontSize: 11, color: "#6b7280",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            margin: 0,
          }}>
            {row.paymentMethod && (
              <>
                <span style={{ fontWeight: 700, color: "#374151" }}>{row.paymentMethod}</span>
                {row.transactionId ? " · " : ""}
              </>
            )}
            {row.transactionId ? <>ref&nbsp;{row.transactionId}</> : null}
          </p>
        </>
      )}

      {/* Cancelled-only — show WHY (article's rejection note) so the
          reporter knows what to fix before resubmitting. Tinted red block
          to match the cancelled state; uses the same indent-line treatment
          as the sub-editor's note for visual consistency. */}
      {row.status === "CANCELLED" && row.rejectionNote && (
        <>
          <div style={{ height: 1, background: "#f3f4f6", margin: "14px 0 10px" }} />
          <div style={{
            background: "#fef2f2",
            border: "1px solid #fee2e2",
            borderRadius: 8,
            padding: "10px 12px",
          }}>
            <p style={{
              fontSize: 10, fontWeight: 800, color: "#991b1b",
              textTransform: "uppercase", letterSpacing: 0.5,
              margin: "0 0 4px",
            }}>
              Why it was rejected
            </p>
            <p style={{ fontSize: 13, color: "#7f1d1d", margin: 0, lineHeight: 1.4 }}>
              {row.rejectionNote}
            </p>
          </div>
        </>
      )}

      {/* Sub-editor's note, if any. Uses a thin grey indent rule (NOT a
          colored left border — that's the look we're avoiding) plus italic
          text to make it read like a quote without copying the card style. */}
      {row.note && (
        <p style={{
          fontSize: 12, color: "#6b7280", fontStyle: "italic",
          margin: "12px 0 0",
          paddingLeft: 12,
          position: "relative",
        }}>
          <span style={{
            position: "absolute", left: 0, top: 4, bottom: 4,
            width: 2, background: "#e5e7eb", borderRadius: 1,
          }} />
          “{row.note}”
        </p>
      )}
    </div>
  );
}
