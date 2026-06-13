import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { fetchCategories, type Category } from "../../src/api/client";
import ArticleFeedList from "../../src/components/ArticleFeedList";
import { useT } from "../../src/i18n";
import { categoryLabel } from "../../src/lib/format";
import { colors, spacing } from "../../src/theme";

// Filtered feed for a single section, reached from the Categories grid. Same
// list component as the home feed, just pinned to one category slug.
export default function CategoryFeedScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { lang } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<Category | null>(null);

  useEffect(() => {
    fetchCategories()
      .then((cats) => setCategory(cats.find((c) => c.slug === slug) ?? null))
      .catch(() => {});
  }, [slug]);

  return (
    <View style={styles.screen}>
      <View style={[styles.bar, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {category ? categoryLabel(category, lang) : ""}
        </Text>
      </View>
      <ArticleFeedList category={slug} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  back: { padding: 2 },
  title: { color: "#FFFFFF", fontSize: 19, fontWeight: "800", flex: 1 },
});
