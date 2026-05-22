import React, { useState, useEffect, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "../api/client";
import { useT } from "../i18n";
import { ScreenHeader } from "../components/ScreenHeader";

const statusColors: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#f3f4f6", text: "#555" },
  SUBMITTED: { bg: "#fef3c7", text: "#92400e" },
  IN_REVIEW: { bg: "#dbeafe", text: "#1d4ed8" },
  APPROVED: { bg: "#dcfce7", text: "#166534" },
  PUBLISHED: { bg: "#dcfce7", text: "#166534" },
  REJECTED: { bg: "#fef2f2", text: "#dc2626" },
};

// Status filter tabs shown at the top of the Articles screen.
const FILTERS = [
  { value: "SUBMITTED", key: "status.submitted" },
  { value: "APPROVED", key: "status.approved" },
  { value: "REJECTED", key: "status.rejected" },
  { value: "PUBLISHED", key: "status.published" },
];

// The "Articles" tab — the reporter's full article list, with a + New action.
export function ArticlesScreen() {
  const { t } = useT();
  const router = useRouter();
  const [articles, setArticles] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("SUBMITTED");

  const load = useCallback(async () => {
    try {
      // The endpoint derives the reporter from the bearer token api() sends.
      const data = await api("/api/reporter/articles?limit=50");
      setArticles(data.articles || []);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <View style={styles.screen}>
      <ScreenHeader />
      {/* Status filter tabs */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTERS.map((f) => {
            const active = filter === f.value;
            return (
              <TouchableOpacity
                key={f.value}
                onPress={() => setFilter(f.value)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{t(f.key)}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={articles.filter((a) => a.status === filter)}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 14, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#FF2C2C"]} tintColor="#FF2C2C" />
        }
        renderItem={({ item }) => {
          const sc = statusColors[item.status] || statusColors.DRAFT;
          return (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => router.push(`/edit-article?id=${item.id}`)}
            >
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                <View style={[styles.badge, { backgroundColor: sc.bg }]}>
                  <Text style={[styles.badgeText, { color: sc.text }]}>{item.status}</Text>
                </View>
              </View>
              <Text style={styles.meta}>
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
            <Ionicons name="newspaper-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>{t("dashboard.empty")}</Text>
          </View>
        }
      />

      {/* New-article action — a floating button (the header is shared/global) */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push("/new-article")}
        accessibilityLabel={t("dashboard.newArticle")}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f3f4f6" },
  filterBar: { backgroundColor: "#f3f4f6", paddingVertical: 10 },
  filterRow: { paddingHorizontal: 14, gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5e7eb" },
  chipActive: { backgroundColor: "#FF2C2C", borderColor: "#FF2C2C" },
  chipText: { fontSize: 13, fontWeight: "700", color: "#555" },
  chipTextActive: { color: "#fff" },
  fab: {
    position: "absolute", right: 16, bottom: 96,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: "#FF2C2C",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  card: {
    backgroundColor: "#fff", marginBottom: 10, borderRadius: 14, padding: 14,
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: "700", color: "#111", marginRight: 8, lineHeight: 20 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
  meta: { fontSize: 11, color: "#999", marginTop: 6 },
  rejectionBox: { marginTop: 10, padding: 9, backgroundColor: "#fef2f2", borderRadius: 8, borderLeftWidth: 3, borderLeftColor: "#dc2626" },
  rejectionLabel: { fontSize: 10, fontWeight: "800", color: "#dc2626" },
  rejectionText: { fontSize: 12, color: "#666", marginTop: 1 },
  empty: { padding: 48, alignItems: "center", gap: 10 },
  emptyText: { fontSize: 14, color: "#aaa", textAlign: "center" },
});
