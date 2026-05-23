import React from "react";
import { View, Image, StyleSheet } from "react-native";

import { LanguageToggle } from "./LanguageToggle";

// Logo asset is red-on-transparent; we tint it white so it sits on the red
// header bar (the asset is the only logo file checked in, so re-using it
// keeps the brand mark consistent with the splash/icon).
const LOGO = require("../../assets/logo.png");

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
          source={LOGO}
          style={styles.logo}
          resizeMode="contain"
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
  // 5:1 wordmark (PNG is 1200×240); width matches the natural aspect at
  // height 28 so contain-resize leaves no padding on either side.
  // Tinted white to read on the red header.
  logo: { width: 140, height: 28, tintColor: "#fff" },
});
