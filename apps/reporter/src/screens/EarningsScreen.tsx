import React, { useState, useEffect, useCallback, useMemo } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, Platform, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { api } from "../api/client";
import { useT } from "../i18n";
import { ScreenHeader } from "../components/ScreenHeader";
import { KycBanner } from "../components/KycBanner";

// Four-tab earnings view backed by /api/reporter/earnings. Pending /
// Approved / Settled / Cancelled mirror the ContentPayment lifecycle a
// sub-editor + editor + admin drive on the admin side. The "By Category"
// widget below the list aggregates Settled (paid) rows so the reporter
// can spot the best-earning category and lean into it.
//
// Date filter (mirror of the web reporter view): chips for the common
// presets plus a Custom range with native date pickers. Every downstream
// view (tab totals, by-category, list) reads from the filtered set so the
// screen tells one consistent story for the selected window.

type Status = "CALCULATED" | "APPROVED" | "PAID" | "CANCELLED";

interface PaymentRow {
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

interface EarningsPayload {
  totals: { pending: number; approved: number; settled: number; cancelled: number };
  pending: PaymentRow[];
  approved: PaymentRow[];
  settled: PaymentRow[];
  cancelled: PaymentRow[];
  byCategory: CategoryTotal[];
  locked?: boolean;
  kycStatus?: string;
}

type TabKey = "pending" | "approved" | "settled" | "cancelled";
type DatePreset = "all" | "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth" | "custom";

// Tab + preset configs hold ONLY the constants — the displayed label is
// looked up via t() at render time so a language switch re-translates
// the chips and totals immediately, without remounting the screen.
const TABS: { key: TabKey; tint: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "pending",   tint: "#f59e0b", icon: "hourglass-outline" },
  { key: "approved",  tint: "#3b82f6", icon: "checkmark-done-outline" },
  { key: "settled",   tint: "#16a34a", icon: "wallet-outline" },
  { key: "cancelled", tint: "#dc2626", icon: "close-circle-outline" },
];

const PRESET_KEYS: DatePreset[] = ["all", "today", "yesterday", "last7", "thisMonth", "lastMonth", "custom"];

const EMPTY: EarningsPayload = {
  totals: { pending: 0, approved: 0, settled: 0, cancelled: 0 },
  pending: [], approved: [], settled: [], cancelled: [],
  byCategory: [],
};

function formatINR(n: number) {
  return `₹${new Intl.NumberFormat("en-IN").format(Math.round(n))}`;
}
function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

// `#RRGGBB` → `rgba(r, g, b, a)`. React Native's 8-char hex (#RRGGBBAA) is
// supported on both platforms but the Android color parser has historically
// rendered low-alpha hex values too saturated (the active tab's icon tile
// looked solid yellow before this switch). Building rgba() explicitly is
// consistent across platforms.
function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function relevantDate(p: PaymentRow): Date {
  // For each lifecycle state, pick the date that "stamped" the row at its
  // current status. Falling back to createdAt for legacy rows that don't
  // have an approvedAt/paidAt (shouldn't happen, but defensive).
  const iso =
    p.status === "PAID" ? p.paidAt ?? p.approvedAt ?? p.createdAt :
    p.status === "APPROVED" ? p.approvedAt ?? p.createdAt :
    p.createdAt;
  return new Date(iso);
}

// Build a [from, to) window for the picked preset. `to` is exclusive so an
// "in range" check is `t >= from && t < to`.
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

