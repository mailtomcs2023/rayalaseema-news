import React, { useMemo } from "react";
import { View, Text, Linking, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { parseHtmlBlocks, type Block, type Span } from "../lib/html";
import { colors, radius, spacing } from "../theme";

// Renders a CMS article's HTML body as native views - no WebView. Parses the
// HTML into blocks once, then maps each to Text/Image. `title` lets us drop a
// leading heading/paragraph that just repeats the article title (the CMS body
// often starts with the headline), so it doesn't show twice.
export default function ArticleBody({
  html,
  title,
}: {
  html: string | null | undefined;
  title?: string;
}) {
  const blocks = useMemo(() => {
    let b = parseHtmlBlocks(html);
    if (title && b.length) {
      const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
      const first = b[0];
      const firstText =
        first.kind === "heading" || first.kind === "para" || first.kind === "quote"
          ? first.spans.map((s) => s.text).join("")
          : "";
      if (firstText && norm(firstText) === norm(title)) b = b.slice(1);
    }
    return b;
  }, [html, title]);

  return (
    <View>
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </View>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "image":
      return (
        <Image
          source={{ uri: block.src }}
          style={styles.image}
          contentFit="cover"
          transition={150}
        />
      );
    case "heading":
      return (
        <Text style={[styles.heading, block.level <= 2 ? styles.h2 : styles.h3]}>
          <Spans spans={block.spans} />
        </Text>
      );
    case "quote":
      return (
        <View style={styles.quote}>
          <Text style={styles.quoteText}>
            <Spans spans={block.spans} />
          </Text>
        </View>
      );
    case "listitem":
      return (
        <View style={styles.listRow}>
          <Text style={styles.bullet}>{block.ordered ? `${block.index}.` : "•"}</Text>
          <Text style={styles.paragraph}>
            <Spans spans={block.spans} />
          </Text>
        </View>
      );
    case "para":
    default:
      return (
        <Text style={styles.paragraph}>
          <Spans spans={block.spans} />
        </Text>
      );
  }
}

function Spans({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((s, i) => {
        if (s.href) {
          return (
            <Text key={i} style={styles.link} onPress={() => Linking.openURL(s.href!).catch(() => {})}>
              {s.text}
            </Text>
          );
        }
        const style = [s.bold && styles.bold, s.italic && styles.italic].filter(Boolean);
        return style.length ? (
          <Text key={i} style={style}>
            {s.text}
          </Text>
        ) : (
          <Text key={i}>{s.text}</Text>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  paragraph: {
    fontSize: 17,
    lineHeight: 27,
    color: colors.text,
    marginBottom: spacing.md,
  },
  heading: {
    fontWeight: "800",
    color: colors.text,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  h2: { fontSize: 21, lineHeight: 29 },
  h3: { fontSize: 18, lineHeight: 25 },
  bold: { fontWeight: "800" },
  italic: { fontStyle: "italic" },
  link: { color: colors.brand, textDecorationLine: "underline" },
  image: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    backgroundColor: colors.bgMuted,
    marginBottom: spacing.md,
  },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.brand,
    paddingLeft: spacing.md,
    marginBottom: spacing.md,
  },
  quoteText: { fontSize: 17, lineHeight: 27, color: colors.textMuted, fontStyle: "italic" },
  listRow: { flexDirection: "row", marginBottom: spacing.sm, paddingRight: spacing.sm },
  bullet: { fontSize: 17, lineHeight: 27, color: colors.brand, width: 24, fontWeight: "700" },
});
