import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { TextInput } from "../components/Input";
import { DismissKeyboard } from "../components/DismissKeyboard";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setAuthToken } from "../lib/secure-token";
import { useT } from "../i18n";
import { LanguageToggle } from "../components/LanguageToggle";
import { FieldError } from "../components/FieldError";
import { loginSchema, fieldErrors } from "../lib/validation";
import { api } from "../api/client";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";

// API_URL is the single source of truth in api/client.ts — imported above.

export function LoginScreen() {
  const { t } = useT();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const clearErr = (k: string) => setErrors((e) => (e[k] ? { ...e, [k]: "" } : e));

  const handleLogin = async () => {
    Haptics.selectionAsync();
    const parsed = loginSchema(t).safeParse({ email, password });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setLoading(true);

    try {
      // Single JSON POST to the reporter login endpoint via the shared api()
      // helper, which adds a 10s timeout + tags network errors with the URL
      // it could not reach (raw fetch hangs ~60s on a dropped connection).
      const data = await api("/api/reporter/login", {
        method: "POST",
        body: { email: email.trim(), password },
      });

      if (data.user && data.token) {
        await AsyncStorage.setItem("user", JSON.stringify(data.user));
        await setAuthToken(data.token);
        router.replace("/home");
      } else {
        Alert.alert(t("login.loginFailed"), data.error || t("login.invalidCredentials"));
      }
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message);
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
      <DismissKeyboard>
      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <LanguageToggle />
        </View>
        <Image source={require("../../assets/logo.png")} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>{t("login.appName")}</Text>
        <Text style={styles.subtitle}>{t("login.subtitle")}</Text>

        <TextInput
          style={[styles.input, errors.email ? styles.inputError : null]}
          placeholder={t("login.email")}
          value={email}
          onChangeText={(v) => { setEmail(v); clearErr("email"); }}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <FieldError message={errors.email} />
        <View style={[styles.passwordField, errors.password ? styles.inputError : null]}>
          <TextInput
            style={styles.passwordInput}
            placeholder={t("login.password")}
            value={password}
            onChangeText={(v) => { setPassword(v); clearErr("password"); }}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
          />
          <TouchableOpacity
            onPress={() => { Haptics.selectionAsync(); setShowPassword(!showPassword); }}
            style={styles.eyeButton}
            accessibilityLabel={showPassword ? t("register.hidePassword") : t("register.showPassword")}
          >
            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color="#888" />
          </TouchableOpacity>
        </View>
        <FieldError message={errors.password} />

        <TouchableOpacity
          style={styles.forgotLink}
          onPress={() => Alert.alert(t("login.forgotPassword"), t("login.forgotPasswordMsg"))}
        >
          <Text style={styles.forgotText}>{t("login.forgotPassword")}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleLogin} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? t("login.loggingIn") : t("login.loginBtn")}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.registerLink} onPress={() => router.push("/register")}>
          <Text style={styles.registerText}>{t("login.registerPrompt")}<Text style={{ color: "#FF2C2C", fontWeight: "700" }}>{t("login.registerLink")}</Text></Text>
        </TouchableOpacity>
      </View>
      </DismissKeyboard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  // ScrollView content: centers the card vertically when there is room, and
  // becomes scrollable when the keyboard pushes the card up so the focused
  // input is always reachable. flexGrow:1 is what makes the centering work.
  scrollContent: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  card: { width: "100%", maxWidth: 400, backgroundColor: "#fff", borderRadius: 16, padding: 32, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  toggleRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 4 },
  logo: { width: 240, height: 48, alignSelf: "center", marginBottom: 4 },
  // Fixed lineHeight / height values below keep the layout identical in English
  // and Telugu — Telugu glyphs are taller, so without these the card resizes.
  title: { fontSize: 24, lineHeight: 32, fontWeight: "800", color: "#111", textAlign: "center", marginTop: 4, paddingTop: 14 },
  subtitle: { fontSize: 13, lineHeight: 20, color: "#888", textAlign: "center", marginBottom: 24 },
  input: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, height: 52, paddingHorizontal: 14, fontSize: 15, marginBottom: 12, backgroundColor: "#fafafa" },
  inputError: { borderColor: "#dc2626" },
  passwordField: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, height: 52, marginBottom: 12, backgroundColor: "#fafafa" },
  passwordInput: { flex: 1, height: "100%", paddingHorizontal: 14, fontSize: 15 },
  eyeButton: { height: "100%", paddingHorizontal: 12, justifyContent: "center" },
  forgotLink: { alignSelf: "flex-end", marginBottom: 14, marginTop: -2 },
  forgotText: { fontSize: 13, lineHeight: 18, color: "#FF2C2C", fontWeight: "600" },
  button: { backgroundColor: "#FF2C2C", borderRadius: 10, height: 54, alignItems: "center", justifyContent: "center", marginTop: 4 },
  buttonDisabled: { backgroundColor: "#999" },
  buttonText: { color: "#fff", fontSize: 16, lineHeight: 26, fontWeight: "700" },
  registerLink: { marginTop: 20, alignItems: "center" },
  registerText: { fontSize: 13, lineHeight: 20, color: "#888" },
});