// "YYYY-MM-DD" formatter built from local date parts so the round-trip
// through `new Date(iso)` doesn't shift by a timezone offset.
function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dateDisplay(iso: string): string {
  if (!iso) return "Pick date";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

export function EarningsScreen() {
  const { t } = useT();
  const [data, setData] = useState<EarningsPayload>(EMPTY);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("pending");

  // Date filter state — all client-side. The API returns the raw list and
  // we re-bucket / re-total based on the chosen window.
  const [preset, setPreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [picking, setPicking] = useState<"from" | "to" | null>(null);

  const load = useCallback(async () => {
    try {
      const payload = await api("/api/reporter/earnings");
      setData({
        totals: payload.totals || EMPTY.totals,
        pending: payload.pending || [],
        approved: payload.approved || [],
        settled: payload.settled || [],
        cancelled: payload.cancelled || [],
        byCategory: payload.byCategory || [],
        locked: payload.locked,
        kycStatus: payload.kycStatus,
      });
    } catch {
      // Fallback to empty payload on error — reporter sees zeros, no crash.
      setData(EMPTY);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const locked = !!data.locked;

  // Flatten the API's four buckets into one list so we have a single
  // source of truth to filter from.
  const allRows = useMemo<PaymentRow[]>(
    () => [...data.pending, ...data.approved, ...data.settled, ...data.cancelled],
    [data],
  );

  // Apply the date filter once, up-front. Every downstream view reads from
  // `filtered` so the screen tells one consistent story for the window.
  const filtered = useMemo(() => {
    const { from, to } = rangeFor(preset, customFrom, customTo);
    if (!from && !to) return allRows;
    return allRows.filter((p) => {
      const ts = relevantDate(p).getTime();
      if (from && ts < from.getTime()) return false;
      if (to && ts >= to.getTime()) return false;
      return true;
    });
  }, [allRows, preset, customFrom, customTo]);

  const buckets = useMemo(() => {
    const pending: PaymentRow[] = [];
    const approved: PaymentRow[] = [];
    const settled: PaymentRow[] = [];
    const cancelled: PaymentRow[] = [];
    for (const p of filtered) {
      if (p.status === "CALCULATED") pending.push(p);
      else if (p.status === "APPROVED") approved.push(p);
      else if (p.status === "PAID") settled.push(p);
      else if (p.status === "CANCELLED") cancelled.push(p);
    }
    return { pending, approved, settled, cancelled };
  }, [filtered]);

  const totals = useMemo(() => ({
    pending:   buckets.pending.reduce((s, r) => s + r.amount, 0),
    approved:  buckets.approved.reduce((s, r) => s + r.amount, 0),
    settled:   buckets.settled.reduce((s, r) => s + r.amount, 0),
    cancelled: buckets.cancelled.reduce((s, r) => s + r.amount, 0),
  }), [buckets]);

  // Re-derive byCategory from the filtered set (PAID-only) so the breakdown
  // reflects the chosen window.
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

  const rows = buckets[activeTab];
  const heroAmount = totals.settled;
  const bestCategory = byCategory[0] || null;
  const filterActive = preset !== "all";
  const presetLabel = t(`earnings.presets.${preset}`);

  const onPickDate = (which: "from" | "to") => (_event: any, date?: Date) => {
    if (Platform.OS === "android") setPicking(null);
    if (!date) return;
    const iso = toISODate(date);
    if (which === "from") setCustomFrom(iso);
    else setCustomTo(iso);
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader />
      <KycBanner />
      <FlatList
        data={locked ? [] : rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: Platform.OS === "android" ? 100 : 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#FF2C2C"]} tintColor="#FF2C2C" />
        }
        ListHeaderComponent={
          <View>
            {/* Hero — settled within the selected window */}
            <View style={styles.hero}>
              <View style={styles.heroIcon}>
                <Ionicons name="wallet" size={22} color="#fff" />
              </View>
              <Text style={styles.heroLabel}>
                {filterActive ? t("earnings.earnedIn", { label: presetLabel }) : t("earnings.totalEarned")}
              </Text>
              <Text style={styles.heroAmount}>{formatINR(heroAmount)}</Text>
              {bestCategory ? (
                <Text style={styles.heroHint}>
                  {t("earnings.topHint", {
                    name: bestCategory.nameEn,
                    amount: formatINR(bestCategory.total),
                    count: bestCategory.count,
                    articles: bestCategory.count === 1 ? t("earnings.article") : t("earnings.articles"),
                  })}
                </Text>
              ) : null}
            </View>

            {/* Date filter — preset chips (wrap) + optional custom range */}
            {!locked ? (
              <View style={styles.filterWrap}>
                <View style={styles.filterHeader}>
                  <Ionicons name="calendar-outline" size={13} color="#6b7280" />
                  <Text style={styles.filterHeaderText}>{t("earnings.dateRange")}</Text>
                </View>
                <View style={styles.chipRow}>
                  {PRESET_KEYS.map((key) => {
                    const isActive = preset === key;
                    return (
                      <TouchableOpacity
                        key={key}
                        onPress={() => setPreset(key)}
                        activeOpacity={0.85}
                        style={[styles.chip, isActive && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                          {t(`earnings.presets.${key}`)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {preset === "custom" ? (
                  <View style={styles.customRangeBox}>
                    <View style={styles.customField}>
                      <Text style={styles.customLabel}>{t("earnings.from")}</Text>
                      <TouchableOpacity
                        style={styles.customButton}
                        onPress={() => setPicking("from")}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="calendar-outline" size={14} color="#6b7280" />
                        <Text style={[styles.customButtonText, !customFrom && styles.customButtonPlaceholder]} numberOfLines={1}>
                          {customFrom ? dateDisplay(customFrom) : t("earnings.startDate")}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.customField}>
                      <Text style={styles.customLabel}>{t("earnings.to")}</Text>
                      <TouchableOpacity
                        style={styles.customButton}
                        onPress={() => setPicking("to")}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="calendar-outline" size={14} color="#6b7280" />
                        <Text style={[styles.customButtonText, !customTo && styles.customButtonPlaceholder]} numberOfLines={1}>
                          {customTo ? dateDisplay(customTo) : t("earnings.endDate")}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {(customFrom || customTo) ? (
                      <TouchableOpacity
                        style={styles.clearButton}
                        onPress={() => { setCustomFrom(""); setCustomTo(""); }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="close" size={14} color="#6b7280" />
                        <Text style={styles.clearButtonText}>{t("earnings.clear")}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Tab strip — each chip shows its own running total for the window */}
            <View style={styles.tabRow}>
              {TABS.map((tab) => {
                const isActive = activeTab === tab.key;
                const amount = totals[tab.key];
                return (
                  <TouchableOpacity
                    key={tab.key}
                    style={[
                      styles.tab,
                      // No background tint on active — amber at any low alpha
                      // composites to beige against white. Lean on a thicker
                      // tint border + tint label for the selected state.
                      isActive && { borderColor: tab.tint, borderWidth: 2, padding: 11.5 },
                    ]}
                    onPress={() => setActiveTab(tab.key)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.tabIcon, { backgroundColor: withAlpha(tab.tint, 0.12) }]}>
                      <Ionicons name={tab.icon} size={14} color={tab.tint} />
                    </View>
                    <Text style={[styles.tabLabel, isActive && { color: tab.tint }]}>
                      {t(`earnings.tabs.${tab.key}`)}
                    </Text>
                    <Text style={styles.tabAmount}>{formatINR(amount)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* By Category breakdown — only when there's something to compare */}
            {!locked && byCategory.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t("earnings.byCategory")}</Text>
                <Text style={styles.sectionSub}>{t("earnings.byCategorySub")}</Text>
                <View style={styles.catList}>
                  {byCategory.slice(0, 6).map((c, i) => {
                    const max = byCategory[0].total || 1;
                    const pct = Math.round((c.total / max) * 100);
                    const color = c.color || "#FF2C2C";
                    return (
                      <View key={c.slug} style={styles.catRow}>
                        <View style={styles.catHead}>
                          <Text style={styles.catName} numberOfLines={1}>
                            {i === 0 && <Text style={{ color }}>★ </Text>}
                            {c.nameEn}
                          </Text>
                          <Text style={styles.catTotal}>{formatINR(c.total)}</Text>
                        </View>
                        <View style={styles.barTrack}>
                          <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
                        </View>
                        <Text style={styles.catCount}>
                          {c.count} {c.count === 1 ? t("earnings.article") : t("earnings.articles")}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View style={styles.listHeadRow}>
              <Text style={styles.sectionTitleInline}>
                {activeTab === "pending"   ? t("earnings.pendingPayments")
                  : activeTab === "approved"  ? t("earnings.approvedPayments")
                  : activeTab === "settled"   ? t("earnings.settledPayments")
                  : /* cancelled */              t("earnings.cancelledPayments")}
              </Text>
              <Text style={styles.listHeadCount}>
                {t("earnings.itemsCount", {
                  count: rows.length,
                  word: rows.length === 1 ? t("earnings.item") : t("earnings.items"),
                })}
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => <PaymentRowCard row={item} t={t} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name={locked ? "lock-closed-outline" : "cash-outline"} size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>
              {locked
                ? t("kyc.lockedEarnings")
                : filterActive
                ? t("earnings.emptyFiltered", { tab: t(`earnings.tabs.${activeTab}`).toLowerCase() })
                : activeTab === "pending"
                ? t("earnings.emptyPending")
                : activeTab === "approved"
                ? t("earnings.emptyApproved")
                : activeTab === "settled"
                ? t("earnings.emptySettled")
                : t("earnings.emptyCancelled")}
            </Text>
          </View>
        }
      />

      {/* Native date pickers. Android opens its own modal dialog; iOS gets
          a bottom-sheet wrapper around an inline spinner with Cancel/Done. */}
      {picking && Platform.OS === "android" ? (
        <DateTimePicker
          value={picking === "from" && customFrom ? new Date(customFrom) : picking === "to" && customTo ? new Date(customTo) : new Date()}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={onPickDate(picking)}
        />
      ) : null}
      {picking && Platform.OS === "ios" ? (
        <View style={styles.iosPickerBackdrop}>
          <View style={styles.iosPickerSheet}>
            <View style={styles.iosPickerHead}>
              <TouchableOpacity onPress={() => setPicking(null)}>
                <Text style={styles.iosPickerCancel}>{t("common.cancel")}</Text>
              </TouchableOpacity>
              <Text style={styles.iosPickerTitle}>
                {picking === "from" ? t("earnings.pickerFrom") : t("earnings.pickerTo")}
              </Text>
              <TouchableOpacity onPress={() => setPicking(null)}>
                <Text style={styles.iosPickerDone}>{t("earnings.pickerDone")}</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={picking === "from" && customFrom ? new Date(customFrom) : picking === "to" && customTo ? new Date(customTo) : new Date()}
              mode="date"
              display="spinner"
              maximumDate={new Date()}
              onChange={onPickDate(picking)}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

// Status pill labels — mirror the web (Pending / Approved / Paid / Cancelled).
const STATUS_LABEL: Record<string, string> = {
  CALCULATED: "Pending",
  APPROVED: "Approved",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

// Payment row card — mirror of the reporter web card design.
//
// Layout (no left-border accent, status carried by an LED dot + pill):
//   ┌─────────────────────────────────────────────┐
//   │ ● [PENDING]                          ₹500   │
//   │                                             │
//   │ Article title (up to 2 lines, semibold)     │
//   │                                             │
//   │ [Politics]  Submitted May 26, 2026          │
//   │ ─────────────────── (PAID only) ──────────  │
//   │ UPI · ref txn123                            │
//   │ "Optional note from sub-editor"             │
//   └─────────────────────────────────────────────┘
function PaymentRowCard({ row, t }: { row: PaymentRow; t: (key: string, params?: Record<string, string | number>) => string }) {
  // Status palette — same hues as the web so the two surfaces look identical.
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
    <View
      style={[
        styles.paymentCard,
        // Subtle status-tinted shadow at the bottom — ambient awareness
        // without a hard left-border accent. The pill carries the signal.
        { shadowColor: tint, shadowOpacity: 0.08 },
      ]}
    >
      {/* Header — LED-dot pill on the left, amount on the right */}
      <View style={styles.paymentHeaderRow}>
        <View style={[styles.statusPill, { backgroundColor: tintBg }]}>
          <View
            style={[
              styles.ledDot,
              {
                backgroundColor: tint,
                // 2px halo around the dot to make it read as a status LED.
                shadowColor: tint, shadowOpacity: 0.35, shadowRadius: 2,
              },
            ]}
          />
          <Text style={[styles.statusPillText, { color: tintFg }]}>
            {STATUS_LABEL[row.status] || row.status}
          </Text>
        </View>
        <Text
          style={[
            styles.paymentAmount,
            // Strike through the amount on cancelled rows so the reporter
            // immediately reads "this isn't money any more".
            row.status === "CANCELLED" && { textDecorationLine: "line-through", color: "#9ca3af" },
          ]}
        >
          {formatINR(row.amount)}
        </Text>
      </View>

      {/* Title */}
      <Text style={styles.paymentTitle} numberOfLines={2}>{row.article.title}</Text>

      {/* Meta row — category chip + dated context label */}
      <View style={styles.paymentMetaRow}>
        {row.article.category ? (
          <View
            style={[
              styles.catChipSolid,
              { backgroundColor: (row.article.category.color || "#FF2C2C") + "1A" },
            ]}
          >
            <Text
              style={[
                styles.catChipText,
                { color: row.article.category.color || "#FF2C2C" },
              ]}
            >
              {row.article.category.nameEn}
            </Text>
          </View>
        ) : null}
        <Text style={styles.paymentDate}>{dateContext} {dateLabel}</Text>
      </View>

      {/* PAID-only — divider + transaction info */}
      {row.status === "PAID" && (row.paymentMethod || row.transactionId) ? (
        <>
          <View style={styles.cardDivider} />
          <Text style={styles.paymentTxn} numberOfLines={1}>
            {row.paymentMethod ? row.paymentMethod : ""}
            {row.paymentMethod && row.transactionId ? " · " : ""}
            {row.transactionId ? `ref ${row.transactionId}` : ""}
          </Text>
        </>
      ) : null}

      {/* CANCELLED-only — divider + rejection note */}
      {row.status === "CANCELLED" && row.rejectionNote ? (
        <>
          <View style={styles.cardDivider} />
          <View style={styles.rejectionBox}>
            <Text style={styles.rejectionLabel}>{t("earnings.whyRejected")}</Text>
            <Text style={styles.rejectionNote}>{row.rejectionNote}</Text>
          </View>
        </>
      ) : null}

      {/* Optional sub-editor note */}
      {row.note ? <Text style={styles.paymentNote} numberOfLines={2}>“{row.note}”</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f3f4f6" },

  // Hero
  hero: {
    backgroundColor: "#FF2C2C",
    marginHorizontal: 14, marginTop: 16,
    borderRadius: 20, padding: 20,
    shadowColor: "#FF2C2C", shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  heroIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  heroLabel: { fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: "600" },
  heroAmount: { fontSize: 36, fontWeight: "900", color: "#fff", marginTop: 2 },
  heroHint: { fontSize: 11, color: "rgba(255,255,255,0.85)", marginTop: 8, fontWeight: "600" },

  // Date filter
  filterWrap: { paddingHorizontal: 14, marginTop: 14 },
  filterHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  filterHeaderText: { fontSize: 11, fontWeight: "800", color: "#6b7280", letterSpacing: 0.4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1, borderColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: "#111", borderColor: "#111" },
  chipText: { fontSize: 12, fontWeight: "600", color: "#374151" },
  chipTextActive: { color: "#fff" },
  customRangeBox: {
    marginTop: 10, padding: 12,
    backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb",
    flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "flex-end",
  },
  customField: { flex: 1, minWidth: 120, gap: 4 },
  customLabel: { fontSize: 10, fontWeight: "800", color: "#6b7280", letterSpacing: 0.4 },
  customButton: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 9, paddingHorizontal: 10,
    backgroundColor: "#f9fafb", borderRadius: 8, borderWidth: 1, borderColor: "#e5e7eb",
  },
  customButtonText: { fontSize: 13, color: "#111", fontWeight: "600", flexShrink: 1 },
  customButtonPlaceholder: { color: "#9ca3af", fontWeight: "500" },
  clearButton: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingVertical: 8, paddingHorizontal: 8,
  },
  clearButtonText: { fontSize: 12, fontWeight: "600", color: "#6b7280" },

  // Tabs
  tabRow: { flexDirection: "row", gap: 8, paddingHorizontal: 14, marginTop: 14 },
  tab: {
    flex: 1, backgroundColor: "#fff", borderRadius: 14, padding: 12,
    borderWidth: 1.5, borderColor: "#e5e7eb",
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  tabIcon: {
    width: 26, height: 26, borderRadius: 8,
    alignItems: "center", justifyContent: "center", marginBottom: 6,
  },
  tabLabel: { fontSize: 11, fontWeight: "700", color: "#666" },
  tabAmount: { fontSize: 15, fontWeight: "900", color: "#111", marginTop: 2 },

  // By-category section
  section: { paddingHorizontal: 14, marginTop: 18 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: "#111", marginBottom: 4 },
  sectionTitleInline: { fontSize: 16, fontWeight: "800", color: "#111" },
  sectionSub: { fontSize: 11, color: "#888", marginBottom: 10 },
  catList: { backgroundColor: "#fff", borderRadius: 14, padding: 14, gap: 14 },
  catRow: {},
  catHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  catName: { flex: 1, fontSize: 13, fontWeight: "700", color: "#111", marginRight: 8 },
  catTotal: { fontSize: 14, fontWeight: "900", color: "#111", fontVariant: ["tabular-nums"] },
  barTrack: { height: 6, backgroundColor: "#f3f4f6", borderRadius: 3, marginTop: 6, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3 },
  catCount: { fontSize: 10, color: "#888", marginTop: 4 },

  // List header (title + item count)
  listHeadRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "baseline",
    paddingHorizontal: 14, marginTop: 18, marginBottom: 10,
  },
  listHeadCount: { fontSize: 12, color: "#6b7280" },

  // Payment cards — matches the reporter web card design. No left-border
  // accent; status is read through the LED-dot pill + amount header.
  paymentCard: {
    backgroundColor: "#fff",
    marginHorizontal: 14,
    marginBottom: 10,
    borderRadius: 16,
    padding: 18,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  paymentHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    gap: 10,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  ledDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    shadowOffset: { width: 0, height: 0 },
    elevation: 1,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  paymentAmount: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111",
    // iOS/Android both honour tabular-nums via fontVariant for monospace digits.
    fontVariant: ["tabular-nums"],
  },
  paymentTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111",
    lineHeight: 21,
    marginBottom: 12,
  },
  paymentMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  // Solid (tinted-bg) category chip — replaces the old outlined one to
  // match the web reporter portal's category chip exactly.
  catChipSolid: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  catChipText: { fontSize: 11, fontWeight: "700" },
  paymentDate: { fontSize: 12, color: "#6b7280", fontWeight: "500" },
  cardDivider: {
    height: 1,
    backgroundColor: "#f3f4f6",
    marginVertical: 12,
  },
  paymentTxn: {
    fontSize: 11,
    color: "#6b7280",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  paymentNote: {
    fontSize: 12,
    color: "#666",
    fontStyle: "italic",
    marginTop: 8,
  },
  rejectionBox: {
    padding: 10,
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fee2e2",
  },
  rejectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#991b1b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  rejectionNote: { fontSize: 13, color: "#7f1d1d", lineHeight: 18 },

  empty: { padding: 48, alignItems: "center", gap: 10 },
  emptyText: { fontSize: 14, color: "#aaa", textAlign: "center" },

  // iOS spinner picker sheet (Android uses the native modal automatically)
  iosPickerBackdrop: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end",
  },
  iosPickerSheet: { backgroundColor: "#fff", paddingBottom: 30 },
  iosPickerHead: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#e5e7eb",
  },
  iosPickerTitle: { fontSize: 14, fontWeight: "700", color: "#111" },
  iosPickerCancel: { fontSize: 14, color: "#6b7280", fontWeight: "600" },
  iosPickerDone: { fontSize: 14, color: "#FF2C2C", fontWeight: "700" },
});
