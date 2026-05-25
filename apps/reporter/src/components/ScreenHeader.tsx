import React from "react";
import { View, StyleSheet } from "react-native";

import { LanguageToggle } from "./LanguageToggle";
// SVG wordmark designed for dark backgrounds (the asset is already white-on-
// transparent, so no tinting is needed). Imported as a React component via
// react-native-svg-transformer — see metro.config.js.
import LogoInverse from "../../assets/logo-inverse.svg";

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
        <LogoInverse
          width={140}
          height={28}
          accessibilityLabel="Rayalaseema Express"
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
});
