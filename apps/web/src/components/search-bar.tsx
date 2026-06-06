"use client";

import { useEffect, useId, useRef } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";

interface SearchBarProps {
  open: boolean;
  onClose: () => void;
}

// Top-of-page search panel. Smooth reveal via plain CSS
// grid-template-rows transition (0fr → 1fr animates height with NO
// JS animation lib) — previously used framer-motion at ~75KB per
// page just for this collapsible. Form submits on Enter to /search?q=…
export function SearchBar({ open, onClose }: SearchBarProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // Esc closes - only listen while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Autofocus after the reveal has begun so the caret doesn't jump
  // mid-animation. Delay roughly matches the CSS transition (450ms)
  // so focus settles after the height anim finishes.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 280);
    return () => clearTimeout(t);
  }, [open]);

  return (
    <div
      // `inert` (Chrome 102+, Safari 15.5+, Firefox 112+) removes the
      // panel from the focus order AND the a11y tree while collapsed,
      // without ripping it from the DOM. Using aria-hidden + focusable
      // descendants was the PSI a11y flag: aria-hidden hides the panel
      // from screen readers but leaves the input + close button in the
      // tab order, which contradicts the aria-hidden state. inert
      // solves both at once.
      inert={!open ? "" : undefined}
      className={`rsn-search-panel${open ? " rsn-search-panel--open" : ""} border-b`}
    >
      <div className="rsn-search-inner">
        <div className="container-news py-4">
          <form
            action="/search"
            method="GET"
            className="mx-auto w-full max-w-2xl space-y-2"
          >
            <Label htmlFor={id} className="sr-only">
              వార్తలు వెతకండి
            </Label>
            <InputGroup className="h-10!">
              <InputGroupAddon>
                <SearchIcon className="size-4" />
                <span className="sr-only">Search</span>
              </InputGroupAddon>
              <InputGroupInput
                ref={inputRef}
                id={id}
                name="q"
                type="search"
                placeholder="వార్తలు వెతకండి... (Telugu or English)"
                autoComplete="off"
                className="h-10! py-0! [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none"
              />
              <InputGroupAddon align="inline-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="text-muted-foreground hover:bg-transparent"
                  aria-label="Close search"
                >
                  <XIcon />
                </Button>
              </InputGroupAddon>
            </InputGroup>
          </form>
        </div>
      </div>
      <style>{`
        .rsn-search-panel {
          background: #fff;
          display: grid;
          grid-template-rows: 0fr;
          opacity: 0;
          pointer-events: none;
          transition: grid-template-rows 450ms cubic-bezier(0.4, 0, 0.2, 1), opacity 250ms ease;
        }
        .rsn-search-panel--open {
          grid-template-rows: 1fr;
          opacity: 1;
          pointer-events: auto;
        }
        .rsn-search-inner {
          overflow: hidden;
          min-height: 0;
        }
      `}</style>
    </div>
  );
}
