import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Share, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { fetchArticle, type Article, type ArticleFull } from "../../src/api/client";
import { takeOpenArticle } from "../../src/lib/article-store";
import ArticleBody from "../../src/components/ArticleBody";
import { useT } from "../../src/i18n";
import { categoryLabel } from "../../src/lib/format";
import { articleUrl } from "../../src/lib/article-url";
import { colors, radius, spacing } from "../../src/theme";

const LOGO_PLACEHOLDER = require("../../assets/icon-512.png");

// Native, in-app article screen. Header paints instantly from the snapshot the
// reader handed over; the HTML body is fetched by id and rendered natively
// (see ArticleBody) - no WebView.
export default function ArticleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, lang } = useT();

  const snapshot = useMemo(() => takeOpenArticle(), []);
  const [full, setFull] = useState<ArticleFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Hero sizes to the image's true aspect ratio so the whole photo shows
  // without odd cropping; clamped so very tall portraits don't fill the screen.
  const [aspect, setAspect] = useState(16 / 9);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    fetchArticle(id)
      .then((a) => alive && setFull(a))
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  // Prefer fetched data, fall back to the snapshot for the header bits.
  const head: Article | ArticleFull | null = full ?? snapshot;
  const hasImage = !!head?.featuredImage;
  const url = full ? articleUrl(full) : snapshot ? articleUrl(snapshot) : null;

  const onShare = () => {
    if (!head) return;
    Share.share({ message: url ? `${head.title}\n\n${url}` : head.title }).catch(() => {});
  };

  return (
    <View style={styles.screen}>
      {/* Header bar */}
      <View style={[styles.bar, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </Pressable>
        <Pressable onPress={onShare} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="share-social-outline" size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        showsVerticalScrollIndicator={false}
        // No pull-down overscroll/bounce on this page.
        bounces={false}
        overScrollMode="never"
      >
        <View style={[styles.imageWrap, { aspectRatio: hasImage ? aspect : 16 / 9 }]}>
          <Image
            source={hasImage ? { uri: head!.featuredImage! } : LOGO_PLACEHOLDER}
            style={hasImage ? styles.hero : styles.heroPlaceholder}
            // "contain" so the WHOLE image is always visible (never cropped).
            // The wrap below matches the image's own ratio, so for normal photos
            // it still fills edge-to-edge with no letterbox bars.
            contentFit="contain"
            transition={150}
            onLoad={(e) => {
              const w = e?.source?.width;
              const h = e?.source?.height;
              if (w && h) {
                // Hug the real image shape, clamped 1:2 (tall) … 2:1 (wide).
                setAspect(Math.min(Math.max(w / h, 0.5), 2));
              }
            }}
          />
          {head?.category ? (
            <View style={styles.catChip}>
              <Text style={styles.catChipText} numberOfLines={1}>
                {categoryLabel(head.category, lang)}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          {head ? <Text style={styles.title}>{head.title}</Text> : null}

          {/* Body */}
          {loading && !full ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.brand} />
            </View>
          ) : error && !full ? (
            <Text style={styles.errorText}>{t("feed.error")}</Text>
          ) : full?.body ? (
            <ArticleBody html={full.body} title={head?.title} />
          ) : full ? (
            // Article with no HTML body - fall back to the summary.
            <Text style={styles.summary}>{full.summary}</Text>
          ) : null}
        </View>
      </ScrollView>
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
    justifyContent: "space-between",
  },
  iconBtn: { padding: 2 },
  imageWrap: { width: "100%", aspectRatio: 16 / 9, backgroundColor: colors.bgMuted },
  hero: { width: "100%", height: "100%" },
  heroPlaceholder: {
    width: "100%",
    height: "100%",
    padding: spacing.xl,
    opacity: 0.6,
  },
  catChip: {
    position: "absolute",
    left: spacing.md,
    top: spacing.md,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.sm,
    maxWidth: "80%",
  },
  catChipText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  body: { padding: spacing.lg },
  title: {
    fontSize: 24,
    lineHeight: 36, // 1.5 × font size
    fontWeight: "800",
    color: colors.text,
    marginBottom: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summary: { fontSize: 17, lineHeight: 27, color: colors.text },
  center: { paddingVertical: spacing.xl, alignItems: "center" },
  errorText: { fontSize: 15, color: colors.textMuted, paddingVertical: spacing.lg },
});
