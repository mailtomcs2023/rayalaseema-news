import React, { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Auth gate - the first route. Sends a logged-in reporter to the tabs,
// everyone else to login.
export default function Index() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    console.log("[auth-gate] index.tsx mounted, reading AsyncStorage…");
    AsyncStorage.getItem("user")
      .then((u) => {
        console.log("[auth-gate] user =", u ? "present" : "absent", "→ routing to", u ? "/home" : "/login");
        setTarget(u ? "/home" : "/login");
      })
      .catch((err) => {
        console.log("[auth-gate] AsyncStorage error:", err, "→ /login");
        setTarget("/login");
      });
  }, []);

  if (!target) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FF2C2C" }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }
  return <Redirect href={target as any} />;
}
