"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, SlidersHorizontal, X, Search } from "lucide-react";

// Web port of the Expo ArticlesScreen — status chips + a "funnel" button
// that opens a bottom-sheet of advanced filters (search, sort, categories,
// date range, photo filter). All filter state is held client-side and
// applied to the server-fetched article list.

const FILTERS = [
  { value: "SUBMITTED", label: "Submitted" },
  { value: "IN_REVIEW", label: "In Review" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "PUBLISHED", label: "Published" },
  { value: "DRAFT", label: "Drafts" },
] as const;

const STATUS_TINT: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#f3f4f6", text: "#555" },
  SUBMITTED: { bg: "#fef3c7", text: "#92400e" },
  IN_REVIEW: { bg: "#dbeafe", text: "#1d4ed8" },
  APPROVED: { bg: "#dcfce7", text: "#166534" },
  PUBLISHED: { bg: "#dcfce7", text: "#166534" },
  REJECTED: { bg: "#fef2f2", text: "#dc2626" },
};

type SortKey = "newest" | "oldest" | "mostViewed" | "titleAZ";
type DateRangeKey = "all" | "today" | "week" | "month";
type PhotoKey = "all" | "with" | "without";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "mostViewed", label: "Most viewed" },
  { value: "titleAZ", label: "Title A–Z" },
];

