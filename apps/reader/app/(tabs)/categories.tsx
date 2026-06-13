import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { fetchCategories, type Category } from "../../src/api/client";
import ScreenHeader from "../../src/components/ScreenHeader";
import { useTabPress } from "../../src/lib/use-tab-press";
import { Ionicons } from "@expo/vector-icons";
import { useT } from "../../src/i18n";
import { categoryLabel } from "../../src/lib/format";
import { colors, radius, spacing, withAlpha } from "../../src/theme";

// Two-column grid of all sections. Tapping one opens a filtered feed page.
export default function CategoriesScreen() {
  const { lang } = useT();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const listRef = useRef<FlatList<Category>>(null);

  const load = useCallback(() => {
    fetchCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Re-tapping the Sections tab jumps to the top and reloads the section list.
  useTabPress(
    useCallback(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      load();
    }, [load]),
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader />
      <FlatList
        ref={listRef}
        data={categories}
        keyExtractor={(c) => c.id}
        numColumns={2}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={{ gap: spacing.md }}
        renderItem={({ item }) => {
          const accent = item.color || colors.brand;
          const label = categoryLabel(item, lang);
          return (
            <Pressable
              style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
              onPress={() =>
                router.push({ pathname: "/category/[slug]", params: { slug: item.slug } })
              }
              android_ripple={{ color: withAlpha(accent, 0.12) }}
            >
              {/* Coloured accent strip down the left edge. */}
              <View style={[styles.accentStrip, { backgroundColor: accent }]} />
              <View style={styles.tileTop}>
                <View style={[styles.badge, { backgroundColor: withAlpha(accent, 0.14) }]}>
                  <Text style={[styles.badgeText, { color: accent }]}>
                    {label.trim().charAt(0)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
              </View>
              <Text style={styles.tileText} numberOfLines={2}>
                {label}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  grid: {
    padding: spacing.lg,
    gap: spacing.md,
    // Clear the floating native tab bar + give the last row breathing room.
    paddingBottom: 120,
  },
  tile: {
    flex: 1,
    minHeight: 120,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    justifyContent: "space-between",
    overflow: "hidden",
    // Subtle elevation so the cards lift off the page.
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tilePressed: { backgroundColor: colors.bgMuted },
  accentStrip: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  tileTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 20, fontWeight: "800" },
  tileText: { fontSize: 15, fontWeight: "700", color: colors.text, lineHeight: 21 },
});
