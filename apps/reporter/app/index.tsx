import React, { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Auth gate - the first route. Sends a logged-in reporter to the tabs,
// everyone else to login.
//
// One-shot KYC nudge (mirrors the admin web flow):
//   - Brand-new reporter with kycStatus === "PENDING" gets redirected
//     to /kyc on their FIRST landing after login.
//   - The "kyc_nudge_seen" flag in AsyncStorage prevents re-nudging on
//     subsequent app opens - they've already seen the upload screen and
//     can navigate to it from the KYC banner whenever they want.
//   - SUBMITTED / REJECTED / VERIFIED users skip the nudge - SUBMITTED
//     means they've already engaged with the flow, REJECTED has its
//     own re-submit CTA in the banner, VERIFIED is done.
const KYC_NUDGE_KEY = "kyc_nudge_seen";

export default function Index() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    console.log("[auth-gate] index.tsx mounted, reading AsyncStorage…");
    (async () => {
      try {
        const u = await AsyncStorage.getItem("user");
        if (!u) {
          console.log("[auth-gate] no user → /login");
          setTarget("/login");
          return;
        }
        const parsed = JSON.parse(u) as {
          kycStatus?: string;
          mustChangePassword?: boolean;
          registrationComplete?: boolean;
        };
        // Forced password change wins over the KYC nudge. Admin-issued temp
        // password (or seed-flagged account) must be replaced before the
        // reporter does anything else. `?forced=1` tells the password screen
        // to hide its back button and show the forced-mode banner.
        if (parsed?.mustChangePassword) {
          console.log("[auth-gate] mustChangePassword → /profile-password?forced=1");
          setTarget("/profile-password?forced=1");
          return;
        }
        const nudged = await AsyncStorage.getItem(KYC_NUDGE_KEY);
        if (parsed?.kycStatus === "PENDING" && nudged !== "1") {
          // Admin-created reporters (registrationComplete === false) need
          // to fill in their own details first - jump them to the full
          // 3-step finish flow instead of the docs-only KYC screen. Same
          // one-shot nudge key covers both: once the reporter has seen
          // either screen once, the banner on Home becomes the entry
          // point from then on.
          const dest = parsed?.registrationComplete === false ? "/complete-registration" : "/kyc";
          console.log("[auth-gate] PENDING + un-nudged →", dest);
          await AsyncStorage.setItem(KYC_NUDGE_KEY, "1");
          setTarget(dest);
          return;
        }
        console.log("[auth-gate] user present → /home (kyc:", parsed?.kycStatus, ")");
        setTarget("/home");
      } catch (err) {
        console.log("[auth-gate] AsyncStorage error:", err, "→ /login");
        setTarget("/login");
      }
    })();
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
