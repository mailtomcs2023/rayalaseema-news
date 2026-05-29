import React from "react";
import { TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useT } from "../src/i18n";
import { ProfilePasswordView } from "../src/screens/profile/PasswordView";

// "Change Password" detail screen - wraps the shared view with a localised
// title and an explicit back button.
//
// `?forced=1` is the auth-gate's signal that the reporter logged in with a
// temporary password and isn't allowed to leave until they replace it. In
// that mode we strip the back button and let the view itself show the
// forced banner + handle post-success navigation.
export default function ProfilePasswordRoute() {
  const { t } = useT();
  const router = useRouter();
  const { forced } = useLocalSearchParams<{ forced?: string }>();
  const isForced = forced === "1";
  return (
    <>
      <Stack.Screen
        options={{
          title: t("profile.changePassword"),
          headerLeft: isForced
            ? () => null
            : () => (
                <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={{ paddingHorizontal: 4 }}>
                  <Ionicons name="chevron-back" size={26} color="#FF2C2C" />
                </TouchableOpacity>
              ),
          gestureEnabled: !isForced,
        }}
      />
      <ProfilePasswordView forced={isForced} />
    </>
  );
}
