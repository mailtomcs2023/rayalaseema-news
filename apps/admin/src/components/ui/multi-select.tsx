"use client";

// Multi-select dropdown - same shape + UX as the wds-shadcn-registry
// component (https://wds-shadcn-registry.netlify.app/components/multi-select/)
// but built on the primitives this app already has (Popover + Checkbox)
// so we don't pull in `cmdk` for one widget.
//
// API:
//   <MultiSelect
//     options={[{ value, label, color? }]}
//     value={selected}
//     onChange={setSelected}
//     placeholder="Select categories..."
//   />
//
// Trigger shows selected items as removable pills (up to `maxDisplay`,
// then a "+N more" pill). Click → Popover with a search filter + scrollable
// checkbox list + Select all / Clear. Keyboard: Tab to open, Esc to close.

import * as React from "react";
import { Check, ChevronsUpDown, X, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
  // Optional colour used for the pill border + dot. Falls back to muted grey.
  color?: string | null;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  // How many selected-item pills to show in the trigger before collapsing
  // the rest into a "+N more" overflow pill. 0 disables (always shows count).
  maxDisplay?: number;
  className?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  maxDisplay = 3,
  className,
  disabled,
  "aria-invalid": ariaInvalid,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const selected = React.useMemo(
    () => options.filter((o) => value.includes(o.value)),
    [options, value],
  );

  // Pre-built map for O(1) lookups when rendering pills + checkbox rows.
  const isSelected = (val: string) => value.includes(val);

  const toggle = (val: string) => {
    onChange(isSelected(val) ? value.filter((v) => v !== val) : [...value, val]);
  };

  const removeOne = (val: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter((v) => v !== val));
  };

  const clearAll = () => onChange([]);
  const selectAll = () => onChange(options.map((o) => o.value));

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const overflow = Math.max(0, selected.length - maxDisplay);
  const visiblePills = maxDisplay > 0 ? selected.slice(0, maxDisplay) : [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-invalid={ariaInvalid}
          aria-expanded={open}
          aria-haspopup="listbox"
          className={cn(
            // Trigger styled like shadcn's Input - same border/ring, but
            // multiline-friendly so wrapped pills don't get clipped.
            "flex w-full min-h-9 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "hover:bg-accent/30",
            className,
          )}
        >
          <div className="flex flex-1 flex-wrap items-center gap-1">
            {selected.length === 0 && (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            {visiblePills.map((o) => (
              <span
                key={o.value}
                className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-xs font-medium"
                style={o.color ? { borderColor: `${o.color}55`, color: o.color } : undefined}
                onClick={(e) => e.stopPropagation()}
              >
                <span
                  className="inline-block size-1.5 rounded-full"
                  style={{ background: o.color || "#9ca3af" }}
                />
                {o.label}
                <span
                  role="button"
                  aria-label={`Remove ${o.label}`}
                  className="ml-0.5 -mr-0.5 grid size-3.5 place-items-center rounded hover:bg-muted"
                  onClick={(e) => removeOne(o.value, e)}
                >
                  <X className="size-3" />
                </span>
              </span>
            ))}
            {overflow > 0 && (
              <span className="inline-flex items-center rounded-md border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                +{overflow} more
              </span>
            )}
          </div>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
        onOpenAutoFocus={(e) => {
          // Move focus into the search input on open so typing filters
          // immediately, without the trigger keeping focus.
          e.preventDefault();
          const target = e.currentTarget as HTMLElement | null;
          target?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
        }}
      >
        {/* Search header */}
        <div className="flex items-center border-b px-2.5">
          <Search className="size-4 shrink-0 opacity-50" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex h-9 w-full bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Bulk actions */}
        <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5 text-xs">
          <span className="text-muted-foreground">
            {value.length} of {options.length} selected
          </span>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={selectAll}
              disabled={value.length === options.length}
            >
              Select all
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={clearAll}
              disabled={value.length === 0}
            >
              Clear
            </Button>
          </div>
        </div>

        {/* Options list */}
        <div
          className="max-h-64 overflow-y-auto p-1"
          onWheel={(e) => {
            // When the popover is nested inside a Dialog, react-remove-scroll
            // swallows wheel events on portaled siblings - drag-scroll on the
            // scrollbar works but the mouse wheel doesn't. Scroll manually.
            e.currentTarget.scrollTop += e.deltaY;
          }}
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matches for &ldquo;{query}&rdquo;
            </p>
          ) : (
            filtered.map((o) => {
              const checked = isSelected(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
                    "hover:bg-accent focus-visible:bg-accent",
                    checked && "bg-accent/40",
                  )}
                >
                  <Checkbox checked={checked} className="pointer-events-none" />
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ background: o.color || "#9ca3af" }}
                  />
                  <span className="flex-1 text-left">{o.label}</span>
                  {checked && <Check className="size-3.5 text-primary opacity-80" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
