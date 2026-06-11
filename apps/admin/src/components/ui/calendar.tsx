"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const sameDay = (a?: Date, b?: Date) =>
  !!a && !!b &&
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** A self-contained month calendar - no external date library. */
export function Calendar({
  selected,
  onSelect,
  fromYear = 1940,
  toYear = new Date().getFullYear() + 5,
  maxDate,
  minDate,
  className,
}: {
  selected?: Date;
  onSelect: (date: Date) => void;
  fromYear?: number;
  toYear?: number;
  /** Latest selectable day (inclusive). Days after it are disabled. */
  maxDate?: Date;
  /** Earliest selectable day (inclusive). Days before it are disabled. */
  minDate?: Date;
  className?: string;
}) {
  const today = new Date();
  const [view, setView] = React.useState<Date>(() => selected ?? today);
  const year = view.getFullYear();
  const month = view.getMonth();

  // Normalize the bounds to day precision for comparisons.
  const dayOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const maxDay = maxDate ? dayOnly(maxDate) : null;
  const minDay = minDate ? dayOnly(minDate) : null;

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Don't offer years beyond the max bound.
  const effToYear = maxDate ? Math.min(toYear, maxDate.getFullYear()) : toYear;
  const effFromYear = minDate ? Math.max(fromYear, minDate.getFullYear()) : fromYear;
  const years: number[] = [];
  for (let y = effToYear; y >= effFromYear; y--) years.push(y);

  // Disable month navigation past the bounds.
  const nextDisabled = maxDay != null && dayOnly(new Date(year, month + 1, 1)) > maxDay;
  const prevDisabled = minDay != null && dayOnly(new Date(year, month, 0)) < minDay;

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className={cn("w-[17rem] p-3", className)}>
      <div className="mb-2 flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-7 shrink-0"
          disabled={prevDisabled}
          onClick={() => setView(new Date(year, month - 1, 1))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Select value={String(month)} onValueChange={(v) => setView(new Date(year, Number(v), 1))}>
          <SelectTrigger className="h-7 flex-1 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((m, i) => (
              <SelectItem key={m} value={String(i)}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={(v) => setView(new Date(Number(v), month, 1))}>
          <SelectTrigger className="h-7 w-[4.75rem] shrink-0 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-7 shrink-0"
          disabled={nextDisabled}
          onClick={() => setView(new Date(year, month + 1, 1))}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="flex h-8 items-center justify-center text-[0.7rem] font-medium text-muted-foreground"
          >
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={`blank-${i}`} className="h-8 w-8" />;
          const cellDate = new Date(year, month, d);
          const cellDay = cellDate.getTime();
          const outOfRange = (maxDay != null && cellDay > maxDay) || (minDay != null && cellDay < minDay);
          const isSelected = sameDay(cellDate, selected);
          const isToday = sameDay(cellDate, today);
          return (
            <button
              key={d}
              type="button"
              disabled={outOfRange}
              onClick={() => { if (!outOfRange) onSelect(cellDate); }}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                isToday && !isSelected && "bg-accent text-accent-foreground",
                isSelected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                outOfRange && "cursor-not-allowed text-muted-foreground/40 hover:bg-transparent hover:text-muted-foreground/40",
              )}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}
