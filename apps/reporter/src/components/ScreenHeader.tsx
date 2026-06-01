import React from "react";
import { View, StyleSheet, Image } from "react-native";

import { LanguageToggle } from "./LanguageToggle";

// White-on-transparent wordmark, rasterised at 4× the rendered size so it
// stays crisp on xxxhdpi screens. Source SVG was 2.2 MB (embedded font); the
// PNG is ~14 KB. Re-render via scripts/rasterize-logo.mjs if the SVG returns.
const logoInverse = require("../../assets/logo-inverse.png");

/**
 * The shared header shown at the top of every tab screen.
 *
 * Every tab renders this exact same fixed-size component, so the header is
 * pixel-identical across tabs and never shifts (jiggles) when you switch
 * tabs. Shows the brand logo on the left and the language toggle on the
 * right; the bottom tab bar already indicates the current tab.
 */
export function ScreenHeader() {
  return (
    <View style={styles.header}>
      <View style={styles.row}>
        <Image
          source={logoInverse}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Rayalaseema News"
        />
        <LanguageToggle onDark />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: "#FF2C2C",
    paddingTop: 56,
    paddingBottom: 10,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 36 },
  logo: { width: 140, height: 28 },
});
