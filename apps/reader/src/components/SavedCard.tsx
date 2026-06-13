import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import type { Article } from "../api/client";
import { useT } from "../i18n";
import { categoryLabel, stripHtml, timeAgo } from "../lib/format";
import { colors, radius, spacing } from "../theme";

const LOGO_PLACEHOLDER = require("../../assets/icon-512.png");

interface Props {
  article: Article;
  onPress: () => void;
  saved: boolean;
  onToggleSave: () => void;
}

// Saved-page card laid out horizontally: image on the left, then the heading
// with the description beneath it on the right, and a time + remove row at the
// bottom.
function SavedCard({ article, onPress, saved, onToggleSave }: Props) {
  const { lang } = useT();
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
        <Text style={styles.title} numberOfLines={2}>
          {article.title}
        </Text>

        {summary ? (
          <Text style={styles.summary} numberOfLines={3}>
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

export default React.memo(SavedCard);

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  imageWrap: {
    width: 124,
    alignSelf: "stretch",
    backgroundColor: colors.bgMuted,
    // Image is absolutely filled (below) so it can't drive the card's height -
    // the card sizes to its text, and the image just fills the left column.
    position: "relative",
  },
  image: {
    ...StyleSheet.absoluteFillObject,
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    padding: spacing.lg,
    opacity: 0.6,
  },
  catChip: {
    position: "absolute",
    left: spacing.sm,
    top: spacing.sm,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    maxWidth: "90%",
  },
  catChipText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  body: {
    flex: 1,
    padding: spacing.md,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    lineHeight: 22.5,
  },
  summary: {
    marginTop: spacing.xs,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  metaRow: {
    marginTop: "auto",
    paddingTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  time: { fontSize: 12, color: colors.textFaint },
  saveBtn: { padding: 2 },
});
