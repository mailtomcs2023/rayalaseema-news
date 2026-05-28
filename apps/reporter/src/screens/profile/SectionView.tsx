import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, ActivityIndicator, Alert, RefreshControl } from "react-native";
import { Ionicons, FontAwesome6 } from "@expo/vector-icons";
import { useT } from "../../i18n";
import { api } from "../../api/client";
import {
  FIELDS, getCurrentValue, formatDisplay, previewNewValue,
  type FieldMeta, type ProfileResponse, type PendingRequest,
} from "./meta";
import { EditSheet } from "./EditSheet";

/**
 * Renders one section's worth of fields as WhatsApp-style two-line rows.
 * The parent passes a list of field keys; we load the profile, render
 * each row, and manage the single edit sheet shared across all rows.
 *
 * Used by every section screen (Personal, Address, KYC, Bank).
 */
export function ProfileSectionView({ fields }: { fields: string[] }) {
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
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#FF2C2C" />
      </View>
    );
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
        <View style={styles.group}>
          {fields.map((field, i) => {
            const meta = FIELDS[field];
            if (!meta) return null;
            return (
              <FieldRow
                key={field}
                field={field}
                meta={meta}
                value={getCurrentValue(data, field)}
                pending={requestByField[field]}
                last={i === fields.length - 1}
                onEdit={() => setEditField(field)}
              />
            );
          })}
        </View>
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

// ─── Field row - WhatsApp profile layout: label on top, value below ─────────

function FieldRow({ field, meta, value, pending, last, onEdit }: {
  field: string;
  meta: FieldMeta;
  value: unknown;
  pending?: PendingRequest;
  last?: boolean;
  onEdit: () => void;
}) {
  const { t } = useT();
  const isImage = meta.kind === "url";
  const hasPending = pending?.status === "PENDING";
  const wasRejected = pending?.status === "REJECTED";

  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.6} onPress={onEdit}>
      <Ionicons name={meta.icon} size={22} color="#FF2C2C" style={styles.rowIcon} />
      <View style={[styles.rowText, last && styles.rowTextLast]}>
        <Text style={styles.rowLabel}>{t(`profile.${meta.labelKey}`)}</Text>
        {isImage && value ? (
          <Image source={{ uri: String(value) }} style={styles.thumb} />
        ) : (
          <Text style={styles.rowValue} numberOfLines={2}>
            {isImage ? "-" : formatDisplay(field, value)}
          </Text>
        )}

        {hasPending ? (
          <View style={styles.pendingChip}>
            <Ionicons name="time-outline" size={11} color="#92400e" />
            <Text style={styles.pendingChipText} numberOfLines={1}>
              {t("profile.pendingBadge")} → {previewNewValue(field, pending!.newValue)}
            </Text>
          </View>
        ) : null}

        {wasRejected ? (
          <View style={styles.rejectedBox}>
            <Text style={styles.rejectedLabel}>{t("profile.rejectedBadge")}</Text>
            {pending?.reviewerNote ? (
              <Text style={styles.rejectedNote}>{pending.reviewerNote}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
      <FontAwesome6 name="edit" size={16} color="#c4c4c4" style={{ marginRight: 16 }} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f3f4f6" },
  scroll: { flex: 1, backgroundColor: "#f3f4f6" },
  content: { padding: 14, paddingBottom: 36 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f3f4f6" },

  group: { backgroundColor: "#fff", borderRadius: 14, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },

  row: { flexDirection: "row", alignItems: "center", paddingLeft: 16 },
  rowIcon: { width: 24, textAlign: "center", marginRight: 14 },
  rowText: { flex: 1, paddingVertical: 12, paddingRight: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#eef0f3" },
  rowTextLast: { borderBottomWidth: 0 },
  rowLabel: { fontSize: 12, fontWeight: "600", color: "#FF2C2C", marginBottom: 2 },
  rowValue: { fontSize: 15, fontWeight: "500", color: "#111", lineHeight: 20 },

  thumb: { width: 56, height: 56, borderRadius: 8, marginTop: 4, backgroundColor: "#f3f4f6" },

  pendingChip: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, backgroundColor: "#fef3c7", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: "flex-start", maxWidth: "100%" },
  pendingChipText: { fontSize: 11, fontWeight: "700", color: "#92400e", flexShrink: 1 },
  rejectedBox: { marginTop: 6, padding: 8, backgroundColor: "#fef2f2", borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderTopRightRadius: 6, borderBottomRightRadius: 6, borderLeftWidth: 2, borderLeftColor: "#dc2626" },
  rejectedLabel: { fontSize: 11, fontWeight: "800", color: "#dc2626" },
  rejectedNote: { fontSize: 12, color: "#666", marginTop: 2 },
});
