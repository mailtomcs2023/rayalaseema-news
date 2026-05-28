"use client";

import * as React from "react";
import { CalendarIcon, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Parse "YYYY-MM-DDTHH:MM" as a *local* Date (no timezone shift). Matches
// the format produced by <input type="datetime-local"> so this component
// is a drop-in replacement.
function parseLocal(s?: string): Date | undefined {
  if (!s) return undefined;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const [, y, mo, d, h, mi] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
}

function toLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDisplay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Shadcn date+time picker - drop-in replacement for `<input type="datetime-local">`.
 * Value is a "YYYY-MM-DDTHH:MM" local-time string (no timezone). Pass `""` to
 * clear. `onChange("")` fires when the user clicks Clear.
 */
export function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick date & time",
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const parsed = parseLocal(value);

  // Hour / minute inputs are kept as local strings so the user can clear
  // a field while typing without us snapping to "0" mid-edit. We commit
  // back into `value` on blur (or when the calendar day changes).
  const [hour, setHour] = React.useState(parsed ? String(parsed.getHours()).padStart(2, "0") : "");
  const [minute, setMinute] = React.useState(parsed ? String(parsed.getMinutes()).padStart(2, "0") : "");

  // Keep local input state in sync when the parent value changes externally
  // (e.g. reset by a form, or hydrated after a fetch).
  React.useEffect(() => {
    const p = parseLocal(value);
    if (p) {
      setHour(String(p.getHours()).padStart(2, "0"));
      setMinute(String(p.getMinutes()).padStart(2, "0"));
    } else {
      setHour("");
      setMinute("");
    }
  }, [value]);

  const commit = (next: Date) => {
    onChange(toLocal(next));
  };

  const onDateSelect = (d: Date) => {
    // Keep current H:M when changing the calendar day; default to 00:00
    // if nothing was set yet. Parens are required when mixing ?? and ||.
    const h = parsed?.getHours() ?? (Number(hour) || 0);
    const m = parsed?.getMinutes() ?? (Number(minute) || 0);
    commit(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m));
  };

  const commitTime = () => {
    if (!parsed) return; // no date picked yet - time edits ignored
    const h = Math.min(23, Math.max(0, Number(hour) || 0));
    const m = Math.min(59, Math.max(0, Number(minute) || 0));
    commit(new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), h, m));
  };

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
          <span className="truncate">{parsed ? formatDisplay(parsed) : placeholder}</span>
          {value && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange("");
                }
              }}
              className="ml-auto inline-flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted"
            >
              <X className="size-3.5 opacity-70" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar selected={parsed} onSelect={onDateSelect} />
        <div className="flex items-center gap-2 border-t p-3">
          <span className="text-xs font-medium text-muted-foreground">Time</span>
          <Input
            type="text"
            inputMode="numeric"
            value={hour}
            onChange={(e) => setHour(e.target.value.replace(/\D/g, "").slice(0, 2))}
            onBlur={commitTime}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitTime(); } }}
            disabled={!parsed}
            placeholder="HH"
            className="h-8 w-14 text-center tabular-nums"
          />
          <span className="text-sm font-medium text-muted-foreground">:</span>
          <Input
            type="text"
            inputMode="numeric"
            value={minute}
            onChange={(e) => setMinute(e.target.value.replace(/\D/g, "").slice(0, 2))}
            onBlur={commitTime}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitTime(); } }}
            disabled={!parsed}
            placeholder="MM"
            className="h-8 w-14 text-center tabular-nums"
          />
          <div className="ml-auto flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => {
                const now = new Date();
                commit(now);
              }}
            >
              Now
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => {
                commitTime();
                setOpen(false);
              }}
            >
              Done
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
