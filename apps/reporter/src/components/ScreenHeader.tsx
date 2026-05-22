import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { useT } from "../i18n";
import { LanguageToggle } from "./LanguageToggle";

/**
 * The shared header shown at the top of every tab screen.
 *
 * Every tab renders this exact same fixed-size component, so the header is
 * pixel-identical across tabs and never shifts (jiggles) when you switch
 * tabs. It always shows the app name; the bottom tab bar already indicates
 * the current tab.
 */
export function ScreenHeader() {
  const { t } = useT();
  return (
    <View style={styles.header}>
      <View style={styles.row}>
        <Text style={styles.title} numberOfLines={1}>
          {t("login.appName")}
        </Text>
        <LanguageToggle onDark />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: "#FF2C2C",
    paddingTop: 54,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8, height: 44 },
  title: { flex: 1, fontSize: 18, lineHeight: 24, fontWeight: "800", color: "#fff" },
});
