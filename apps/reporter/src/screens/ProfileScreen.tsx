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

export function ProfileScreen() {
  const { t } = useT();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(t("profile.changedTitle"), t("profile.changedMsg"));
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message);
    }
    setLoading(false);
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader />
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 16 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
      {/* Account info */}
      <Text style={styles.section}>{t("profile.accountInfo")}</Text>
      <View style={styles.card}>
        <InfoRow label={t("profile.name")} value={user?.name} />
        <InfoRow label={t("profile.email")} value={user?.email} />
        <InfoRow label={t("profile.phone")} value={user?.phone} />
        <InfoRow label={t("profile.role")} value={user?.role} last />
      </View>

      {/* Change password */}
      <Text style={styles.section}>{t("profile.changePassword")}</Text>
      <View style={styles.card}>
        <Text style={styles.label}>{t("profile.currentPassword")}</Text>
        <TextInput
          style={[styles.input, errors.currentPassword ? styles.inputError : null]}
          value={currentPassword}
          onChangeText={(v) => { setCurrentPassword(v); clearErr("currentPassword"); }}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
        />
        <FieldError message={errors.currentPassword} />

        <Text style={styles.label}>{t("profile.newPassword")}</Text>
        <TextInput
          style={[styles.input, errors.newPassword ? styles.inputError : null]}
          value={newPassword}
          onChangeText={(v) => { setNewPassword(v); clearErr("newPassword"); }}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
        />
        <FieldError message={errors.newPassword} />

        <Text style={styles.label}>{t("profile.confirmPassword")}</Text>
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
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleChangePassword}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? t("profile.updating") : t("profile.updateBtn")}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={18} color="#dc2626" />
        <Text style={styles.logoutText}>{t("dashboard.logout")}</Text>
      </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// One "Label ........ value" row in the account-info card.
function InfoRow({ label, value, last }: { label: string; value?: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last ? styles.infoRowLast : null]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || "—"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f3f4f6" },
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  section: { fontSize: 12, fontWeight: "800", color: "#888", marginBottom: 8, marginTop: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: "#e5e7eb" },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  infoRowLast: { borderBottomWidth: 0 },
  infoLabel: { fontSize: 13, color: "#888", fontWeight: "600" },
  infoValue: { fontSize: 13, color: "#111", fontWeight: "700", flexShrink: 1, textAlign: "right", marginLeft: 12 },
  label: { fontSize: 12, fontWeight: "600", color: "#555", marginBottom: 4, marginTop: 8 },
  input: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 14, fontSize: 14, backgroundColor: "#fafafa" },
  inputError: { borderColor: "#dc2626" },
  showRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, marginBottom: 14 },
  showText: { fontSize: 13, color: "#888", fontWeight: "600" },
  button: { backgroundColor: "#FF2C2C", borderRadius: 10, padding: 16, alignItems: "center", marginTop: 4 },
  buttonDisabled: { backgroundColor: "#999" },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  logoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#fecaca", borderRadius: 10,
    padding: 14, marginBottom: 24,
  },
  logoutText: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: "#dc2626" },
});
