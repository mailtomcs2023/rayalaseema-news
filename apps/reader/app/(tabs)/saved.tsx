import React, { useCallback, useMemo, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, ListRenderItemInfo } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { Article, Category } from "../../src/api/client";
import ScreenHeader from "../../src/components/ScreenHeader";
import SavedCard from "../../src/components/SavedCard";
import SectionFilterSheet from "../../src/components/SectionFilterSheet";
import { useBookmarks } from "../../src/lib/bookmarks";
import { setReaderFeed } from "../../src/lib/feed-store";
import { useT } from "../../src/i18n";
import { colors, spacing } from "../../src/theme";

// Locally-saved stories. Horizontal cards (image left, heading + description
// right) plus a FAB that opens a section filter sheet.
export default function SavedScreen() {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { items, isSaved, toggle } = useBookmarks();

  const [sectionFilter, setSectionFilter] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // The distinct sections present among saved stories, in first-seen order -
  // that's all the filter ever needs to offer.
  const sections = useMemo<Category[]>(() => {
    const seen = new Set<string>();
    const out: Category[] = [];
    for (const a of items) {
      if (a.category && !seen.has(a.category.slug)) {
        seen.add(a.category.slug);
        out.push(a.category);
      }
    }
    return out;
  }, [items]);

  // If the active section is no longer present (last story in it removed),
  // fall back to "all" so the list never shows an empty filtered view forever.
  const effectiveFilter =
    sectionFilter && sections.some((s) => s.slug === sectionFilter) ? sectionFilter : null;

  const visible = useMemo(
    () =>
      effectiveFilter
        ? items.filter((a) => a.category?.slug === effectiveFilter)
        : items,
    [items, effectiveFilter],
  );

  const openReader = useCallback(
    (index: number) => {
      setReaderFeed(visible, index);
      router.push("/reader");
    },
    [visible, router],
  );

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Article>) => (
      <SavedCard
        article={item}
        saved={isSaved(item.id)}
        onToggleSave={() => toggle(item)}
        onPress={() => openReader(index)}
      />
    ),
    [isSaved, toggle, openReader],
  );

  const filterActive = effectiveFilter !== null;

  return (
    <View style={styles.screen}>
      <ScreenHeader />

      <FlatList
        data={visible}
        keyExtractor={(a) => a.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="bookmark-outline" size={48} color={colors.textFaint} />
            <Text style={styles.emptyTitle}>
              {items.length === 0 ? t("saved.empty") : t("saved.noneInSection")}
            </Text>
            <Text style={styles.emptyHint}>{t("saved.hint")}</Text>
          </View>
        }
      />

      {/* FAB - shown whenever saved stories have at least one section, so the
          filter is discoverable on both iOS and Android. */}
      {sections.length >= 1 ? (
        <Pressable
          style={[styles.fab, { bottom: insets.bottom + 96 }, filterActive && styles.fabActive]}
          onPress={() => setSheetOpen(true)}
        >
          <Ionicons name="funnel" size={20} color="#FFFFFF" />
          {filterActive ? <View style={styles.fabDot} /> : null}
        </Pressable>
      ) : null}

      <SectionFilterSheet
        visible={sheetOpen}
        sections={sections}
        active={effectiveFilter}
        onSelect={(slug) => {
          setSectionFilter(slug);
          setSheetOpen(false);
        }}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { paddingTop: spacing.md, paddingBottom: 120, flexGrow: 1 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm,
    minHeight: 320,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.text, textAlign: "center" },
  emptyHint: { fontSize: 14, color: colors.textMuted, textAlign: "center" },
  fab: {
    position: "absolute",
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabActive: { backgroundColor: colors.brandDark },
  fabDot: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: colors.brand,
  },
});
