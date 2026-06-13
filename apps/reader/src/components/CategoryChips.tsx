import React, { useEffect, useRef } from "react";
import { ScrollView, TouchableOpacity, Text, View, StyleSheet } from "react-native";
import type { Category } from "../api/client";
import { useT } from "../i18n";
import { categoryLabel } from "../lib/format";

interface Props {
  categories: Category[];
  // null = the "All" pseudo-chip is active.
  active: string | null;
  onChange: (slug: string | null) => void;
}

const ALL = "__all";

// Horizontal, scrollable rail of category filter pills - same top-tab pattern
// as the reporter app's status filter (gray bar, white pills, red active chip).
// When the active chip changes it auto-centres in the visible rail so the
// neighbours stay partly visible, hinting "there's more this way" both ways.
export default function CategoryChips({ categories, active, onChange }: Props) {
  const { t, lang } = useT();
  const activeKey = active ?? ALL;

  // --- Auto-centre the active chip (mirrors ArticlesScreen) ---
  const railRef = useRef<ScrollView>(null);
  const chipLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const railWidth = useRef(0);
  useEffect(() => {
    // Tiny delay so onLayout has recorded positions on first mount.
    const id = setTimeout(() => {
      const l = chipLayouts.current[activeKey];
      const vw = railWidth.current;
      if (l && vw) {
        const targetX = l.x - (vw - l.width) / 2;
        railRef.current?.scrollTo({ x: Math.max(0, targetX), animated: true });
      }
    }, 60);
    return () => clearTimeout(id);
  }, [activeKey]);

  const renderChip = (key: string, label: string, slug: string | null) => {
    const isActive = activeKey === key;
    return (
      <TouchableOpacity
        key={key}
        onPress={() => onChange(slug)}
        onLayout={(e) => {
          chipLayouts.current[key] = {
            x: e.nativeEvent.layout.x,
            width: e.nativeEvent.layout.width,
          };
        }}
        style={[styles.chip, isActive && styles.chipActive]}
      >
        <Text style={[styles.chipText, isActive && styles.chipTextActive]} numberOfLines={1}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.filterBar}>
      <ScrollView
        ref={railRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={{ flex: 1 }}
        onLayout={(e) => {
          railWidth.current = e.nativeEvent.layout.width;
        }}
      >
        {renderChip(ALL, t("feed.all"), null)}
        {categories.map((c) => renderChip(c.slug, categoryLabel(c, lang), c.slug))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    paddingVertical: 10,
  },
  filterRow: { paddingHorizontal: 14, gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  chipActive: { backgroundColor: "#FF2C2C", borderColor: "#FF2C2C" },
  chipText: { fontSize: 13, fontWeight: "700", color: "#555" },
  chipTextActive: { color: "#fff" },
});
