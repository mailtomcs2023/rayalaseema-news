import React, { useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../api/client";
import { useT } from "../i18n";
import { useRouter, useFocusEffect } from "expo-router";
import { ScreenHeader } from "../components/ScreenHeader";
import { KycBanner } from "../components/KycBanner";
import { requireVerifiedKyc } from "../lib/kyc-gate";

const statusColors: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#f3f4f6", text: "#555" },
  SUBMITTED: { bg: "#fef3c7", text: "#92400e" },
  IN_REVIEW: { bg: "#dbeafe", text: "#1d4ed8" },
  APPROVED: { bg: "#dcfce7", text: "#166534" },
  PUBLISHED: { bg: "#dcfce7", text: "#166534" },
  REJECTED: { bg: "#fef2f2", text: "#dc2626" },
};

export function DashboardScreen() {
  const { t } = useT();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [articles, setArticles] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, approved: 0, earnings: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const userData = await AsyncStorage.getItem("user");
    if (userData) setUser(JSON.parse(userData));

    try {
      // The endpoint derives the reporter from the bearer token api() sends.
      const data = await api("/api/reporter/articles?limit=20");
      const list = data.articles || [];
      setArticles(list);
      setStats({
        total: data.total || 0,
        // "Approved" mirrors the chip in the Articles tab - articles that
        // passed editor review (also counts PUBLISHED since published is the
        // downstream state of approved).
        approved: list.filter((a: any) => a.status === "APPROVED" || a.status === "PUBLISHED").length,
        earnings: 0,
      });
    } catch {}
  }, []);

  // Refetch on every focus so the list/KPIs auto-refresh after submitting a
  // new article (or any return-from-detail). Native tabs keep screens mounted,
  // so a one-shot useEffect on mount wouldn't catch this.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const name = user?.name || t("dashboard.reporterFallback");

  return (
    <View style={styles.container}>
      <ScreenHeader />
      <FlatList
        style={styles.list}
        data={articles}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: Platform.OS === "android" ? 100 : 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#FF2C2C"]} tintColor="#FF2C2C" />
        }
        ListHeaderComponent={
          <View>
            <KycBanner />
            <Text style={styles.welcome}>{t("dashboard.greeting", { name })}</Text>
            {/* KPI grid - each card deep-links to the matching tab/filter */}
            <View style={styles.kpiGrid}>
              <KpiCard
                icon="document-text-outline" tint="#3b82f6"
                value={stats.total} label={t("dashboard.total")}
                onPress={() => router.navigate("/articles")}
              />
              <KpiCard
                icon="checkmark-done-outline" tint="#16a34a"
                value={stats.approved} label={t("dashboard.approved")}
                onPress={() => router.navigate("/articles?status=APPROVED")}
              />
              <KpiCard
                icon="wallet-outline" tint="#FF2C2C"
                value={`₹${stats.earnings}`} label={t("dashboard.earnings")}
                onPress={() => router.navigate("/earnings")}
              />
            </View>

            <Text style={styles.sectionTitle}>{t("dashboard.myArticles")}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const sc = statusColors[item.status] || statusColors.DRAFT;
          return (
            <TouchableOpacity
              style={styles.articleCard}
              activeOpacity={0.8}
              onPress={() => router.push(`/new-article?id=${item.id}`)}
            >
              <View style={styles.articleRow}>
                <Text style={styles.articleTitle} numberOfLines={2}>{item.title}</Text>
                <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                  <Text style={[styles.statusText, { color: sc.text }]}>{item.status}</Text>
                </View>
              </View>
              <Text style={styles.articleMeta}>
                {item.category?.nameEn || ""} • {item.viewCount || 0} {t("dashboard.views")} • {new Date(item.createdAt).toLocaleDateString()}
              </Text>
              {item.rejectionNote && item.status === "REJECTED" && (
                <View style={styles.rejectionBox}>
                  <Text style={styles.rejectionLabel}>{t("dashboard.feedback")}</Text>
                  <Text style={styles.rejectionText}>{item.rejectionNote}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>{t("dashboard.empty")}</Text>
          </View>
        }
      />

      {/* New-article action - floating button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={async () => {
          if (await requireVerifiedKyc(t, router)) router.push("/new-article");
        }}
        accessibilityLabel={t("dashboard.newArticle")}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

// A single KPI tile - tinted icon chip, big number, label. Tapping it
// navigates to the related tab (see onPress wiring in the grid above).
function KpiCard({ icon, tint, value, label, onPress }: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  value: number | string;
  label: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.kpiCard}
      activeOpacity={0.7}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.kpiTopRow}>
        <View style={[styles.kpiIcon, { backgroundColor: tint + "1A" }]}>
          <Ionicons name={icon} size={18} color={tint} />
        </View>
        <Ionicons name="chevron-forward" size={16} color="#c4c4c4" />
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  list: { flex: 1 },

  welcome: { fontSize: 17, lineHeight: 24, fontWeight: "800", color: "#111", paddingHorizontal: 16, paddingTop: 16 },

  // KPI grid (2x2)
  // Three cards in a single row - flex:1 splits the available width evenly.
  kpiGrid: {
    flexDirection: "row", gap: 8,
    paddingHorizontal: 14, paddingTop: 10,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: "#fff", borderRadius: 16, padding: 12,
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  kpiTopRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginBottom: 8,
  },
  kpiIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  kpiValue: { fontSize: 22, fontWeight: "900", color: "#111" },
  kpiLabel: { fontSize: 12, color: "#888", fontWeight: "600", marginTop: 1 },

  sectionTitle: { fontSize: 16, fontWeight: "800", color: "#111", paddingHorizontal: 16, marginTop: 6, marginBottom: 10 },

  // Floating "new article" button
  fab: {
    position: "absolute", right: 16, bottom: 120,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: "#FF2C2C",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },

  // Article cards
  articleCard: {
    backgroundColor: "#fff", marginHorizontal: 14, marginBottom: 10, borderRadius: 14, padding: 14,
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  articleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  articleTitle: { flex: 1, fontSize: 14, fontWeight: "700", color: "#111", marginRight: 8, lineHeight: 20 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
  articleMeta: { fontSize: 11, color: "#999", marginTop: 6 },
  // Flat-left, rounded-right callout: the red border-left is the marker, the
  // right side rounds off so it doesn't read as a floating card.
  rejectionBox: { marginTop: 10, padding: 9, backgroundColor: "#fef2f2", borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderLeftWidth: 3, borderLeftColor: "#dc2626" },
  rejectionLabel: { fontSize: 10, fontWeight: "800", color: "#dc2626" },
  rejectionText: { fontSize: 12, color: "#666", marginTop: 1 },

  empty: { padding: 48, alignItems: "center", gap: 10 },
  emptyText: { fontSize: 14, color: "#aaa", textAlign: "center" },
});
