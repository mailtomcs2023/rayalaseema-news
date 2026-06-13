import React, { useCallback, useMemo, useState } from "react";
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
import type { Article } from "../src/api/client";
import { takeReaderFeed } from "../src/lib/feed-store";
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
  const [index, setIndex] = useState(initial?.startIndex ?? 0);

  const articles = initial?.articles ?? [];

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
      />

      {/* Floating close button + position counter. */}
      <View style={[styles.topBar, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
        <Pressable style={styles.closeBtn} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </Pressable>
        <View style={styles.counter}>
          <Text style={styles.counterText}>
            {index + 1} / {articles.length}
          </Text>
        </View>
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
  counter: {
    backgroundColor: colors.overlay,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
  },
  counterText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
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
