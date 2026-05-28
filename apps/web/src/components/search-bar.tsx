"use client";

import { useEffect, useId, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
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

// Top-of-page search panel. Reveals slowly via framer-motion, then drops
// the canonical Nova `InputGroup` pattern in: SearchIcon addon on the left,
// InputGroupInput in the middle, a ghost icon button on the right for close.
// Form submits on Enter to /search?q=…
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

  // Autofocus after the reveal has begun so the caret doesn't jump mid-animation.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 280);
    return () => clearTimeout(t);
  }, [open]);

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="search-panel"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
          style={{ overflow: "hidden", backgroundColor: "#fff" }}
          className="border-b"
        >
          <motion.div
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ duration: 0.45, delay: 0.12, ease: [0.4, 0, 0.2, 1] }}
            className="container-news py-4"
          >
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
