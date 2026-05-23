import React from "react";
import { Stack } from "expo-router";
import { LanguageProvider } from "../src/i18n";

// The (tabs) group owns its own shared header (see app/(tabs)/_layout.tsx),
// so it stays headerless here. register / new-article are pushed screens and
// keep a native back header.
export default function RootLayout() {
  return (
    <LanguageProvider>
      <Stack screenOptions={{ headerShown: false, headerBackButtonDisplayMode: "minimal", headerBackTitle: "" }}>
        <Stack.Screen name="register" options={{ headerShown: true, title: "Register", headerTintColor: "#FF2C2C" }} />
        <Stack.Screen name="new-article" options={{ headerShown: true, title: "New Article", headerTintColor: "#FF2C2C" }} />
      </Stack>
    </LanguageProvider>
  );
}
