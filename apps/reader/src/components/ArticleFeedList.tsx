import React, { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  StyleSheet,
  ListRenderItemInfo,
} from "react-native";
import { useRouter } from "expo-router";
import type { Article } from "../api/client";
import { useFeed } from "../lib/use-feed";
import { useBookmarks } from "../lib/bookmarks";
import { setReaderFeed } from "../lib/feed-store";
import { useT } from "../i18n";
import { colors, spacing } from "../theme";
import NewsCard from "./NewsCard";

// Imperative handle the feed/category tab uses to jump back to the top and pull
// fresh news when its tab is re-pressed.
export interface ArticleFeedListHandle {
  scrollToTopAndRefresh: () => void;
}

// The scrollable short-news list. Reused by the feed tab and by each category
// page. `header` is rendered as the sticky-able list header (the feed tab puts
// its category chips there).
const ArticleFeedList = forwardRef<
  ArticleFeedListHandle,
  { category: string | null; header?: React.ReactElement }
>(function ArticleFeedList({ category, header }, ref) {
  const { t } = useT();
  const router = useRouter();
  const feed = useFeed(category);
  const { isSaved, toggle } = useBookmarks();
  const listRef = useRef<FlatList<Article>>(null);

  // Exposed to the parent tab screen: scroll to the top, then refetch page 0.
  // Scrolling first so the user sees the jump immediately while the new data
  // loads behind the refresh spinner.
  useImperativeHandle(ref, () => ({
    scrollToTopAndRefresh() {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      feed.refresh();
    },
  }), [feed]);

  const openReader = useCallback(
    (index: number) => {
      // Hand the already-loaded list to the swipe reader so it opens instantly
      // on the tapped story, then navigate.
      setReaderFeed(feed.articles, index);
      router.push("/reader");
    },
    [feed.articles, router],
  );

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Article>) => (
      <NewsCard
        article={item}
        saved={isSaved(item.id)}
        onToggleSave={() => toggle(item)}
        onPress={() => openReader(index)}
      />
    ),
    [isSaved, toggle, openReader],
  );

  if (feed.loading) {
    return (
      <View style={styles.center}>
        {header}
        <View style={styles.centerInner}>
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.muted}>{t("feed.loading")}</Text>
        </View>
      </View>
    );
  }

  if (feed.error && feed.articles.length === 0) {
    return (
      <View style={styles.center}>
        {header}
        <View style={styles.centerInner}>
          <Text style={styles.errorTitle}>{t("feed.error")}</Text>
          <Text style={styles.muted}>{feed.error}</Text>
          <Pressable style={styles.retryBtn} onPress={feed.retry}>
            <Text style={styles.retryText}>{t("feed.retry")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <FlatList
      ref={listRef}
      data={feed.articles}
      keyExtractor={(a) => a.id}
      renderItem={renderItem}
      ListHeaderComponent={header}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      onEndReachedThreshold={0.6}
      onEndReached={feed.loadMore}
      refreshControl={
        <RefreshControl
          refreshing={feed.refreshing}
          onRefresh={feed.refresh}
          colors={[colors.brand]}
          tintColor={colors.brand}
        />
      }
      ListEmptyComponent={
        <View style={styles.centerInner}>
          <Text style={styles.muted}>{t("feed.empty")}</Text>
        </View>
      }
      ListFooterComponent={
        feed.loadingMore ? (
          <ActivityIndicator color={colors.brand} style={{ marginVertical: spacing.lg }} />
        ) : feed.articles.length > 0 && !feed.hasMore ? (
          <Text style={styles.endText}>{t("feed.end")}</Text>
        ) : null
      }
    />
  );
});

export default ArticleFeedList;

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg },
  centerInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm,
    minHeight: 240,
  },
  listContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    backgroundColor: colors.bg,
    flexGrow: 1,
  },
  muted: { color: colors.textMuted, fontSize: 14, textAlign: "center" },
  errorTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  retryBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 999,
  },
  retryText: { color: "#FFFFFF", fontWeight: "700" },
  endText: {
    textAlign: "center",
    color: colors.textFaint,
    fontSize: 13,
    paddingVertical: spacing.xl,
  },
});
