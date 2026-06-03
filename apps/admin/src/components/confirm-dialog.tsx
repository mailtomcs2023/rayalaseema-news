"use client";

// App-wide replacement for the native window.confirm() / window.prompt().
//
//   import { confirm, prompt } from "@/components/confirm-dialog";
//   if (!(await confirm({ title: "Delete this?", destructive: true }))) return;
//   const name = await prompt({ title: "Page label", defaultValue: "Blank page" });
//
// A single <ConfirmDialogHost /> is mounted once in providers.tsx. The imperative
// confirm()/prompt() helpers enqueue a request and resolve a Promise when the
// user answers - so call sites read almost exactly like the old globals, just
// awaited. Until the host mounts we fall back to the native dialog so nothing
// silently no-ops (e.g. during the very first paint).

import * as React from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** Render the confirm button in destructive (red) styling. */
  destructive?: boolean;
}

export interface PromptOptions {
  title: string;
  description?: React.ReactNode;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  /** Disable the OK button until the field is non-empty. */
  required?: boolean;
  /** Use a multi-line <textarea> instead of a single-line input. */
  multiline?: boolean;
}

type ConfirmRequest = {
  kind: "confirm";
  opts: ConfirmOptions;
  resolve: (v: boolean) => void;
  settled?: boolean;
};
type PromptRequest = {
  kind: "prompt";
  opts: PromptOptions;
  resolve: (v: string | null) => void;
  settled?: boolean;
};
type Request = ConfirmRequest | PromptRequest;

// Registered by the host on mount. Null before mount -> native fallback.
let enqueue: ((req: Request) => void) | null = null;

export function confirm(opts: ConfirmOptions | string): Promise<boolean> {
  const o: ConfirmOptions = typeof opts === "string" ? { title: opts } : opts;
  if (!enqueue) {
    const desc = typeof o.description === "string" ? o.description : "";
    const msg = desc ? `${o.title}\n\n${desc}` : o.title;
    return Promise.resolve(typeof window !== "undefined" ? window.confirm(msg) : false);
  }
  return new Promise((resolve) => enqueue!({ kind: "confirm", opts: o, resolve }));
}

export function prompt(opts: PromptOptions | string, defaultValue = ""): Promise<string | null> {
  const o: PromptOptions = typeof opts === "string" ? { title: opts, defaultValue } : opts;
  if (!enqueue) {
    return Promise.resolve(
      typeof window !== "undefined" ? window.prompt(o.title, o.defaultValue ?? "") : null,
    );
  }
  return new Promise((resolve) => enqueue!({ kind: "prompt", opts: o, resolve }));
}

export function ConfirmDialogHost() {
  const [queue, setQueue] = React.useState<Request[]>([]);
  const current = queue[0] ?? null;
  const [value, setValue] = React.useState("");

  React.useEffect(() => {
    enqueue = (req) => setQueue((q) => [...q, req]);
    return () => {
      enqueue = null;
    };
  }, []);

  // Seed the input whenever a new prompt reaches the head of the queue.
  React.useEffect(() => {
    if (current?.kind === "prompt") setValue(current.opts.defaultValue ?? "");
  }, [current]);

  // Idempotent: button clicks AND the radix onOpenChange(false) both route here
  // when a dialog closes, so guard against settling/popping the same request
  // twice (which would drop the next queued request).
  function finish(req: Request | null, result: boolean | string | null) {
    if (!req || req.settled) return;
    req.settled = true;
    (req.resolve as (v: boolean | string | null) => void)(result);
    setQueue((q) => q.filter((r) => r !== req));
  }

  const confirmReq = current?.kind === "confirm" ? current : null;
  const promptReq = current?.kind === "prompt" ? current : null;

  return (
    <>
      <AlertDialog
        open={!!confirmReq}
        onOpenChange={(open) => {
          if (!open) finish(confirmReq, false);
        }}
      >
        {confirmReq && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmReq.opts.title}</AlertDialogTitle>
              {confirmReq.opts.description ? (
                <AlertDialogDescription>{confirmReq.opts.description}</AlertDialogDescription>
              ) : null}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => finish(confirmReq, false)}>
                {confirmReq.opts.cancelText ?? "Cancel"}
              </AlertDialogCancel>
              <AlertDialogAction
                className={
                  confirmReq.opts.destructive
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    : undefined
                }
                onClick={() => finish(confirmReq, true)}
              >
                {confirmReq.opts.confirmText ?? "Confirm"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>

      <Dialog
        open={!!promptReq}
        onOpenChange={(open) => {
          if (!open) finish(promptReq, null);
        }}
      >
        {promptReq && (
          <DialogContent className="sm:max-w-md">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (promptReq.opts.required && !value.trim()) return;
                finish(promptReq, value);
              }}
            >
              <DialogHeader>
                <DialogTitle>{promptReq.opts.title}</DialogTitle>
                {promptReq.opts.description ? (
                  <DialogDescription>{promptReq.opts.description}</DialogDescription>
                ) : null}
              </DialogHeader>
              <div className="py-4">
                {promptReq.opts.multiline ? (
                  <Textarea
                    autoFocus
                    rows={3}
                    value={value}
                    placeholder={promptReq.opts.placeholder}
                    onChange={(e) => setValue(e.target.value)}
                  />
                ) : (
                  <Input
                    autoFocus
                    value={value}
                    placeholder={promptReq.opts.placeholder}
                    onChange={(e) => setValue(e.target.value)}
                  />
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => finish(promptReq, null)}>
                  {promptReq.opts.cancelText ?? "Cancel"}
                </Button>
                <Button type="submit" disabled={promptReq.opts.required && !value.trim()}>
                  {promptReq.opts.confirmText ?? "OK"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
