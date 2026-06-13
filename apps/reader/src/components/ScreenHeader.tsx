import React from "react";
import { View, StyleSheet, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LanguageToggle } from "./LanguageToggle";

// White-on-transparent wordmark (same asset the reporter app ships).
const logoInverse = require("../../assets/logo-inverse.png");

/**
 * The shared header shown at the top of every tab screen - identical to the
 * reporter app's ScreenHeader so both apps feel like one product. Brand logo
 * on the left, language toggle on the right; the native bottom tab bar already
 * indicates the current tab, so no per-screen title is needed.
 */
export default function ScreenHeader() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.row}>
        <Image
          source={logoInverse}
          // The asset is a grey wordmark; tintColor recolours every non-
          // transparent pixel to pure white so it reads cleanly on the red bar.
          style={styles.logo}
          tintColor="#FFFFFF"
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
    paddingBottom: 10,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 36,
  },
  logo: { width: 140, height: 28 },
});
