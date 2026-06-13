import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import type { Article } from "../api/client";
import { useT } from "../i18n";
import { categoryLabel, stripHtml, timeAgo } from "../lib/format";
import { colors, radius, spacing } from "../theme";

// Brand logo shown on cards that have no featured image (per house style -
// never an "RE" text placeholder).
const LOGO_PLACEHOLDER = require("../../assets/icon-512.png");

interface Props {
  article: Article;
  onPress: () => void;
  saved: boolean;
  onToggleSave: () => void;
}

// A single short-news card in the scrollable feed, stacked vertically: the
// image on top, then the headline, then the summary, then the time + save row.
function NewsCard({ article, onPress, saved, onToggleSave }: Props) {
  const { t, lang } = useT();
  const summary = stripHtml(article.summary);
  const hasImage = !!article.featuredImage;

  return (
    <Pressable style={styles.card} onPress={onPress} android_ripple={{ color: colors.bgMuted }}>
      <View style={styles.imageWrap}>
        <Image
          source={hasImage ? { uri: article.featuredImage! } : LOGO_PLACEHOLDER}
          style={hasImage ? styles.image : styles.placeholder}
          contentFit={hasImage ? "cover" : "contain"}
          transition={150}
        />
        {article.category ? (
          <View style={styles.catChip}>
            <Text style={styles.catChipText} numberOfLines={1}>
              {categoryLabel(article.category, lang)}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={3}>
          {article.title}
        </Text>
        {summary ? (
          <Text style={styles.summary} numberOfLines={4}>
            {summary}
          </Text>
        ) : null}

        <View style={styles.metaRow}>
          <Text style={styles.time}>{timeAgo(article.publishedAt, lang)}</Text>
          <Pressable hitSlop={10} onPress={onToggleSave} style={styles.saveBtn}>
            <Ionicons
              name={saved ? "bookmark" : "bookmark-outline"}
              size={18}
              color={saved ? colors.brand : colors.textMuted}
            />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

export default React.memo(NewsCard);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  imageWrap: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: colors.bgMuted,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  placeholder: {
    width: "100%",
    height: "100%",
    padding: spacing.xl,
    opacity: 0.6,
  },
  catChip: {
    position: "absolute",
    left: spacing.sm,
    top: spacing.sm,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    maxWidth: "70%",
  },
  catChipText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  body: {
    padding: spacing.md,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.text,
    lineHeight: 25.5,
  },
  summary: {
    marginTop: spacing.sm,
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  metaRow: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  time: {
    fontSize: 12,
    color: colors.textFaint,
  },
  saveBtn: {
    padding: 2,
  },
});
