import React from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Share,
  Linking,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import type { Article } from "../api/client";
import { useT } from "../i18n";
import { categoryLabel, stripHtml, timeAgo } from "../lib/format";
import { articleUrl } from "../lib/article-url";
import { colors, radius, spacing } from "../theme";

const LOGO_PLACEHOLDER = require("../../assets/icon-512.png");

// One full-screen page in the vertical swipe reader. Layout: a large image
// (top), then category + headline + scrollable summary, then the "read full
// story" CTA. The floating action rail (save/share) is overlaid by the parent.
export default function ReaderCard({
  article,
  height,
  topInset,
  bottomInset,
  saved,
  onToggleSave,
}: {
  article: Article;
  height: number;
  topInset: number;
  bottomInset: number;
  saved: boolean;
  onToggleSave: () => void;
}) {
  const { t, lang } = useT();
  const summary = stripHtml(article.summary);
  const hasImage = !!article.featuredImage;
  const url = articleUrl(article);

  const onShare = async () => {
    try {
      await Share.share({
        message: url ? `${article.title}\n\n${url}` : article.title,
      });
    } catch {
      /* user dismissed */
    }
  };

  const onReadFull = () => {
    if (url) Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={[styles.page, { height }]}>
      <View style={[styles.imageWrap, { paddingTop: topInset }]}>
        <Image
          source={hasImage ? { uri: article.featuredImage! } : LOGO_PLACEHOLDER}
          style={hasImage ? styles.image : styles.placeholder}
          contentFit={hasImage ? "cover" : "contain"}
          transition={150}
        />
      </View>

      <View style={[styles.content, { paddingBottom: bottomInset + spacing.lg }]}>
        <View style={styles.metaRow}>
          {article.category ? (
            <View style={styles.catChip}>
              <Text style={styles.catChipText}>{categoryLabel(article.category, lang)}</Text>
            </View>
          ) : (
            <View />
          )}
          <Text style={styles.time}>{timeAgo(article.publishedAt, lang)}</Text>
        </View>

        <Text style={styles.title}>{article.title}</Text>

        <ScrollView
          style={styles.summaryScroll}
          showsVerticalScrollIndicator={false}
          // Nested vertical scroll inside the paging FlatList - only takes over
          // the gesture when the summary is actually long enough to scroll.
        >
          <Text style={styles.summary}>{summary}</Text>
        </ScrollView>

        <View style={styles.actionRow}>
          {url ? (
            <Pressable style={styles.readBtn} onPress={onReadFull}>
              <Ionicons name="open-outline" size={16} color="#FFFFFF" />
              <Text style={styles.readBtnText}>{t("reader.readFull")}</Text>
            </Pressable>
          ) : (
            <View style={{ flex: 1 }} />
          )}

          <Pressable style={styles.iconBtn} onPress={onToggleSave} hitSlop={8}>
            <Ionicons
              name={saved ? "bookmark" : "bookmark-outline"}
              size={22}
              color={saved ? colors.brand : colors.text}
            />
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={onShare} hitSlop={8}>
            <Ionicons name="share-social-outline" size={22} color={colors.text} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: "100%",
    backgroundColor: colors.bg,
  },
  imageWrap: {
    flex: 1,
    backgroundColor: colors.readerBg,
  },
  image: { flex: 1, width: "100%" },
  placeholder: { flex: 1, width: "100%", opacity: 0.5 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    backgroundColor: colors.bg,
    // Pull the card up slightly over the image for a sheet-like seam.
    marginTop: -radius.lg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    // ~48% of the screen for text; image gets the rest.
    maxHeight: "52%",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  catChip: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  catChipText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  time: { color: colors.textFaint, fontSize: 12 },
  title: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "800",
    color: colors.text,
  },
  summaryScroll: { marginTop: spacing.md, flexGrow: 0 },
  summary: {
    fontSize: 16,
    lineHeight: 25,
    color: colors.textMuted,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  readBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.brand,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  readBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  iconBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
