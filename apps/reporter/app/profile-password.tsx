import React from "react";
import { TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useT } from "../src/i18n";
import { ProfilePasswordView } from "../src/screens/profile/PasswordView";

// "Change Password" detail screen - wraps the shared view with a localised
// title and an explicit back button.
export default function ProfilePasswordRoute() {
  const { t } = useT();
  const router = useRouter();
  return (
    <>
      <Stack.Screen
        options={{
          title: t("profile.changePassword"),
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={{ paddingHorizontal: 4 }}>
              <Ionicons name="chevron-back" size={26} color="#FF2C2C" />
            </TouchableOpacity>
          ),
        }}
      />
      <ProfilePasswordView />
    </>
  );
}
