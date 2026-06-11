"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Parse / format a "YYYY-MM-DD" string as a *local* date (no timezone shift).
function parseISO(s?: string): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : undefined;
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * shadcn date picker - a drop-in replacement for <input type="date">.
 * `value` / `onChange` use a "YYYY-MM-DD" string, same as a native date input.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  fromYear,
  toYear,
  max,
  min,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  fromYear?: number;
  toYear?: number;
  /** Latest selectable date as "YYYY-MM-DD" (inclusive). */
  max?: string;
  /** Earliest selectable date as "YYYY-MM-DD" (inclusive). */
  min?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const date = parseISO(value);
  const maxDate = parseISO(max);
  const minDate = parseISO(min);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start gap-2 font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="size-4 shrink-0 opacity-70" />
          {date ? `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}` : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          selected={date}
          fromYear={fromYear}
          toYear={toYear}
          maxDate={maxDate}
          minDate={minDate}
          onSelect={(d) => {
            onChange(toISO(d));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
