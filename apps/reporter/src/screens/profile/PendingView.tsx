import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useT } from "../../i18n";
import { api } from "../../api/client";
import { FIELDS, previewNewValue, getCurrentValue, type ProfileResponse, type PendingRequest } from "./meta";
import { EditSheet } from "./EditSheet";

/**
 * The "Pending Changes" detail screen — lists every PENDING and recent
 * REJECTED change request. Tapping a row reopens its edit sheet so the
 * reporter can revise or withdraw.
 */
export function ProfilePendingView() {
  const { t } = useT();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editField, setEditField] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res: ProfileResponse = await api("/api/reporter/profile");
      setData(res);
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message);
    }
  }, [t]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (loading || !data) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#FF2C2C" /></View>;
  }

  const requestByField = data.requests.reduce<Record<string, PendingRequest>>((acc, r) => {
    if (!acc[r.field]) acc[r.field] = r;
    return acc;
  }, {});

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#FF2C2C"]} tintColor="#FF2C2C" />}
      >
        {data.requests.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>{t("profile.noPending")}</Text>
          </View>
        ) : (
          <View style={styles.group}>
            {data.requests.map((r, i) => {
              const meta = FIELDS[r.field];
              const fieldLabel = meta ? t(`profile.${meta.labelKey}`) : r.field;
              const preview = previewNewValue(r.field, r.newValue);
              const isRejected = r.status === "REJECTED";
              const last = i === data.requests.length - 1;
              return (
                <TouchableOpacity
                  key={r.id}
                  style={styles.row}
                  activeOpacity={0.6}
                  onPress={() => setEditField(r.field)}
                >
                  <Ionicons
                    name={isRejected ? "close-circle-outline" : "time-outline"}
                    size={22}
                    color={isRejected ? "#dc2626" : "#f59e0b"}
                    style={styles.rowIcon}
                  />
                  <View style={[styles.rowText, last && styles.rowTextLast]}>
                    <Text style={[styles.rowLabel, isRejected && { color: "#dc2626" }]}>
                      {isRejected ? t("profile.rejectedBadge") : t("profile.pendingBadge")}
                    </Text>
                    <Text style={styles.rowValue} numberOfLines={2}>{fieldLabel}: {preview}</Text>
                    {isRejected && r.reviewerNote ? (
                      <Text style={styles.note} numberOfLines={3}>{r.reviewerNote}</Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#c4c4c4" style={{ marginRight: 16 }} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      <EditSheet
        visible={!!editField}
        field={editField}
        currentValue={editField ? getCurrentValue(data, editField) : null}
        pending={editField ? requestByField[editField] : undefined}
        onClose={() => setEditField(null)}
        onAfterSubmit={async () => { setEditField(null); await load(); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f3f4f6" },
  scroll: { flex: 1 },
  content: { padding: 14, paddingBottom: 36 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f3f4f6" },

  empty: { alignItems: "center", padding: 48, gap: 10 },
  emptyText: { fontSize: 14, color: "#aaa", textAlign: "center" },

  group: { backgroundColor: "#fff", borderRadius: 14, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  row: { flexDirection: "row", alignItems: "center", paddingLeft: 16 },
  rowIcon: { width: 24, textAlign: "center", marginRight: 14 },
  rowText: { flex: 1, paddingVertical: 12, paddingRight: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#eef0f3" },
  rowTextLast: { borderBottomWidth: 0 },
  rowLabel: { fontSize: 12, fontWeight: "600", color: "#FF2C2C", marginBottom: 2 },
  rowValue: { fontSize: 15, fontWeight: "500", color: "#111", lineHeight: 20 },
  note: { fontSize: 12, color: "#666", marginTop: 4, fontStyle: "italic" },
});
