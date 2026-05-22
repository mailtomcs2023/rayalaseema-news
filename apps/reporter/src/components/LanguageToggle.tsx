import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { useT, LANGUAGE_NAMES, type Lang } from "../i18n";

const BRAND = "#FF2C2C";
const SEGMENTS: { code: Lang; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "te", label: "తె" },
];

// Compact English/Telugu language switcher. Pass onDark when placing it on a
// coloured header (e.g. the dashboard's red bar).
export function LanguageToggle({ onDark = false }: { onDark?: boolean }) {
  const { lang, setLang, t } = useT();

  // Tapping a language buzzes, then confirms the switch — the prompt reassures
  // the reporter the app stays bilingual and the choice can be changed anytime.
  const handlePress = (code: Lang) => {
    Haptics.selectionAsync();
    if (code === lang) return;
    Alert.alert(
      t("toggle.title"),
      t("toggle.message", { lang: LANGUAGE_NAMES[code] }),
      [
        { text: t("toggle.cancel"), style: "cancel" },
        {
          text: t("toggle.confirm"),
          onPress: () => {
            setLang(code);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.wrap, onDark ? styles.wrapDark : styles.wrapLight]}>
      {SEGMENTS.map(({ code, label }) => {
        const active = lang === code;
        return (
          <TouchableOpacity
            key={code}
            onPress={() => handlePress(code)}
            accessibilityRole="button"
            accessibilityLabel={`Switch to ${code === "en" ? "English" : "Telugu"}`}
            style={[
              styles.segment,
              active && (onDark ? styles.segmentActiveDark : styles.segmentActiveLight),
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                {
                  color: active
                    ? onDark
                      ? BRAND
                      : "#fff"
                    : onDark
                      ? "#fff"
                      : "#666",
                },
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", borderRadius: 14, padding: 2 },
  wrapLight: { backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb" },
  wrapDark: { backgroundColor: "rgba(255,255,255,0.2)" },
  segment: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  segmentActiveLight: { backgroundColor: BRAND },
  segmentActiveDark: { backgroundColor: "#fff" },
  segmentText: { fontSize: 12, fontWeight: "700" },
});
