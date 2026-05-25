import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl,
  ScrollView, Alert, Modal, Pressable, Platform,
} from "react-native";
import { TextInput } from "../components/Input";
import { Ionicons, FontAwesome6 } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { api } from "../api/client";
import { useT } from "../i18n";
import { ScreenHeader } from "../components/ScreenHeader";
import { KycBanner } from "../components/KycBanner";
import { requireVerifiedKyc } from "../lib/kyc-gate";

// Short, locale-aware date for the meta row. We keep it brief — the card is
// dense and a "23 May" or "23 May 2025" reads better at small sizes than a
// full "23/5/2026" or ISO blob.
function formatShortDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

// Status filter tabs shown at the top of the Articles screen. Order follows
// the reporter's mental workflow: just submitted → editor reviewing → final
// outcomes (approved / rejected) → drafts they haven't sent yet.
const FILTERS = [
  { value: "SUBMITTED", key: "status.submitted" },
  { value: "IN_REVIEW", key: "status.inReview" },
  { value: "APPROVED",  key: "status.approved" },
  { value: "REJECTED",  key: "status.rejected" },
  { value: "DRAFT",     key: "status.draft" },
];
const FILTER_VALUES = FILTERS.map((f) => f.value);

// Bottom-sheet filter dimensions. Keys are stable identifiers; the labels are
// i18n keys looked up in render.
type SortKey = "newest" | "oldest" | "mostViewed" | "titleAZ";
type DateRangeKey = "all" | "today" | "week" | "month";
type PhotoKey = "all" | "with" | "without";

const SORT_OPTIONS: { value: SortKey; key: string }[] = [
  { value: "newest", key: "filterSort.sort.newest" },
  { value: "oldest", key: "filterSort.sort.oldest" },
  { value: "mostViewed", key: "filterSort.sort.mostViewed" },
  { value: "titleAZ", key: "filterSort.sort.titleAZ" },
];
const DATE_OPTIONS: { value: DateRangeKey; key: string }[] = [
  { value: "all", key: "filterSort.range.all" },
  { value: "today", key: "filterSort.range.today" },
  { value: "week", key: "filterSort.range.week" },
  { value: "month", key: "filterSort.range.month" },
];
const PHOTO_OPTIONS: { value: PhotoKey; key: string }[] = [
  { value: "all", key: "filterSort.photo.all" },
  { value: "with", key: "filterSort.photo.with" },
  { value: "without", key: "filterSort.photo.without" },
];

