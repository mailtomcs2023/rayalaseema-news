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
        {/* In-app KYC upload — opened from the KycBanner CTA when the reporter
            has PENDING or REJECTED status. */}
        <Stack.Screen name="kyc" options={{ headerShown: true, title: "KYC Documents", headerTintColor: "#FF2C2C" }} />
        {/* Profile detail screens — pushed from the Profile tab landing. The
            section page sets its own dynamic title in useLayoutEffect. */}
        <Stack.Screen name="profile-section/[section]" options={{ headerShown: true, title: "", headerTintColor: "#FF2C2C" }} />
        <Stack.Screen name="profile-pending" options={{ headerShown: true, title: "Pending Changes", headerTintColor: "#FF2C2C" }} />
        <Stack.Screen name="profile-password" options={{ headerShown: true, title: "Change Password", headerTintColor: "#FF2C2C" }} />
      </Stack>
    </LanguageProvider>
  );
}
