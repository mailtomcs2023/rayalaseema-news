import React from "react";
import { Platform } from "react-native";
import { NativeTabs, Icon, Label, VectorIcon } from "expo-router/unstable-native-tabs";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useT } from "../../src/i18n";

// Native bottom tab bar. NativeTabs must be the route's top-level content -
// nesting it under any sibling view hides the native tab bar - so the shared
// header is rendered inside each tab screen instead (see ScreenHeader).
//
// Icon props use the CrossPlatformIconCombination: `sf` is iOS-only (keeps
// the liquid-glass SF Symbols), `androidSrc` provides the Android equivalent
// - Ionicons rendered at the right size via VectorIcon. Without androidSrc
// the Android tab bar showed no icons because SF Symbols don't exist there.
export default function TabsLayout() {
  const { t } = useT();
  return (
    <NativeTabs
      tintColor="#FF2C2C"
      labelVisibilityMode="labeled"
      // Android's Material 3 default tints the tab bar with the surfaceContainer
      // colour (white + a primary overlay → looks slightly purple). Force pure
      // white on Android only; iOS keeps its native liquid-glass material.
      backgroundColor={Platform.OS === "android" ? "#FFFFFF" : undefined}
      // Material 3 always renders an indicator pill behind the active tab on
      // Android - trying to hide it (transparent, white-on-white) still runs
      // the M3 selection animation, which read as a one-frame purple blink
      // on every tab switch. Instead, tint it to a subtle on-brand red so
      // the pill is intentional and matches the active icon. Same idea for
      // the press ripple. Both props are Android-only and no-ops on iOS.
      indicatorColor="rgba(255, 44, 44, 0.10)"
      rippleColor="rgba(255, 44, 44, 0.10)"
    >
      <NativeTabs.Trigger name="home">
        <Icon sf="house.fill" androidSrc={<VectorIcon family={Ionicons} name="home" />} />
        <Label>{t("nav.home")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="articles">
        <Icon sf="newspaper.fill" androidSrc={<VectorIcon family={Ionicons} name="newspaper" />} />
        <Label>{t("nav.articles")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="earnings">
        <Icon sf="creditcard.fill" androidSrc={<VectorIcon family={Ionicons} name="card" />} />
        <Label>{t("dashboard.earnings")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf="person.fill" androidSrc={<VectorIcon family={Ionicons} name="person" />} />
        <Label>{t("dashboard.profile")}</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