// Cutoff timestamps for the date-range chips. Reasonably loose semantics:
// "today" is local midnight; "week" / "month" are rolling 7- and 30-day
// windows from now (not calendar week / calendar month).
function dateCutoff(range: DateRangeKey): number | null {
  if (range === "all") return null;
  if (range === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  const days = range === "week" ? 7 : 30;
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

// Visual spec per empty-state variant. Filtered shows a clearable warning;
// each status shows a tone-matched encouragement (green for "no rejections —
// good!", amber for "still waiting on review", etc.) plus an optional CTA.
type EmptyVariant = {
  icon: string;
  // Defaults to Ionicons; set "fa6" to render with FontAwesome6 instead.
  iconSet?: "ionicons" | "fa6";
  tint: string;       // hex used for icon + circle background tint
  titleKey: string;
  messageKey: string;
  actionKey?: string; // i18n key for the CTA button label
  action?: "new" | "clear";
};
const EMPTY_VARIANTS: Record<string, EmptyVariant> = {
  filtered: {
    icon: "options-outline",
    tint: "#3b82f6",
    titleKey: "empty.filtered.title",
    messageKey: "empty.filtered.message",
    actionKey: "empty.filtered.action",
    action: "clear",
  },
  SUBMITTED: {
    icon: "paper-plane",
    iconSet: "fa6",
    tint: "#f59e0b",
    titleKey: "empty.submitted.title",
    messageKey: "empty.submitted.message",
    actionKey: "empty.submitted.action",
    action: "new",
  },
  IN_REVIEW: {
    icon: "eye-outline",
    tint: "#3b82f6",
    titleKey: "empty.inReview.title",
    messageKey: "empty.inReview.message",
  },
  APPROVED: {
    icon: "checkmark-done-outline",
    tint: "#16a34a",
    titleKey: "empty.approved.title",
    messageKey: "empty.approved.message",
  },
  REJECTED: {
    icon: "shield-checkmark-outline",
    tint: "#16a34a",
    titleKey: "empty.rejected.title",
    messageKey: "empty.rejected.message",
  },
  DRAFT: {
    icon: "document-text-outline",
    tint: "#64748b",
    titleKey: "empty.draft.title",
    messageKey: "empty.draft.message",
    actionKey: "empty.draft.action",
    action: "new",
  },
};

function EmptyState({
  t, filter, filtered, onClear, onNew,
}: {
  t: (k: string, p?: Record<string, string>) => string;
  filter: string;
  filtered: boolean;
  onClear: () => void;
  onNew: () => void;
}) {
  const v = filtered ? EMPTY_VARIANTS.filtered : EMPTY_VARIANTS[filter] ?? EMPTY_VARIANTS.SUBMITTED;
  const handler = v.action === "clear" ? onClear : v.action === "new" ? onNew : undefined;
  return (
    <View style={emptyStyles.wrap}>
      <View style={[emptyStyles.iconCircle, { backgroundColor: v.tint + "1A" }]}>
        {v.iconSet === "fa6" ? (
          <FontAwesome6 name={v.icon} size={44} color={v.tint} />
        ) : (
          <Ionicons name={v.icon as keyof typeof Ionicons.glyphMap} size={48} color={v.tint} />
        )}
      </View>
      <Text style={emptyStyles.title}>{t(v.titleKey)}</Text>
      <Text style={emptyStyles.message}>{t(v.messageKey)}</Text>
      {v.actionKey && handler && (
        <TouchableOpacity
          style={[emptyStyles.cta, { backgroundColor: v.tint }]}
          onPress={handler}
          activeOpacity={0.85}
        >
          {v.action === "new" && <Ionicons name="add" size={18} color="#fff" />}
          {v.action === "clear" && <Ionicons name="close-circle-outline" size={16} color="#fff" />}
          <Text style={emptyStyles.ctaText}>{t(v.actionKey)}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  // Centered column near the top of the list area, not vertically dead-
  // center — feels more like "intentional empty" than "broken page".
  wrap: {
    paddingTop: 48, paddingHorizontal: 32, paddingBottom: 32,
    alignItems: "center", gap: 12,
  },
  iconCircle: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: "center", justifyContent: "center",
    marginBottom: 4,
  },
  title: { fontSize: 17, fontWeight: "800", color: "#0f172a", textAlign: "center" },
  message: { fontSize: 14, color: "#64748b", textAlign: "center", lineHeight: 20, maxWidth: 320 },
  cta: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999,
    marginTop: 8,
    shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  ctaText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});

// The "Articles" tab — the reporter's full article list, with a + New action.
export function ArticlesScreen() {
  const { t, lang } = useT();
  const router = useRouter();
  // A KPI card on the home screen can deep-link here with ?status=PUBLISHED etc.
  const { status } = useLocalSearchParams<{ status?: string }>();
  const [articles, setArticles] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState(
    status && FILTER_VALUES.includes(status) ? status : "SUBMITTED",
  );

  // --- Filter & sort state (driven by the bottom sheet) ---
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRangeKey>("all");
  const [photoFilter, setPhotoFilter] = useState<PhotoKey>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Re-sync the active chip when navigated to with a new ?status= while
  // this tab is already mounted.
  useEffect(() => {
    if (status && FILTER_VALUES.includes(status)) setFilter(status);
  }, [status]);

  // Whenever the active chip changes (deep-link, tab nav, or tap), centre
  // it in the visible rail. That way the chips on both sides stay partly
  // visible, telling the reader "there's more this way" in both directions.
  const chipScrollRef = useRef<ScrollView>(null);
  const chipLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const railWidth = useRef(0);
  useEffect(() => {
    // Tiny delay so onLayout has had a pass to record positions on first
    // mount; subsequent filter changes already have measurements.
    const id = setTimeout(() => {
      const l = chipLayouts.current[filter];
      const vw = railWidth.current;
      if (l && vw) {
        // Centre the chip in the visible viewport: place its left edge so
        // that (viewport - chip) / 2 px sits on either side of it.
        const targetX = l.x - (vw - l.width) / 2;
        chipScrollRef.current?.scrollTo({ x: Math.max(0, targetX), animated: true });
      }
    }, 60);
    return () => clearTimeout(id);
  }, [filter]);

  const load = useCallback(async () => {
    try {
      // The endpoint derives the reporter from the bearer token api() sends.
      const data = await api("/api/reporter/articles?limit=50");
      setArticles(data.articles || []);
    } catch {}
  }, []);

  // Refetch on focus — see DashboardScreen for rationale.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  // Inline delete from the list. Server enforces "SUBMITTED only" — we only
  // expose the button for that status so a non-editable article never gets
  // here, but if it did the 403 would surface via the Alert.
  const confirmDelete = useCallback((article: { id: string; title: string }) => {
    Alert.alert(
      t("editArticle.deleteTitle"),
      t("editArticle.deleteConfirm"),
      [
        { text: t("editArticle.cancel"), style: "cancel" },
        {
          text: t("editArticle.deleteAction"),
          style: "destructive",
          onPress: async () => {
            try {
              await api(`/api/reporter/articles/${article.id}`, { method: "DELETE" });
              // Optimistic remove so the row disappears immediately; a focus
              // refetch will reconcile if anything else changed server-side.
              setArticles((arr) => arr.filter((a) => a.id !== article.id));
            } catch (e: any) {
              Alert.alert(t("common.error"), e.message);
            }
          },
        },
      ],
    );
  }, [t]);

  // --- Derived data ---

  // Categories that actually appear in this reporter's articles. We derive
  // from the loaded list rather than fetching /categories so the chip set
  // matches what the user has written and never shows empty buckets.
  const availableCategories = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; color: string }>();
    for (const a of articles) {
      if (a.categoryId && a.category && !seen.has(a.categoryId)) {
        seen.set(a.categoryId, {
          id: a.categoryId,
          name: a.category.nameEn || a.category.name || a.category.slug || "—",
          color: a.category.color || "#94a3b8",
        });
      }
    }
    return Array.from(seen.values());
  }, [articles]);

  // Per-status counts shown as a small number next to each filter chip.
  // Computed against the unfiltered `articles` so the badges stay accurate
  // regardless of the active filter.
  const filterCounts = useMemo(() => {
    const c: Record<string, number> = {};
    FILTER_VALUES.forEach((v) => { c[v] = 0; });
    for (const a of articles) {
      if (c[a.status] != null) c[a.status]++;
    }
    return c;
  }, [articles]);

  // The list rendered in the FlatList — status chip + every sheet dimension
  // applied. Memoised on its dependencies so toggling a checkbox doesn't
  // re-sort 1000 items.
  const visibleArticles = useMemo(() => {
    let list = articles.filter((a) => a.status === filter);

    // Search across title + summary (case-insensitive).
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((a) => {
        const hay = `${a.title || ""}\n${a.summary || ""}`.toLowerCase();
        return hay.includes(q);
      });
    }

    if (selectedCategoryIds.length > 0) {
      const set = new Set(selectedCategoryIds);
      list = list.filter((a) => a.categoryId && set.has(a.categoryId));
    }

    const cutoff = dateCutoff(dateRange);
    if (cutoff !== null) {
      list = list.filter((a) => new Date(a.createdAt).getTime() >= cutoff);
    }

    if (photoFilter !== "all") {
      list = list.filter((a) => (photoFilter === "with" ? !!a.featuredImage : !a.featuredImage));
    }

    // Sort last so all the filters narrow the set first.
    const sorted = [...list].sort((a, b) => {
      switch (sortBy) {
        case "newest":     return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "oldest":     return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "mostViewed": return (b.viewCount || 0) - (a.viewCount || 0);
        case "titleAZ":    return String(a.title || "").localeCompare(String(b.title || ""));
      }
    });
    return sorted;
  }, [articles, filter, searchQuery, selectedCategoryIds, dateRange, photoFilter, sortBy]);

  // Anything different from defaults counts as "active". Drives the dot on
  // the funnel icon so the user knows filters are narrowing their view.
  const activeFilterCount =
    (searchQuery.trim() ? 1 : 0) +
    (selectedCategoryIds.length > 0 ? 1 : 0) +
    (dateRange !== "all" ? 1 : 0) +
    (photoFilter !== "all" ? 1 : 0) +
    (sortBy !== "newest" ? 1 : 0);

  const clearAll = () => {
    setSortBy("newest");
    setSelectedCategoryIds([]);
    setDateRange("all");
    setPhotoFilter("all");
    setSearchQuery("");
  };

  const toggleCategory = (id: string) => {
    setSelectedCategoryIds((arr) =>
      arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id],
    );
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader />
      <KycBanner />

      {/* Status filter chips + funnel button. The chips scroll horizontally
          while the funnel stays pinned on the right edge. */}
      <View style={styles.filterBar}>
        <ScrollView
          ref={chipScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={{ flex: 1 }}
          onLayout={(e) => {
            // The visible width of the chip rail — used to centre the
            // active chip inside it.
            railWidth.current = e.nativeEvent.layout.width;
          }}
        >
          {FILTERS.map((f) => {
            const active = filter === f.value;
            return (
              <TouchableOpacity
                key={f.value}
                onPress={() => setFilter(f.value)}
                onLayout={(e) => {
                  // Cache the chip's geometry for the centring effect above.
                  chipLayouts.current[f.value] = {
                    x: e.nativeEvent.layout.x,
                    width: e.nativeEvent.layout.width,
                  };
                }}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {t(f.key)}
                  <Text style={[styles.chipCount, active && styles.chipCountActive]}>  {filterCounts[f.value] ?? 0}</Text>
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <TouchableOpacity
          style={[styles.chip, styles.funnelChip, activeFilterCount > 0 && styles.chipActive]}
          onPress={() => setSheetOpen(true)}
          accessibilityLabel={t("filterSort.title")}
        >
          <Ionicons
            name="options-outline"
            size={16}
            color={activeFilterCount > 0 ? "#fff" : "#555"}
          />
          {activeFilterCount > 0 && (
            <View style={styles.funnelBadge}>
              <Text style={styles.funnelBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={visibleArticles}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 14, paddingBottom: Platform.OS === "android" ? 100 : 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#FF2C2C"]} tintColor="#FF2C2C" />
        }
        renderItem={({ item }) => {
          // SUBMITTED and DRAFT articles both still belong to the reporter,
          // so both get inline edit/delete affordances on the card.
          const isEditable = item.status === "SUBMITTED" || item.status === "DRAFT";
          const categoryColor = item.category?.color || "#94a3b8";
          // Pick the category name in the active app language; fall back to
          // whichever side actually has a value.
          const categoryName = (lang === "en"
            ? (item.category?.nameEn || item.category?.name)
            : (item.category?.name || item.category?.nameEn))
            || "—";
          return (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push(`/new-article?id=${item.id}`)}
            >
              <View style={styles.cardBody}>
                <View style={styles.content}>
                  {/* Line 1 — headline. Status is redundant here because the
                      chip bar at the top of the screen already filters by it;
                      we only show it inside the rejection box (when relevant). */}
                  <Text style={styles.title} numberOfLines={2}>{item.title}</Text>

                  {/* Line 2 — category + date + views on the left, edit/delete
                      icons hugging the right edge. Only shown when editable. */}
                  <View style={styles.metaRow}>
                    <View style={styles.metaLeft}>
                      <View style={[styles.catDot, { backgroundColor: categoryColor }]} />
                      <Text style={[styles.metaCategory, { color: categoryColor }]} numberOfLines={1}>
                        {categoryName}
                      </Text>
                      <Text style={styles.metaSep}>•</Text>
                      <Text style={styles.metaText} numberOfLines={1}>{formatShortDate(item.createdAt)}</Text>
                      <Text style={styles.metaSep}>•</Text>
                      <Text style={styles.metaText} numberOfLines={1}>
                        {item.viewCount || 0} {t("dashboard.views")}
                      </Text>
                    </View>

                    {isEditable && (
                      <View style={styles.actionsInline}>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.editBtn]}
                          onPress={() => router.push(`/new-article?id=${item.id}`)}
                          accessibilityLabel={t("editArticle.editAction")}
                          hitSlop={8}
                        >
                          <FontAwesome6 name="edit" size={11} color="#1d4ed8" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.deleteBtn]}
                          onPress={() => confirmDelete(item)}
                          accessibilityLabel={t("editArticle.deleteAction")}
                          hitSlop={8}
                        >
                          <Ionicons name="trash-outline" size={12} color="#dc2626" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              </View>

              {item.rejectionNote && item.status === "REJECTED" && (
                <View style={styles.rejectionBox}>
                  <Text style={styles.rejectionLabel}>{t("dashboard.feedback")}</Text>
                  <Text style={styles.rejectionText}>{item.rejectionNote}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            t={t}
            filter={filter}
            filtered={activeFilterCount > 0}
            onClear={clearAll}
            onNew={async () => {
              if (await requireVerifiedKyc(t, router)) router.push("/new-article");
            }}
          />
        }
      />

      {/* New-article action — a floating button (the header is shared/global) */}
      <TouchableOpacity
        style={styles.fab}
        onPress={async () => {
          if (await requireVerifiedKyc(t, router)) router.push("/new-article");
        }}
        accessibilityLabel={t("dashboard.newArticle")}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* --- Filter & Sort bottom sheet --- */}
      <Modal
        visible={sheetOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setSheetOpen(false)}
      >
        {/* Tap-outside-to-close. The inner Pressable absorbs taps so the
            backdrop handler doesn't fire when the user interacts with the
            sheet itself. */}
        <Pressable style={styles.backdrop} onPress={() => setSheetOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.dragHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t("filterSort.title")}</Text>
              {activeFilterCount > 0 && (
                <View style={styles.sheetCountPill}>
                  <Text style={styles.sheetCountPillText}>
                    {activeFilterCount} {t("filterSort.activeShort")}
                  </Text>
                </View>
              )}
            </View>

            <ScrollView
              contentContainerStyle={styles.sheetBody}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              {/* Search */}
              <Text style={styles.sectionLabel}>{t("filterSort.search")}</Text>
              <View style={styles.searchBox}>
                <Ionicons name="search" size={16} color="#94a3b8" />
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder={t("filterSort.searchPlaceholder")}
                  returnKeyType="search"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color="#94a3b8" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Sort */}
              <Text style={styles.sectionLabel}>{t("filterSort.sortBy")}</Text>
              <View style={styles.chipGroup}>
                {SORT_OPTIONS.map((o) => {
                  const active = sortBy === o.value;
                  return (
                    <TouchableOpacity
                      key={o.value}
                      onPress={() => setSortBy(o.value)}
                      style={[styles.sheetChip, active && styles.sheetChipActive]}
                    >
                      <Text style={[styles.sheetChipText, active && styles.sheetChipTextActive]}>
                        {t(o.key)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Categories — only renders if there's at least one to choose */}
              <Text style={styles.sectionLabel}>{t("filterSort.categories")}</Text>
              {availableCategories.length === 0 ? (
                <Text style={styles.sectionEmpty}>{t("filterSort.noCategoriesYet")}</Text>
              ) : (
                <View style={styles.chipGroup}>
                  {availableCategories.map((c) => {
                    const active = selectedCategoryIds.includes(c.id);
                    return (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => toggleCategory(c.id)}
                        style={[
                          styles.sheetChip,
                          active && { backgroundColor: c.color, borderColor: c.color },
                        ]}
                      >
                        <View style={[styles.sheetChipDot, { backgroundColor: active ? "#fff" : c.color }]} />
                        <Text style={[styles.sheetChipText, active && styles.sheetChipTextActive]}>
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Date range */}
              <Text style={styles.sectionLabel}>{t("filterSort.dateRange")}</Text>
              <View style={styles.chipGroup}>
                {DATE_OPTIONS.map((o) => {
                  const active = dateRange === o.value;
                  return (
                    <TouchableOpacity
                      key={o.value}
                      onPress={() => setDateRange(o.value)}
                      style={[styles.sheetChip, active && styles.sheetChipActive]}
                    >
                      <Text style={[styles.sheetChipText, active && styles.sheetChipTextActive]}>
                        {t(o.key)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Featured image */}
              <Text style={styles.sectionLabel}>{t("filterSort.featuredImage")}</Text>
              <View style={styles.chipGroup}>
                {PHOTO_OPTIONS.map((o) => {
                  const active = photoFilter === o.value;
                  return (
                    <TouchableOpacity
                      key={o.value}
                      onPress={() => setPhotoFilter(o.value)}
                      style={[styles.sheetChip, active && styles.sheetChipActive]}
                    >
                      <Text style={[styles.sheetChipText, active && styles.sheetChipTextActive]}>
                        {t(o.key)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Sticky footer with Clear / Apply (the latter just closes — all
                filters are live, so there's no "pending" state to commit). */}
            <View style={styles.sheetFooter}>
              <TouchableOpacity onPress={clearAll} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>{t("filterSort.clear")}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSheetOpen(false)} style={styles.applyBtn}>
                <Text style={styles.applyBtnText}>{t("filterSort.apply")}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f3f4f6" },

  // Filter bar — chips on the left (scrollable), funnel button on the right.
  filterBar: { flexDirection: "row", alignItems: "center", backgroundColor: "#f3f4f6", paddingVertical: 10, paddingRight: 10 },
  filterRow: { paddingHorizontal: 14, gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5e7eb" },
  chipActive: { backgroundColor: "#FF2C2C", borderColor: "#FF2C2C" },
  chipText: { fontSize: 13, fontWeight: "700", color: "#555" },
  chipTextActive: { color: "#fff" },
  // The count number tucked after each label — slightly de-emphasised so the
  // label stays the primary glyph. On the active chip it picks up the white
  // colour via inheritance from chipTextActive.
  chipCount: { fontSize: 12, fontWeight: "800", color: "#aaa", letterSpacing: 0.2 },
  chipCountActive: { color: "rgba(255,255,255,0.85)" },

  // Funnel button reuses the chip pill so it visually belongs to the rail.
  // Only the horizontal padding is tightened (it's icon-only, no label).
  funnelChip: { paddingHorizontal: 11, marginLeft: 8, alignItems: "center", justifyContent: "center" },
  funnelBadge: {
    position: "absolute", top: -4, right: -4,
    minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4,
    backgroundColor: "#FF2C2C",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "#fff",
  },
  funnelBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },

  fab: {
    position: "absolute", right: 16, bottom: 120,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: "#FF2C2C",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },

  // Card
  card: {
    backgroundColor: "#fff", marginBottom: 12, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: "#f1f5f9",
    shadowColor: "#0f172a", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 1.5,
  },
  cardBody: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  content: { flex: 1, gap: 4 },
  title: { fontSize: 15, fontWeight: "700", color: "#0f172a", lineHeight: 20, paddingVertical: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  catDot: { width: 7, height: 7, borderRadius: 4 },
  metaCategory: { fontSize: 11.5, fontWeight: "700", flexShrink: 1 },
  metaSep: { fontSize: 11, color: "#cbd5e1" },
  metaText: { fontSize: 11.5, color: "#64748b", fontWeight: "500", flexShrink: 1 },

  rejectionBox: {
    marginTop: 12, padding: 10, backgroundColor: "#fef2f2", borderRadius: 10,
    borderLeftWidth: 3, borderLeftColor: "#dc2626",
  },
  rejectionLabel: { fontSize: 10, fontWeight: "800", color: "#dc2626", textTransform: "uppercase", letterSpacing: 0.4 },
  rejectionText: { fontSize: 12, color: "#7f1d1d", marginTop: 2 },

  actionsInline: { flexDirection: "row", gap: 6, marginLeft: 6 },
  actionBtn: { width: 24, height: 24, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  editBtn: { backgroundColor: "#eff6ff" },
  deleteBtn: { backgroundColor: "#fef2f2" },

  // --- Bottom-sheet styles ---
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 6, paddingBottom: 24,
    maxHeight: "85%",
  },
  dragHandle: {
    alignSelf: "center", width: 36, height: 4, borderRadius: 2,
    backgroundColor: "#e5e7eb", marginTop: 6, marginBottom: 8,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 4 },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: "#0f172a" },
  sheetCountPill: { backgroundColor: "#fef3c7", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  sheetCountPillText: { fontSize: 11, fontWeight: "800", color: "#92400e" },

  sheetBody: { paddingHorizontal: 20, paddingBottom: 12 },
  sectionLabel: { fontSize: 12, fontWeight: "800", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 16, marginBottom: 8 },
  sectionEmpty: { fontSize: 13, color: "#94a3b8", fontStyle: "italic", paddingVertical: 4 },

  searchBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#f3f4f6", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#0f172a", padding: 0 },

  chipGroup: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sheetChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5e7eb",
  },
  sheetChipActive: { backgroundColor: "#FF2C2C", borderColor: "#FF2C2C" },
  sheetChipDot: { width: 7, height: 7, borderRadius: 4 },
  sheetChipText: { fontSize: 13, fontWeight: "600", color: "#475569" },
  sheetChipTextActive: { color: "#fff", fontWeight: "700" },

  sheetFooter: {
    flexDirection: "row", gap: 10,
    paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: "#f1f5f9",
  },
  clearBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5e7eb",
    alignItems: "center", justifyContent: "center",
  },
  clearBtnText: { fontSize: 14, fontWeight: "700", color: "#475569" },
  applyBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 12,
    backgroundColor: "#FF2C2C",
    alignItems: "center", justifyContent: "center",
  },
  applyBtnText: { fontSize: 14, fontWeight: "800", color: "#fff" },
});
