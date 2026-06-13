import React, { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { NativeTabs, Icon, Label, VectorIcon } from "expo-router/unstable-native-tabs";
import { useSegments } from "expo-router";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useT } from "../../src/i18n";

// NativeTabs doesn't expose a per-trigger onPress (the native tab bar
// dispatches JUMP_TO internally) - so we approximate "tab clicked" by watching
// the focused (tabs) segment and firing a selection haptic when it changes.
// The first-render guard prevents a spurious haptic on cold start.
function useTabPressHaptics() {
  const segments = useSegments();
  const activeTab = segments[segments.length - 1] ?? "";
  const prevTab = useRef<string | null>(null);
  useEffect(() => {
    if (prevTab.current === null) {
      prevTab.current = activeTab;
      return;
    }
    if (prevTab.current !== activeTab) {
      Haptics.selectionAsync().catch(() => {});
      prevTab.current = activeTab;
    }
  }, [activeTab]);
}

// Native bottom tab bar - iOS keeps its liquid-glass material + SF Symbols,
// Android gets Material 3 with the equivalent Ionicons. NativeTabs must be the
// route's top-level content (nesting hides the native bar), so each tab screen
// renders its own BrandHeader instead.
//
// Icon props use the CrossPlatformIconCombination: `sf` is iOS-only (the
// liquid-glass SF Symbols), `androidSrc` provides the Android equivalent via
// VectorIcon. Without androidSrc the Android tab bar shows no icons.
export default function TabsLayout() {
  const { t } = useT();
  useTabPressHaptics();
  return (
    <NativeTabs
      tintColor="#FF2C2C"
      labelVisibilityMode="labeled"
      // Force pure white on Android (M3 otherwise tints the bar slightly
      // purple via surfaceContainer). iOS keeps its native liquid-glass.
      backgroundColor={Platform.OS === "android" ? "#FFFFFF" : undefined}
      // Tint the M3 active-pill + ripple on-brand so the Android selection
      // animation reads as intentional red instead of a purple blink. Both
      // props are Android-only and no-ops on iOS.
      indicatorColor="rgba(255, 44, 44, 0.10)"
      rippleColor="rgba(255, 44, 44, 0.10)"
    >
      <NativeTabs.Trigger name="index">
        <Icon sf="newspaper.fill" androidSrc={<VectorIcon family={Ionicons} name="newspaper" />} />
        <Label>{t("tabs.feed")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="categories">
        <Icon sf="square.grid.2x2.fill" androidSrc={<VectorIcon family={Ionicons} name="grid" />} />
        <Label>{t("tabs.categories")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="saved">
        <Icon sf="bookmark.fill" androidSrc={<VectorIcon family={Ionicons} name="bookmark" />} />
        <Label>{t("tabs.saved")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Icon sf="gearshape.fill" androidSrc={<VectorIcon family={Ionicons} name="settings" />} />
        <Label>{t("tabs.settings")}</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
