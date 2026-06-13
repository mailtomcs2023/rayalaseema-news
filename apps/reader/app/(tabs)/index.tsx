import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { fetchCategories, type Category } from "../../src/api/client";
import ScreenHeader from "../../src/components/ScreenHeader";
import CategoryChips from "../../src/components/CategoryChips";
import ArticleFeedList, {
  type ArticleFeedListHandle,
} from "../../src/components/ArticleFeedList";
import { useTabPress } from "../../src/lib/use-tab-press";
import { colors } from "../../src/theme";

// Home / News tab: the brand bar, a row of category filter chips, and the
// short-news feed for the selected filter.
export default function FeedScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const feedRef = useRef<ArticleFeedListHandle>(null);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => {});
  }, []);

  // Re-tapping the News tab jumps to the top and pulls fresh news.
  useTabPress(useCallback(() => feedRef.current?.scrollToTopAndRefresh(), []));

  return (
    <View style={styles.screen}>
      <ScreenHeader />
      <CategoryChips categories={categories} active={active} onChange={setActive} />
      {/* key forces a fresh list (resets scroll + pagination) when the filter
          changes, instead of animating stale rows out. */}
      <ArticleFeedList ref={feedRef} key={active ?? "__all"} category={active} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
});
