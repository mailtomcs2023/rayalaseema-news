import React, { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useT } from "../i18n";
import { FieldError } from "../components/FieldError";
import { ScreenHeader } from "../components/ScreenHeader";
import { changePasswordSchema, fieldErrors } from "../lib/validation";

const API_URL = process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? "http://10.0.2.2:3001" : "https://admin.rayalaseemaexpress.com");

// "Nikesh Reddy" -> "NR"; single word -> first two letters.
function initialsOf(name?: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// "SENIOR_REPORTER" -> "Senior Reporter"
function titleCase(s?: string) {
  return (s || "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ProfileScreen() {
  const { t } = useT();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    AsyncStorage.getItem("user").then((u) => { if (u) setUser(JSON.parse(u)); });
  }, []);

  const clearErr = (k: string) => setErrors((e) => (e[k] ? { ...e, [k]: "" } : e));

  const handleLogout = async () => {
    await AsyncStorage.multiRemove(["user", "auth-token"]);
    router.replace("/login");
  };

  const handleChangePassword = async () => {
    Haptics.selectionAsync();
    const parsed = changePasswordSchema(t).safeParse({ currentPassword, newPassword, confirmPassword });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setLoading(true);

    try {
      const token = await AsyncStorage.getItem("auth-token");
      const res = await fetch(`${API_URL}/api/reporter/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Request failed");

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwOpen(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(t("profile.changedTitle"), t("profile.changedMsg"));
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message);
    }
    setLoading(false);
  };

  const initials = initialsOf(user?.name);
  const prettyRole = titleCase(user?.role);

  return (
    <View style={styles.screen}>
      <ScreenHeader />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar hero */}
        <View style={styles.hero}>
          <View style={styles.avatar}>
            {initials ? (
              <Text style={styles.avatarText}>{initials}</Text>
            ) : (
              <Ionicons name="person" size={44} color="#fff" />
            )}
          </View>
          <Text style={styles.name} numberOfLines={1}>{user?.name || "—"}</Text>
          {prettyRole ? (
            <View style={styles.rolePill}>
              <Ionicons name="shield-checkmark" size={12} color="#FF2C2C" />
              <Text style={styles.rolePillText}>{prettyRole}</Text>
            </View>
          ) : null}
        </View>

        {/* Account information */}
        <Text style={styles.sectionLabel}>{t("profile.accountInfo")}</Text>
        <View style={styles.group}>
          <InfoRow icon="mail-outline" label={t("profile.email")} value={user?.email} />
          <InfoRow icon="call-outline" label={t("profile.phone")} value={user?.phone} />
          <InfoRow icon="briefcase-outline" label={t("profile.role")} value={prettyRole} last />
        </View>

        {/* Change password — an expandable settings row */}
        <View style={styles.group}>
          <TouchableOpacity
            style={styles.navRow}
            activeOpacity={0.6}
            onPress={() => { Haptics.selectionAsync(); setPwOpen((o) => !o); }}
          >
            <Ionicons name="lock-closed-outline" size={22} color="#FF2C2C" style={styles.navIcon} />
            <Text style={styles.navLabel}>{t("profile.changePassword")}</Text>
            <Ionicons name={pwOpen ? "chevron-up" : "chevron-forward"} size={18} color="#c4c4c4" />
          </TouchableOpacity>

          {pwOpen && (
            <View style={styles.pwForm}>
              <Text style={styles.fieldLabel}>{t("profile.currentPassword")}</Text>
              <TextInput
                style={[styles.input, errors.currentPassword ? styles.inputError : null]}
                value={currentPassword}
                onChangeText={(v) => { setCurrentPassword(v); clearErr("currentPassword"); }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <FieldError message={errors.currentPassword} />

              <Text style={styles.fieldLabel}>{t("profile.newPassword")}</Text>
              <TextInput
                style={[styles.input, errors.newPassword ? styles.inputError : null]}
                value={newPassword}
                onChangeText={(v) => { setNewPassword(v); clearErr("newPassword"); }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <FieldError message={errors.newPassword} />

              <Text style={styles.fieldLabel}>{t("profile.confirmPassword")}</Text>
              <TextInput
                style={[styles.input, errors.confirmPassword ? styles.inputError : null]}
                value={confirmPassword}
                onChangeText={(v) => { setConfirmPassword(v); clearErr("confirmPassword"); }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <FieldError message={errors.confirmPassword} />

              <TouchableOpacity
                style={styles.showRow}
                onPress={() => { Haptics.selectionAsync(); setShowPassword(!showPassword); }}
              >
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color="#888" />
                <Text style={styles.showText}>
                  {showPassword ? t("register.hidePassword") : t("register.showPassword")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.updateBtn, loading && styles.updateBtnDisabled]}
                onPress={handleChangePassword}
                disabled={loading}
              >
                <Text style={styles.updateBtnText}>{loading ? t("profile.updating") : t("profile.updateBtn")}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Log out */}
        <View style={styles.group}>
          <TouchableOpacity style={styles.navRow} activeOpacity={0.6} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={22} color="#dc2626" style={styles.navIcon} />
            <Text style={[styles.navLabel, styles.logoutLabel]}>{t("dashboard.logout")}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>{t("login.appName")}</Text>
      </ScrollView>
    </View>
  );
}

// A read-only WhatsApp-style row: icon, then value on top with the field
// label below it. The divider is inset so it starts past the icon.
function InfoRow({ icon, label, value, last }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  last?: boolean;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={22} color="#FF2C2C" style={styles.infoIcon} />
      <View style={[styles.infoText, last ? styles.infoTextLast : null]}>
        <Text style={styles.infoValue} numberOfLines={1}>{value || "—"}</Text>
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f3f4f6" },
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  content: { padding: 14, paddingBottom: 36 },

  // Avatar hero
  hero: {
    backgroundColor: "#fff", borderRadius: 18, paddingVertical: 26, paddingHorizontal: 20,
    alignItems: "center", marginBottom: 20,
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  avatar: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: "#FF2C2C",
    alignItems: "center", justifyContent: "center", marginBottom: 14,
    shadowColor: "#FF2C2C", shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  avatarText: { fontSize: 36, fontWeight: "900", color: "#fff", letterSpacing: 1 },
  name: { fontSize: 20, lineHeight: 26, fontWeight: "800", color: "#111", textAlign: "center" },
  rolePill: {
    flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8,
    backgroundColor: "#FF2C2C14", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999,
  },
  rolePillText: { fontSize: 12, fontWeight: "700", color: "#FF2C2C" },

  // Section
  sectionLabel: {
    fontSize: 12, fontWeight: "800", color: "#FF2C2C",
    textTransform: "uppercase", letterSpacing: 0.6, marginLeft: 6, marginBottom: 8,
  },
  group: {
    backgroundColor: "#fff", borderRadius: 14, marginBottom: 18, overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },

  // Info row (read-only)
  infoRow: { flexDirection: "row", alignItems: "center", paddingLeft: 16 },
  infoIcon: { width: 24, textAlign: "center", marginRight: 14 },
  infoText: {
    flex: 1, paddingVertical: 12, paddingRight: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e5e7eb",
  },
  infoTextLast: { borderBottomWidth: 0 },
  infoValue: { fontSize: 15, fontWeight: "600", color: "#111" },
  infoLabel: { fontSize: 12, color: "#999", marginTop: 2 },

  // Navigation / action row (Change Password, Log out)
  navRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, height: 56 },
  navIcon: { width: 24, textAlign: "center", marginRight: 14 },
  navLabel: { flex: 1, fontSize: 15, fontWeight: "600", color: "#111" },
  logoutLabel: { color: "#dc2626" },

  // Change-password form (revealed under its row)
  pwForm: { paddingHorizontal: 16, paddingBottom: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb" },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: "#555", marginBottom: 5, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 13, fontSize: 14, backgroundColor: "#fafafa" },
  inputError: { borderColor: "#dc2626" },
  showRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, marginBottom: 14 },
  showText: { fontSize: 13, color: "#888", fontWeight: "600" },
  updateBtn: { backgroundColor: "#FF2C2C", borderRadius: 10, padding: 15, alignItems: "center" },
  updateBtnDisabled: { backgroundColor: "#999" },
  updateBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  footer: { textAlign: "center", fontSize: 12, color: "#bbb", fontWeight: "600", marginTop: 4 },
});
