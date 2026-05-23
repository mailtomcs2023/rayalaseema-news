import React, { useLayoutEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useT } from "../../src/i18n";
import { ProfileSectionView } from "../../src/screens/profile/SectionView";
import { SECTIONS } from "../../src/screens/profile/meta";

// Dynamic profile-section page. The slug (e.g. "personal", "kyc") maps to
// a SECTIONS entry which defines the title and the list of fields to show.
export default function ProfileSectionRoute() {
  const { t } = useT();
  const { section } = useLocalSearchParams<{ section: string }>();
  const navigation = useNavigation();
  const def = section ? SECTIONS[section] : undefined;

  // Set the native stack header title to the section's localised name.
  useLayoutEffect(() => {
    if (def) navigation.setOptions({ title: t(`profile.${def.titleKey}`) });
  }, [navigation, def, t]);

  if (!def) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Unknown section</Text>
      </View>
    );
  }

  return <ProfileSectionView fields={def.fields} />;
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f3f4f6" },
  emptyText: { color: "#aaa", fontSize: 14 },
});
