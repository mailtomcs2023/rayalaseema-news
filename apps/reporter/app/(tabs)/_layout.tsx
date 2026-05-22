import React from "react";
import { NativeTabs, Icon, Label } from "expo-router/unstable-native-tabs";
import { useT } from "../../src/i18n";

// Native bottom tab bar. NativeTabs must be the route's top-level content —
// nesting it under any sibling view hides the native tab bar — so the shared
// header is rendered inside each tab screen instead (see ScreenHeader).
export default function TabsLayout() {
  const { t } = useT();
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="home">
        <Icon sf="house.fill" />
        <Label>{t("nav.home")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="articles">
        <Icon sf="newspaper.fill" />
        <Label>{t("nav.articles")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="earnings">
        <Icon sf="creditcard.fill" />
        <Label>{t("dashboard.earnings")}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf="person.fill" />
        <Label>{t("dashboard.profile")}</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
