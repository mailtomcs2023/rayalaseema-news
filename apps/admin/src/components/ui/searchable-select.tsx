"use client";

// Searchable Select - a shadcn-styled combobox built on Popover + a plain
// filterable list. Use this anywhere we'd reach for a long-list <Select>:
// the search input lets users jump to an option by typing any part of its
// label, ↑/↓ moves the highlight, Enter selects, Esc closes.
//
// Why not cmdk? It isn't a dep on this project and a 60-line filter is
// enough for the kind of lists we have (~30 districts, ~7 categories,
// ~150 constituencies).

import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface SearchableOption {
  value: string;
  label: string;
  /** Optional secondary text appended in muted style, also matched against search. */
  sublabel?: string;
}

interface SearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableOption[];
  /** Visible when no value is selected and no custom empty entry exists. */
  placeholder?: string;
  /** If provided, a synthetic "clear" entry with value "" appears at the top of the list. */
  emptyLabel?: string;
  searchPlaceholder?: string;
  noResultsLabel?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  emptyLabel,
  searchPlaceholder = "Search…",
  noResultsLabel = "No matches",
  id,
  className,
  disabled,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [highlightIndex, setHighlightIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  // Filtered list. The "none" entry (when emptyLabel is set) only shows when
  // the search is blank - once the user starts typing they're looking for a
  // real option, not the clear-all sentinel.
  const filtered = React.useMemo<SearchableOption[]>(() => {
    const q = query.trim().toLowerCase();
    const realMatches = q
      ? options.filter(
          (o) =>
            o.label.toLowerCase().includes(q) ||
            (o.sublabel?.toLowerCase().includes(q) ?? false),
        )
      : options;
    if (!q && emptyLabel !== undefined) {
      return [{ value: "", label: emptyLabel }, ...realMatches];
    }
    return realMatches;
  }, [options, query, emptyLabel]);

  // Reset query + cursor on every open; focus the search input.
  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    setHighlightIndex(0);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  // Keep highlighted row in view while arrow-keying through a long list.
  React.useEffect(() => {
    if (!open) return;
    const item = listRef.current?.querySelector<HTMLDivElement>(
      `[data-index="${highlightIndex}"]`,
    );
    item?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, open]);

  const handleSelect = (opt: SearchableOption) => {
    onValueChange(opt.value);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[highlightIndex];
      if (opt) handleSelect(opt);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Home") {
      e.preventDefault();
      setHighlightIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHighlightIndex(Math.max(filtered.length - 1, 0));
    }
  };

  // Label to show in the trigger.
  const currentLabel: string = (() => {
    if (!value) return emptyLabel ?? placeholder;
    const found = options.find((o) => o.value === value);
    return found?.label ?? placeholder;
  })();
  const showAsMuted = !value && emptyLabel === undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            showAsMuted && "text-muted-foreground",
            className,
          )}
        >
          <span className="line-clamp-1">{currentLabel}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="p-0"
        style={{ width: "var(--radix-popover-trigger-width)" }}
      >
        <div className="flex items-center border-b px-3">
          <Search aria-hidden="true" className="mr-2 h-4 w-4 opacity-50" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlightIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="flex h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div
          ref={listRef}
          role="listbox"
          className="max-h-64 overflow-y-auto p-1"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              {noResultsLabel}
            </div>
          ) : (
            filtered.map((opt, i) => {
              const isHighlighted = i === highlightIndex;
              const isSelected = opt.value === value;
              return (
                <div
                  key={opt.value || "__empty__"}
                  role="option"
                  aria-selected={isSelected}
                  data-index={i}
                  onMouseEnter={() => setHighlightIndex(i)}
                  onMouseDown={(e) => {
                    // Prevent the input's blur (which would close the popover
                    // before onClick fires).
                    e.preventDefault();
                  }}
                  onClick={() => handleSelect(opt)}
                  className={cn(
                    "flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                    isHighlighted && "bg-accent text-accent-foreground",
                  )}
                >
                  <Check
                    aria-hidden="true"
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isSelected ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="line-clamp-1">
                    {opt.label}
                    {opt.sublabel ? (
                      <span className="ml-1 text-muted-foreground">{opt.sublabel}</span>
                    ) : null}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
