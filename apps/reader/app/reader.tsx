import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { fetchArticles, type Article } from "../src/api/client";
import { takeReaderFeed, type ReaderPagination } from "../src/lib/feed-store";
import { useBookmarks } from "../src/lib/bookmarks";
import { useT } from "../src/i18n";
import ReaderCard from "../src/components/ReaderCard";
import FlipPager from "../src/components/FlipPager";
import { colors, spacing } from "../src/theme";

// Full-screen, horizontally-paged news reader. Reads the list + start index
// handed over by the feed via the module store, snaps one story per screen, and
// lets the user swipe left/right (right-to-left = next, left-to-right = previous)
// through them like turning pages.
export default function ReaderScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { height, width } = useWindowDimensions();
  const { isSaved, toggle } = useBookmarks();

  // Snapshot the handed-over feed once on mount. If it's empty (e.g. the route
  // was reached cold without going through the feed), bounce back.
  const initial = useMemo(() => takeReaderFeed(), []);
  const [articles, setArticles] = useState<Article[]>(initial?.articles ?? []);
  const [index, setIndex] = useState(initial?.startIndex ?? 0);

  // Live pagination cursor (feed/category sources only). Held in a ref so
  // loadMore stays a stable, dependency-free callback and never refetches the
  // same page. `loadingRef` guards against overlapping requests.
  const pageRef = useRef<ReaderPagination | null>(initial?.pagination ?? null);
  const loadingRef = useRef(false);

  // Fetch + append the next page as the user swipes toward the end, mirroring
  // the feed's infinite scroll so the reader never dead-ends at 20 stories.
  const loadMore = useCallback(async () => {
    const p = pageRef.current;
    if (!p || !p.hasMore || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const { articles: more, hasMore } = await fetchArticles({
        category: p.category ?? undefined,
        offset: p.offset,
      });
      // Advance the cursor and stop if the server returned nothing new.
      pageRef.current = { category: p.category, offset: p.offset + more.length, hasMore: hasMore && more.length > 0 };
      if (more.length) {
        setArticles((prev) => {
          const seen = new Set(prev.map((a) => a.id));
          const fresh = more.filter((a) => !seen.has(a.id));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
      }
    } catch {
      // transient - leave hasMore so a later swipe retries
    } finally {
      loadingRef.current = false;
    }
  }, []);

  const renderPage = useCallback(
    (item: Article) => (
      <ReaderCard
        article={item}
        width={width}
        height={height}
        topInset={insets.top}
        bottomInset={insets.bottom}
        saved={isSaved(item.id)}
        onToggleSave={() => toggle(item)}
      />
    ),
    [width, height, insets.top, insets.bottom, isSaved, toggle],
  );

  if (articles.length === 0) {
    return (
      <View style={[styles.empty]}>
        <Text style={styles.emptyText}>{t("feed.empty")}</Text>
        <Pressable style={styles.backPill} onPress={() => router.back()}>
          <Text style={styles.backPillText}>{t("feed.retry")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlipPager
        articles={articles}
        initialIndex={initial?.startIndex ?? 0}
        width={width}
        height={height}
        renderPage={renderPage}
        onIndexChange={setIndex}
        onNearEnd={loadMore}
      />

      {/* Floating close button. No position counter - the feed should feel
          endless, not "1 / 20". */}
      <View style={[styles.topBar, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
        <Pressable style={styles.closeBtn} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* Swipe hint, only on the very first story. */}
      {index === 0 ? (
        <View style={[styles.hint, { bottom: insets.bottom + 92 }]} pointerEvents="none">
          <Text style={styles.hintText}>{t("reader.swipeHint")}</Text>
          <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.readerBg },
  topBar: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
  },
  hintText: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
    backgroundColor: colors.bg,
  },
  emptyText: { color: colors.textMuted, fontSize: 15 },
  backPill: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 999,
  },
  backPillText: { color: "#FFFFFF", fontWeight: "700" },
});
