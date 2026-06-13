import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Constants from "expo-constants";
import ScreenHeader from "../../src/components/ScreenHeader";
import { useT } from "../../src/i18n";
import { LANGUAGE_NAMES, type Lang } from "../../src/i18n/translations";
import { colors, radius, spacing } from "../../src/theme";

const LANGS: Lang[] = ["te", "en"];

export default function SettingsScreen() {
  const { t, lang, setLang } = useT();
  const version = Constants.expoConfig?.version ?? "1.0.0";

  return (
    <View style={styles.screen}>
      <ScreenHeader />
      <View style={styles.body}>
        <Text style={styles.sectionLabel}>{t("settings.language")}</Text>
        <View style={styles.segment}>
          {LANGS.map((l) => {
            const active = lang === l;
            return (
              <Pressable
                key={l}
                style={[styles.segBtn, active && styles.segBtnActive]}
                onPress={() => setLang(l)}
              >
                <Text style={[styles.segText, active && styles.segTextActive]}>
                  {LANGUAGE_NAMES[l]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>{t("settings.version")}</Text>
          <Text style={styles.aboutValue}>{version}</Text>
        </View>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>{t("settings.about")}</Text>
          <Text style={styles.aboutValue}>{t("appName")}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { padding: spacing.lg, gap: spacing.md },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.bgMuted,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  segBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    alignItems: "center",
  },
  segBtnActive: { backgroundColor: colors.brand },
  segText: { fontSize: 15, fontWeight: "700", color: colors.textMuted },
  segTextActive: { color: "#FFFFFF" },
  aboutRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  aboutLabel: { fontSize: 15, color: colors.text },
  aboutValue: { fontSize: 15, color: colors.textMuted },
});
