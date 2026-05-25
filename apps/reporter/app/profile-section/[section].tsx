import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useT } from "../../src/i18n";
import { ProfileSectionView } from "../../src/screens/profile/SectionView";
import { SECTIONS } from "../../src/screens/profile/meta";

// Dynamic profile-section page. The slug (e.g. "personal", "kyc") maps to
// a SECTIONS entry which defines the title and the list of fields to show.
//
// Uses expo-router's <Stack.Screen> child pattern (not navigation.setOptions
// in an effect) so the title is set synchronously with render and the
// auto-injected back button isn't dropped by an option merge race.
export default function ProfileSectionRoute() {
  const { t } = useT();
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section: string }>();
  const def = section ? SECTIONS[section] : undefined;
  const title = def ? t(`profile.${def.titleKey}`) : "Unknown";

  const headerLeft = () => (
    <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={{ paddingHorizontal: 4 }}>
      <Ionicons name="chevron-back" size={26} color="#FF2C2C" />
    </TouchableOpacity>
  );

  if (!def) {
    return (
      <View style={styles.empty}>
        <Stack.Screen options={{ title, headerLeft }} />
        <Text style={styles.emptyText}>Unknown section</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title, headerLeft }} />
      <ProfileSectionView fields={def.fields} />
    </>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f3f4f6" },
  emptyText: { color: "#aaa", fontSize: 14 },
});
