import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, ActivityIndicator, Alert, RefreshControl } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearAuthToken } from "../lib/secure-token";
import * as Haptics from "expo-haptics";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useT } from "../i18n";
import { ScreenHeader } from "../components/ScreenHeader";
import { api } from "../api/client";
import { EditSheet } from "./profile/EditSheet";
import {
  SECTIONS, KYC_STATUS_KEY, KYC_STATUS_COLOR,
  initialsOf, titleCase,
  type ProfileResponse,
} from "./profile/meta";

/**
 * WhatsApp Settings-style landing page for the reporter profile.
 *
 * Shows the avatar hero (tap to change photo) plus a list of section rows
 * that push to dedicated detail screens (/profile-section/<key>). The only
 * inline interactions are: tap avatar → edit photo, tap email → "contact
 * admin", tap log out → confirm + sign out.
 */
export function ProfileScreen() {
  const { t } = useT();
  const router = useRouter();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editPhoto, setEditPhoto] = useState(false);

  const load = useCallback(async () => {
    try {
      const res: ProfileResponse = await api("/api/reporter/profile");
      setData(res);
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message);
    }
  }, [t]);

  // Refetch on focus so values just-approved by admin show up immediately
  // and any new pending requests update the pending-rows count.
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { setLoading(false); }, [data]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleLogout = async () => {
    await Promise.all([
      AsyncStorage.removeItem("user"),
      clearAuthToken(),
    ]);
    router.replace("/login");
  };
  const confirmLogout = () => {
    Alert.alert(t("profile.logoutConfirmTitle"), t("profile.logoutConfirmMsg"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.logout"), style: "destructive", onPress: handleLogout },
    ]);
  };

  if (loading || !data) {
    return (
      <View style={styles.screen}>
        <ScreenHeader />
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#FF2C2C" />
        </View>
      </View>
    );
  }

  const initials = initialsOf(data.user.name);
  const prettyRole = titleCase(data.user.role);
  const kycStatus: string = data.profile?.kycStatus || "PENDING";
  const kycColor = KYC_STATUS_COLOR[kycStatus] || KYC_STATUS_COLOR.PENDING;
  const kycLabel = t(`profile.${KYC_STATUS_KEY[kycStatus] || "kycPending"}`);
  const pendingCount = data.requests.filter((r) => r.status === "PENDING").length;

  return (
    <View style={styles.screen}>
      <ScreenHeader />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#FF2C2C"]} tintColor="#FF2C2C" />}
      >
        {/* Avatar hero — tap to change profile photo */}
        <View style={styles.hero}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => { Haptics.selectionAsync(); setEditPhoto(true); }}
            style={styles.avatarWrap}
            accessibilityLabel={t("profile.passportPhoto")}
          >
            <View style={styles.avatar}>
              {data.profile?.photoUrl ? (
                <Image source={{ uri: data.profile.photoUrl }} style={styles.avatarImage} />
              ) : initials ? (
                <Text style={styles.avatarText}>{initials}</Text>
              ) : (
                <Ionicons name="person" size={44} color="#fff" />
              )}
            </View>
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={14} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={styles.name} numberOfLines={1}>{data.user.name || "—"}</Text>
          <View style={styles.heroPills}>
            {prettyRole ? (
              <View style={styles.rolePill}>
                <Ionicons name="shield-checkmark" size={12} color="#FF2C2C" />
                <Text style={styles.rolePillText}>{prettyRole}</Text>
              </View>
            ) : null}
            <View style={[styles.kycPill, { backgroundColor: kycColor.bg }]}>
              <Text style={[styles.kycPillText, { color: kycColor.fg }]}>
                {t("profile.kycStatusLabel")}: {kycLabel}
              </Text>
            </View>
          </View>
          {kycStatus === "REJECTED" && data.profile?.kycRejectionNote ? (
            <View style={styles.kycRejectBox}>
              <Text style={styles.kycRejectLabel}>{t("profile.adminNote")}</Text>
              <Text style={styles.kycRejectText}>{data.profile.kycRejectionNote}</Text>
            </View>
          ) : null}
        </View>

        {/* Section list — each pushes to its own detail page.
            Exception: the KYC row routes to the full /kyc upload form while
            the reporter isn't VERIFIED yet (PENDING / SUBMITTED / REJECTED).
            That form is the single-shot submission flow; the per-field
            edit sheets only make sense for post-verification updates, where
            each change needs admin re-approval. */}
        <View style={styles.group}>
          {Object.entries(SECTIONS).map(([key, def], i, arr) => {
            const isKycRow = key === "kyc";
            const goToUploadForm = isKycRow && kycStatus !== "VERIFIED";
            return (
              <MenuRow
                key={key}
                icon={def.icon.name}
                iconFamily={def.icon.family}
                label={t(`profile.${def.titleKey}`)}
                last={i === arr.length - 1}
                onPress={() => router.push(goToUploadForm ? "/kyc" : `/profile-section/${key}`)}
              />
            );
          })}
        </View>

        {/* Pending requests — only show the row when there's something to see */}
        {data.requests.length > 0 ? (
          <View style={styles.group}>
            <MenuRow
              icon="time-outline"
              iconColor="#f59e0b"
              label={t("profile.pendingRequests")}
              badge={pendingCount > 0 ? String(pendingCount) : undefined}
              last
              onPress={() => router.push("/profile-pending")}
            />
          </View>
        ) : null}

        {/* Email — locked. Tapping shows the contact-admin alert. */}
        <View style={styles.group}>
          <MenuRow
            icon="mail-outline"
            label={t("profile.email")}
            sub={data.user.email}
            lock
            last
            onPress={() => Alert.alert(t("profile.lockedTitle"), t("profile.emailLockedMsg"))}
          />
        </View>

        {/* Security */}
        <View style={styles.group}>
          <MenuRow
            icon="lock-closed-outline"
            label={t("profile.changePassword")}
            last
            onPress={() => router.push("/profile-password")}
          />
        </View>

        {/* Log out */}
        <View style={styles.group}>
          <MenuRow
            icon="log-out-outline"
            label={t("common.logout")}
            hideChevron
            last
            onPress={confirmLogout}
          />
        </View>

        <Text style={styles.footer}>{t("login.appName")}</Text>
      </ScrollView>

      <EditSheet
        visible={editPhoto}
        field="photoUrl"
        currentValue={data.profile?.photoUrl}
        pending={data.requests.find((r) => r.field === "photoUrl" && r.status === "PENDING")}
        onClose={() => setEditPhoto(false)}
        onAfterSubmit={async () => { setEditPhoto(false); await load(); }}
      />
    </View>
  );
}

