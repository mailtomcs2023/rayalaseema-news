import React, { useState, useEffect, useCallback } from "react";
import { View, Text, FlatList, StyleSheet, RefreshControl, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { useT } from "../i18n";
import { ScreenHeader } from "../components/ScreenHeader";
import { KycBanner } from "../components/KycBanner";

// Status accent colors for payment-history rows.
const statusColors: Record<string, { bg: string; text: string }> = {
  CALCULATED: { bg: "#fef3c7", text: "#92400e" },
  APPROVED: { bg: "#dbeafe", text: "#1d4ed8" },
  PROCESSING: { bg: "#ede9fe", text: "#6d28d9" },
  PAID: { bg: "#dcfce7", text: "#166534" },
};

export function EarningsScreen() {
  const { t } = useT();
  const [payments, setPayments] = useState<any[]>([]);
  const [summary, setSummary] = useState({ total: 0, paid: 0, pending: 0, thisMonth: 0 });
  const [refreshing, setRefreshing] = useState(false);
  // Server returns { locked: true } when the reporter's KYC isn't VERIFIED;
  // we swap the empty list for a KYC-required hint in that case.
  const [locked, setLocked] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api("/api/reporter/earnings");
      setPayments(data.payments || []);
      setSummary(data.summary || { total: 0, paid: 0, pending: 0, thisMonth: 0 });
      setLocked(!!data.locked);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <View style={styles.screen}>
      <ScreenHeader />
      <KycBanner />
      <FlatList
        data={payments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: Platform.OS === "android" ? 100 : 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#FF2C2C"]} tintColor="#FF2C2C" />
        }
        ListHeaderComponent={
          <View>
            {/* Hero — total earnings */}
            <View style={styles.hero}>
              <View style={styles.heroIcon}>
                <Ionicons name="wallet" size={22} color="#fff" />
              </View>
              <Text style={styles.heroLabel}>{t("earnings.totalEarnings")}</Text>
              <Text style={styles.heroAmount}>₹{Number(summary.total).toLocaleString("en-IN")}</Text>
            </View>

            {/* Stat row — this month / pending / paid */}
            <View style={styles.statRow}>
              <StatCard icon="calendar-outline" tint="#3b82f6" value={summary.thisMonth} label={t("earnings.thisMonth")} />
              <StatCard icon="hourglass-outline" tint="#f59e0b" value={summary.pending} label={t("earnings.pending")} />
              <StatCard icon="checkmark-circle-outline" tint="#16a34a" value={summary.paid} label={t("earnings.paid")} />
            </View>

            <Text style={styles.sectionTitle}>{t("earnings.paymentHistory")}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const sc = statusColors[item.status] || { bg: "#f3f4f6", text: "#555" };
          return (
            <View style={styles.paymentCard}>
              <View style={[styles.accent, { backgroundColor: sc.text }]} />
              <View style={styles.paymentBody}>
                <View style={styles.paymentRow}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.paymentTitle} numberOfLines={1}>
                      {item.article?.title || t("earnings.articleFallback")}
                    </Text>
                    <Text style={styles.paymentMeta}>
                      {item.config?.name || item.articleType} • {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={styles.paymentAmount}>₹{item.totalAmount}</Text>
                </View>
                <View style={styles.paymentFooter}>
                  <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                    <Text style={[styles.statusText, { color: sc.text }]}>{item.status}</Text>
                  </View>
                  {item.transactionId && (
                    <Text style={styles.txId} numberOfLines={1}>{t("earnings.ref")}{item.transactionId}</Text>
                  )}
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name={locked ? "lock-closed-outline" : "cash-outline"} size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>
              {locked ? t("kyc.lockedEarnings") : t("earnings.empty")}
            </Text>
          </View>
        }
      />
    </View>
  );
}

// A single stat tile — tinted icon chip, value, label.
function StatCard({ icon, tint, value, label }: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  value: number;
  label: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: tint + "1A" }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <Text style={styles.statValue}>₹{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f3f4f6" },

  // Hero card
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

  // Stat row
  statRow: { flexDirection: "row", gap: 8, paddingHorizontal: 14, marginTop: 12 },
  statCard: {
    flex: 1, backgroundColor: "#fff", borderRadius: 14, padding: 12,
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  statIcon: {
    width: 30, height: 30, borderRadius: 9,
    alignItems: "center", justifyContent: "center", marginBottom: 8,
  },
  statValue: { fontSize: 17, fontWeight: "900", color: "#111" },
  statLabel: { fontSize: 11, color: "#888", fontWeight: "600", marginTop: 1 },

  sectionTitle: { fontSize: 16, fontWeight: "800", color: "#111", paddingHorizontal: 16, marginTop: 20, marginBottom: 10 },

  // Payment cards
  paymentCard: {
    flexDirection: "row",
    backgroundColor: "#fff", marginHorizontal: 14, marginBottom: 10, borderRadius: 14, overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  accent: { width: 4 },
  paymentBody: { flex: 1, padding: 14 },
  paymentRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  paymentTitle: { fontSize: 14, fontWeight: "700", color: "#111" },
  paymentMeta: { fontSize: 11, color: "#999", marginTop: 3 },
  paymentAmount: { fontSize: 18, fontWeight: "900", color: "#111" },
  paymentFooter: { flexDirection: "row", alignItems: "center", marginTop: 10, gap: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
  txId: { flex: 1, fontSize: 10, color: "#bbb", fontFamily: "monospace" },

  empty: { padding: 48, alignItems: "center", gap: 10 },
  emptyText: { fontSize: 14, color: "#aaa", textAlign: "center" },
});