const DATE_OPTIONS: { value: DateRangeKey; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

const PHOTO_OPTIONS: { value: PhotoKey; label: string }[] = [
  { value: "all", label: "All" },
  { value: "with", label: "With photo" },
  { value: "without", label: "Without photo" },
];

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

interface Article {
  id: string;
  title: string;
  status: string;
  featuredImage?: string | null;
  rejectionNote?: string | null;
  viewCount: number | null;
  createdAt: string;
  categoryId?: string | null;
  category?: { name: string | null; nameEn: string | null; color: string | null } | null;
}

interface Category {
  id: string;
  name: string | null;
  nameEn: string | null;
  color: string | null;
}

interface Props {
  articles: Article[];
  countByStatus: Record<string, number>;
  categories: Category[];
}

export function ArticlesClient({ articles, countByStatus, categories }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status");
  const filter =
    (FILTERS.find((f) => f.value === statusParam)?.value as (typeof FILTERS)[number]["value"]) ||
    "SUBMITTED";

  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRangeKey>("all");
  const [photoFilter, setPhotoFilter] = useState<PhotoKey>("all");

  // Lock background scroll when the sheet is open, mirroring the Expo modal
  useEffect(() => {
    document.body.style.overflow = sheetOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sheetOpen]);

  const setStatus = (s: string) => {
    router.push(`/reporter/articles?status=${s}`);
  };

  const availableCategories = useMemo(() => {
    const seen = new Map<string, Category>();
    for (const a of articles) {
      if (a.categoryId && a.category && !seen.has(a.categoryId)) {
        seen.set(a.categoryId, {
          id: a.categoryId,
          name: a.category.name,
          nameEn: a.category.nameEn,
          color: a.category.color,
        });
      }
    }
    if (seen.size > 0) return Array.from(seen.values());
    // Fall back to the server-provided category list when the visible list
    // is empty (e.g. brand new reporter looking at "Submitted: 0").
    return categories;
  }, [articles, categories]);

  const visibleArticles = useMemo(() => {
    let list = articles;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((a) => (a.title || "").toLowerCase().includes(q));
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
    const sorted = [...list].sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "mostViewed":
          return (b.viewCount || 0) - (a.viewCount || 0);
        case "titleAZ":
          return String(a.title || "").localeCompare(String(b.title || ""));
      }
    });
    return sorted;
  }, [articles, searchQuery, selectedCategoryIds, dateRange, photoFilter, sortBy]);

  const activeFilterCount =
    (searchQuery.trim() ? 1 : 0) +
    (selectedCategoryIds.length > 0 ? 1 : 0) +
    (dateRange !== "all" ? 1 : 0) +
    (photoFilter !== "all" ? 1 : 0) +
    (sortBy !== "newest" ? 1 : 0);

  const clearAll = () => {
    setSearchQuery("");
    setSortBy("newest");
    setSelectedCategoryIds([]);
    setDateRange("all");
    setPhotoFilter("all");
  };

  const toggleCategory = (id: string) => {
    setSelectedCategoryIds((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]));
  };

  return (
    <>
      {/* Filter bar — status chips on the left (scroll on overflow), funnel button on the right */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingTop: 12,
          paddingBottom: 12,
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            gap: 8,
            overflowX: "auto",
            scrollbarWidth: "none",
          }}
          className="rep-chip-rail"
        >
          {FILTERS.map((f) => {
            const active = filter === f.value;
            const n = countByStatus[f.value] || 0;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatus(f.value)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  border: active ? "1px solid transparent" : "1px solid #e5e7eb",
                  background: active ? "#FF2C2C" : "#fff",
                  color: active ? "#fff" : "#555",
                  boxShadow: active
                    ? "0 1px 2px rgba(255,44,44,0.25)"
                    : "0 1px 2px rgba(0,0,0,0.04)",
                  cursor: "pointer",
                }}
              >
                {f.label}
                {n > 0 ? <span style={{ opacity: 0.85 }}> · {n}</span> : null}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="Filter and sort"
          style={{
            position: "relative",
            padding: "8px 11px",
            borderRadius: 999,
            border: `1px solid ${activeFilterCount > 0 ? "transparent" : "#e5e7eb"}`,
            background: activeFilterCount > 0 ? "#FF2C2C" : "#fff",
            color: activeFilterCount > 0 ? "#fff" : "#555",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SlidersHorizontal size={16} />
          {activeFilterCount > 0 ? (
            <span
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                minWidth: 16,
                height: 16,
                borderRadius: 8,
                padding: "0 4px",
                background: "#FF2C2C",
                color: "#fff",
                fontSize: 9,
                fontWeight: 800,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1.5px solid #fff",
              }}
            >
              {activeFilterCount}
            </span>
          ) : null}
        </button>
      </div>

      {/* Article list */}
      {visibleArticles.length === 0 ? (
        <div
          style={{
            padding: 48,
            textAlign: "center",
            background: "#fff",
            borderRadius: 14,
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <FileText size={48} color="#d1d5db" style={{ margin: "0 auto 10px" }} />
          <p style={{ fontSize: 14, color: "#aaa" }}>
            {activeFilterCount > 0
              ? "No articles match the filters. Try clearing some."
              : `No ${filter.toLowerCase().replace("_", " ")} articles yet.`}
          </p>
          {activeFilterCount > 0 ? (
            <button
              type="button"
              onClick={clearAll}
              style={{
                marginTop: 14,
                padding: "10px 18px",
                background: "#3b82f6",
                color: "#fff",
                fontWeight: 800,
                fontSize: 13,
                border: "none",
                borderRadius: 999,
                cursor: "pointer",
              }}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visibleArticles.map((a) => {
            const sc = STATUS_TINT[a.status] || STATUS_TINT.DRAFT;
            return (
              <div
                key={a.id}
                style={{
                  background: "#fff",
                  borderRadius: 14,
                  padding: 14,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <p style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "#111", lineHeight: 1.4 }}>
                    {a.title}
                  </p>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: 0.4,
                      color: sc.text,
                      background: sc.bg,
                      padding: "3px 8px",
                      borderRadius: 6,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.status}
                  </span>
                </div>
                <p style={{ fontSize: 11, color: "#999", marginTop: 6 }}>
                  {a.category?.nameEn || ""} · {a.viewCount || 0} views ·{" "}
                  {new Date(a.createdAt).toLocaleDateString()}
                </p>
                {a.rejectionNote && a.status === "REJECTED" ? (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 9,
                      background: "#fef2f2",
                      borderRadius: 8,
                      borderLeft: "3px solid #dc2626",
                    }}
                  >
                    <p style={{ fontSize: 10, fontWeight: 800, color: "#dc2626" }}>Feedback:</p>
                    <p style={{ fontSize: 12, color: "#666", marginTop: 1 }}>{a.rejectionNote}</p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {/* Filter & sort bottom sheet */}
      {sheetOpen ? (
        <div
          onClick={() => setSheetOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            zIndex: 100,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 560,
              background: "#fff",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingTop: 6,
              paddingBottom: 24,
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                alignSelf: "center",
                width: 36,
                height: 4,
                borderRadius: 2,
                background: "#e5e7eb",
                marginTop: 6,
                marginBottom: 8,
              }}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px 4px" }}>
              <p style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>Filter & sort</p>
              {activeFilterCount > 0 ? (
                <span
                  style={{
                    background: "#fef3c7",
                    borderRadius: 999,
                    padding: "3px 10px",
                    fontSize: 11,
                    fontWeight: 800,
                    color: "#92400e",
                  }}
                >
                  {activeFilterCount} active
                </span>
              ) : null}
            </div>

            <div style={{ overflowY: "auto", padding: "12px 20px", flex: 1 }}>
              <SectionLabel>Search</SectionLabel>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "#f3f4f6",
                  borderRadius: 10,
                  padding: "10px 12px",
                  marginBottom: 4,
                }}
              >
                <Search size={16} color="#94a3b8" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by title"
                  style={{
                    flex: 1,
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    fontSize: 14,
                    color: "#0f172a",
                  }}
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search"
                    style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "inline-flex" }}
                  >
                    <X size={14} color="#94a3b8" />
                  </button>
                ) : null}
              </div>

              <SectionLabel>Sort by</SectionLabel>
              <ChipGroup>
                {SORT_OPTIONS.map((o) => (
                  <SheetChip key={o.value} active={sortBy === o.value} onClick={() => setSortBy(o.value)}>
                    {o.label}
                  </SheetChip>
                ))}
              </ChipGroup>

              <SectionLabel>Categories</SectionLabel>
              {availableCategories.length === 0 ? (
                <p style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>No categories yet.</p>
              ) : (
                <ChipGroup>
                  {availableCategories.map((c) => {
                    const active = selectedCategoryIds.includes(c.id);
                    const colour = c.color || "#94a3b8";
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCategory(c.id)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "7px 12px",
                          borderRadius: 999,
                          background: active ? colour : "#fff",
                          border: `1px solid ${active ? colour : "#e5e7eb"}`,
                          color: active ? "#fff" : "#475569",
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: 4,
                            background: active ? "#fff" : colour,
                            display: "inline-block",
                          }}
                        />
                        {c.nameEn || c.name || "—"}
                      </button>
                    );
                  })}
                </ChipGroup>
              )}

              <SectionLabel>Date range</SectionLabel>
              <ChipGroup>
                {DATE_OPTIONS.map((o) => (
                  <SheetChip key={o.value} active={dateRange === o.value} onClick={() => setDateRange(o.value)}>
                    {o.label}
                  </SheetChip>
                ))}
              </ChipGroup>

              <SectionLabel>Featured image</SectionLabel>
              <ChipGroup>
                {PHOTO_OPTIONS.map((o) => (
                  <SheetChip key={o.value} active={photoFilter === o.value} onClick={() => setPhotoFilter(o.value)}>
                    {o.label}
                  </SheetChip>
                ))}
              </ChipGroup>
            </div>

            <div style={{ display: "flex", gap: 10, padding: "12px 20px 0", borderTop: "1px solid #f1f5f9" }}>
              <button
                type="button"
                onClick={clearAll}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: 12,
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  color: "#475569",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                style={{
                  flex: 2,
                  padding: 14,
                  borderRadius: 12,
                  background: "#FF2C2C",
                  border: "none",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style>{`
        .rep-chip-rail::-webkit-scrollbar { display: none; }
      `}</style>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 12,
        fontWeight: 800,
        color: "#64748b",
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginTop: 16,
        marginBottom: 8,
      }}
    >
      {children}
    </p>
  );
}

function ChipGroup({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{children}</div>;
}

function SheetChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "7px 12px",
        borderRadius: 999,
        background: active ? "#FF2C2C" : "#fff",
        border: `1px solid ${active ? "#FF2C2C" : "#e5e7eb"}`,
        color: active ? "#fff" : "#475569",
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
