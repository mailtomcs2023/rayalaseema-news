import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { TextInput } from "../../components/Input";
import { getAuthToken } from "../../lib/secure-token";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useT } from "../../i18n";
import { FieldError } from "../../components/FieldError";
import { API_URL } from "../../api/client";
import { changePasswordSchema, fieldErrors } from "../../lib/validation";

/**
 * Standalone Change Password screen. Self-service (no admin approval) -
 * the only profile field reporters can change without a request flow.
 *
 * `forced` flips the screen into the auth-gate's lockout mode: shows a
 * "you can't leave until this is done" banner and, on success, jumps to
 * /home so the auth-gate re-evaluates (and routes on to /kyc if needed).
 */
export function ProfilePasswordView({ forced = false }: { forced?: boolean }) {
  const router = useRouter();
  const { t } = useT();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const clearErr = (k: string) => setErrors((e) => (e[k] ? { ...e, [k]: "" } : e));

  const submit = async () => {
    Haptics.selectionAsync();
    const parsed = changePasswordSchema(t).safeParse({ currentPassword, newPassword, confirmPassword });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`${API_URL}/api/reporter/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const out = await res.json();
      if (!res.ok || out.error) throw new Error(out.error || "Request failed");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Flip the cached `mustChangePassword` flag locally so the auth-gate
      // stops bouncing the reporter back here on the next launch (the server
      // already cleared it via the change-password endpoint).
      try {
        const cached = await AsyncStorage.getItem("user");
        if (cached) {
          const u = JSON.parse(cached);
          u.mustChangePassword = false;
          await AsyncStorage.setItem("user", JSON.stringify(u));
        }
      } catch {}

      if (forced) {
        // Forced flow: send them home so the auth-gate re-runs and either
        // lands them on /home or pushes them on to /kyc.
        Alert.alert(t("profile.changedTitle"), t("profile.changedMsg"), [
          { text: "OK", onPress: () => router.replace("/home") },
        ]);
      } else {
        Alert.alert(t("profile.changedTitle"), t("profile.changedMsg"));
      }
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message);
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={s.screen}
    >
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {forced && (
          <View style={s.forcedBanner}>
            <Ionicons name="shield-outline" size={18} color="#92400e" style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={s.forcedTitle}>Set a new password</Text>
              <Text style={s.forcedBody}>
                Your account was created with a temporary password. Choose a
                permanent one before continuing.
              </Text>
            </View>
          </View>
        )}

        <View style={s.card}>
          <Text style={s.fieldLabel}>{t("profile.currentPassword")}</Text>
          <TextInput
            style={[s.input, errors.currentPassword && s.inputError]}
            value={currentPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            onChangeText={(v) => { setCurrentPassword(v); clearErr("currentPassword"); }}
          />
          <FieldError message={errors.currentPassword} />

          <Text style={s.fieldLabel}>{t("profile.newPassword")}</Text>
          <TextInput
            style={[s.input, errors.newPassword && s.inputError]}
            value={newPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            onChangeText={(v) => { setNewPassword(v); clearErr("newPassword"); }}
          />
          <FieldError message={errors.newPassword} />

          <Text style={s.fieldLabel}>{t("profile.confirmPassword")}</Text>
          <TextInput
            style={[s.input, errors.confirmPassword && s.inputError]}
            value={confirmPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            onChangeText={(v) => { setConfirmPassword(v); clearErr("confirmPassword"); }}
          />
          <FieldError message={errors.confirmPassword} />

          <TouchableOpacity
            style={s.showRow}
            onPress={() => { Haptics.selectionAsync(); setShowPassword(!showPassword); }}
          >
            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color="#888" />
            <Text style={s.showText}>{showPassword ? t("register.hidePassword") : t("register.showPassword")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.submit, loading && s.submitDisabled]}
            onPress={submit}
            disabled={loading}
          >
            <Text style={s.submitText}>{loading ? t("profile.updating") : t("profile.updateBtn")}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f3f4f6" },
  content: { padding: 14, paddingBottom: 36 },
  card: {
    backgroundColor: "#fff", borderRadius: 14, padding: 16,
    shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: "#555", marginBottom: 5, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 13, fontSize: 14, backgroundColor: "#fafafa" },
  inputError: { borderColor: "#dc2626" },
  showRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, marginBottom: 14 },
  showText: { fontSize: 13, color: "#888", fontWeight: "600" },
  submit: { backgroundColor: "#FF2C2C", borderRadius: 12, padding: 15, alignItems: "center", marginTop: 4 },
  submitDisabled: { backgroundColor: "#999" },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  forcedBanner: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#fef3c7",
    borderColor: "#fde68a",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  forcedTitle: { fontSize: 13, fontWeight: "700", color: "#92400e", marginBottom: 2 },
  forcedBody: { fontSize: 12, color: "#92400e", lineHeight: 17 },
});