// ─── A single tappable settings-style row ──────────────────────────────────

function MenuRow({ icon, iconFamily = "ion", label, sub, badge, last, lock, hideChevron, iconColor = "#FF2C2C", labelColor = "#111", onPress }: {
  icon: string;
  iconFamily?: "ion" | "mc";
  label: string;
  sub?: string;
  badge?: string;
  last?: boolean;
  lock?: boolean;
  hideChevron?: boolean;
  iconColor?: string;
  labelColor?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.menuRow} activeOpacity={0.6} onPress={onPress}>
      {iconFamily === "mc" ? (
        <MaterialCommunityIcons name={icon as any} size={22} color={iconColor} style={styles.menuIcon} />
      ) : (
        <Ionicons name={icon as any} size={22} color={iconColor} style={styles.menuIcon} />
      )}
      <View style={[styles.menuText, last && styles.menuTextLast]}>
        <Text style={[styles.menuLabel, { color: labelColor }]} numberOfLines={1}>{label}</Text>
        {sub ? <Text style={styles.menuSub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {badge ? (
        <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>
      ) : null}
      {lock ? <Ionicons name="lock-closed" size={16} color="#bbb" style={styles.chevron} /> : null}
      {!hideChevron && !lock ? <Ionicons name="chevron-forward" size={18} color="#c4c4c4" style={styles.chevron} /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f3f4f6" },
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  // Extra paddingBottom so the last group + footer clear the native bottom
  // tab bar (~50px) instead of being hugged against it.
  content: { padding: 14, paddingBottom: 96 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },

  // Avatar hero
  hero: {
    backgroundColor: "#fff", borderRadius: 18, paddingVertical: 26, paddingHorizontal: 20,
    alignItems: "center", marginBottom: 18,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  avatarWrap: { width: 104, height: 104, marginBottom: 14, position: "relative" },
  avatar: {
    width: 104, height: 104, borderRadius: 52, backgroundColor: "#FF2C2C", overflow: "hidden",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#FF2C2C", shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 5,
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarText: { fontSize: 36, fontWeight: "900", color: "#fff", letterSpacing: 1 },
  cameraBadge: {
    position: "absolute", bottom: 0, right: 0,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "#FF2C2C",
    alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: "#fff",
  },
  name: { fontSize: 20, lineHeight: 26, fontWeight: "800", color: "#111", textAlign: "center" },
  heroPills: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap", justifyContent: "center" },
  rolePill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FF2C2C14", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  rolePillText: { fontSize: 12, fontWeight: "700", color: "#FF2C2C" },
  kycPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  kycPillText: { fontSize: 12, fontWeight: "700" },
  kycRejectBox: { marginTop: 14, padding: 10, backgroundColor: "#fef2f2", borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderLeftWidth: 3, borderLeftColor: "#dc2626", alignSelf: "stretch" },
  kycRejectLabel: { fontSize: 10, fontWeight: "800", color: "#dc2626" },
  kycRejectText: { fontSize: 12, color: "#666", marginTop: 2 },

  // Grouped card
  group: { backgroundColor: "#fff", borderRadius: 14, marginBottom: 14, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },

  // Menu row
  menuRow: { flexDirection: "row", alignItems: "center", paddingLeft: 16, minHeight: 56 },
  menuIcon: { width: 24, textAlign: "center", marginRight: 14 },
  menuText: { flex: 1, paddingVertical: 12, paddingRight: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#eef0f3" },
  menuTextLast: { borderBottomWidth: 0 },
  menuLabel: { fontSize: 15, fontWeight: "600" },
  menuSub: { fontSize: 12, color: "#999", marginTop: 2 },
  badge: { minWidth: 22, paddingHorizontal: 6, height: 22, borderRadius: 11, backgroundColor: "#FF2C2C", alignItems: "center", justifyContent: "center", marginRight: 8 },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  chevron: { marginRight: 16 },

  footer: { textAlign: "center", fontSize: 12, color: "#bbb", fontWeight: "600", marginTop: 4 },
});
