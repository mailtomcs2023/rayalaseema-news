import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, Alert, KeyboardAvoidingView, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_URL = __DEV__ ? "http://10.0.2.2:3001" : "https://admin.rayalaseemaexpress.com";

export function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) return Alert.alert("Error", "Email and password required");
    setLoading(true);

    try {
      // Get CSRF token
      const csrfRes = await fetch(`${API_URL}/api/auth/csrf`);
      const { csrfToken } = await csrfRes.json();

      // Login
      const res = await fetch(`${API_URL}/api/auth/callback/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `csrfToken=${csrfToken}&email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
        redirect: "manual",
      });

      // Get session
      const sessionRes = await fetch(`${API_URL}/api/auth/session`);
      const session = await sessionRes.json();

      if (session?.user) {
        await AsyncStorage.setItem("user", JSON.stringify(session.user));
        await AsyncStorage.setItem("auth-token", "session-active");
        navigation.reset({ index: 0, routes: [{ name: "Main" }] });
      } else {
        Alert.alert("Login Failed", "Invalid email or password");
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.card}>
        <Image source={require("../../assets/logo.png")} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>RE Reporter</Text>
        <Text style={styles.subtitle}>రాయలసీమ ఎక్స్‌ప్రెస్ జర్నలిస్ట్ యాప్</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleLogin} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? "Logging in..." : "Login"}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.registerLink} onPress={() => navigation.navigate("Register")}>
          <Text style={styles.registerText}>New journalist? <Text style={{ color: "#FF2C2C", fontWeight: "700" }}>Register here</Text></Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f3f4f6", padding: 20 },
  card: { width: "100%", maxWidth: 400, backgroundColor: "#fff", borderRadius: 16, padding: 32, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 8 },
  logo: { width: 240, height: 48, alignSelf: "center", marginBottom: 4 },
  title: { fontSize: 24, fontWeight: "800", color: "#111", textAlign: "center", marginTop: 4 },
  subtitle: { fontSize: 13, color: "#888", textAlign: "center", marginBottom: 24 },
  input: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 14, fontSize: 15, marginBottom: 12, backgroundColor: "#fafafa" },
  button: { backgroundColor: "#FF2C2C", borderRadius: 10, padding: 16, alignItems: "center", marginTop: 4 },
  buttonDisabled: { backgroundColor: "#999" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  registerLink: { marginTop: 20, alignItems: "center" },
  registerText: { fontSize: 13, color: "#888" },
});
