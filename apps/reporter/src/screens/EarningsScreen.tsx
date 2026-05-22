import React, { useState, useEffect } from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import { api } from "../api/client";
import { useT } from "../i18n";
import { ScreenHeader } from "../components/ScreenHeader";

export function EarningsScreen() {
  const { t } = useT();
  const [payments, setPayments] = useState<any[]>([]);
  const [summary, setSummary] = useState({ total: 0, paid: 0, pending: 0, thisMonth: 0 });

  useEffect(() => {
    api("/api/reporter/earnings").then((data) => {
      setPayments(data.payments || []);
      setSummary(data.summary || { total: 0, paid: 0, pending: 0, thisMonth: 0 });
    }).catch(() => {});
  }, []);

  const statusColors: Record<string, string> = {
    CALCULATED: "#f59e0b", APPROVED: "#3b82f6", PAID: "#16a34a", PROCESSING: "#8b5cf6",
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader />
      <View style={styles.container}>
      {/* Summary Cards */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: "#dcfce7" }]}>
          <Text style={[styles.summaryAmount, { color: "#166534" }]}>₹{summary.total}</Text>
          <Text style={styles.summaryLabel}>{t("earnings.totalEarnings")}</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: "#dbeafe" }]}>
          <Text style={[styles.summaryAmount, { color: "#1d4ed8" }]}>₹{summary.thisMonth}</Text>
          <Text style={styles.summaryLabel}>{t("earnings.thisMonth")}</Text>
        </View>
      </View>
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: "#fef3c7" }]}>
          <Text style={[styles.summaryAmount, { color: "#92400e" }]}>₹{summary.pending}</Text>
          <Text style={styles.summaryLabel}>{t("earnings.pending")}</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: "#f0fdf4" }]}>
          <Text style={[styles.summaryAmount, { color: "#166534" }]}>₹{summary.paid}</Text>
          <Text style={styles.summaryLabel}>{t("earnings.paid")}</Text>
        </View>
      </View>

      {/* Payment History */}
      <Text style={styles.sectionTitle}>{t("earnings.paymentHistory")}</Text>
      <FlatList
        data={payments}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.paymentCard}>
            <View style={styles.paymentRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.paymentTitle} numberOfLines={1}>{item.article?.title || t("earnings.articleFallback")}</Text>
                <Text style={styles.paymentMeta}>{item.config?.name || item.articleType} • {new Date(item.createdAt).toLocaleDateString()}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.paymentAmount}>₹{item.totalAmount}</Text>
                <View style={[styles.paymentStatus, { backgroundColor: statusColors[item.status] || "#888" }]}>
                  <Text style={styles.paymentStatusText}>{item.status}</Text>
                </View>
              </View>
            </View>
            {item.transactionId && (
              <Text style={styles.txId}>{t("earnings.ref")}{item.transactionId}</Text>
            )}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>💰</Text>
            <Text style={styles.emptyText}>{t("earnings.empty")}</Text>
          </View>
        }
      />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f3f4f6" },
  container: { flex: 1, backgroundColor: "#f3f4f6", padding: 16 },
  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  summaryCard: { flex: 1, borderRadius: 12, padding: 16, alignItems: "center" },
  summaryAmount: { fontSize: 24, fontWeight: "900" },
  summaryLabel: { fontSize: 11, color: "#555", marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: "#111", marginTop: 12, marginBottom: 8 },
  paymentCard: { backgroundColor: "#fff", borderRadius: 10, padding: 14, marginBottom: 8, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  paymentRow: { flexDirection: "row", justifyContent: "space-between" },
  paymentTitle: { fontSize: 13, fontWeight: "700", color: "#111" },
  paymentMeta: { fontSize: 11, color: "#888", marginTop: 2 },
  paymentAmount: { fontSize: 18, fontWeight: "900", color: "#111" },
  paymentStatus: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, marginTop: 2 },
  paymentStatusText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  txId: { fontSize: 10, color: "#aaa", marginTop: 6, fontFamily: "monospace" },
  empty: { padding: 40, alignItems: "center" },
  emptyText: { fontSize: 14, color: "#aaa", textAlign: "center" },
});
