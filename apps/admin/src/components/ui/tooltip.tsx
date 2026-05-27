"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

// Shadcn-style Radix Tooltip wrapper.
//
// Usage pattern:
//   <Tooltip>
//     <TooltipTrigger asChild>
//       <button>...</button>
//     </TooltipTrigger>
//     <TooltipContent>Tooltip text</TooltipContent>
//   </Tooltip>
//
// A single <TooltipProvider delayDuration={...}> at the app root is enough —
// all Tooltip instances inherit from it. We mount one in `app/providers.tsx`.
//
// Prefer this over the native HTML `title` attribute everywhere in JSX:
// `title` styling is OS-controlled, doesn't appear on touch devices, and has
// a long ~700ms appearance delay we can't override.

function TooltipProvider({
  delayDuration = 200,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger(
  props: React.ComponentProps<typeof TooltipPrimitive.Trigger>,
) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 max-w-xs rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-md",
          "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          "whitespace-pre-line break-words",
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="fill-foreground" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

// Convenience wrapper for the common "swap a `title=` attribute for a real
// tooltip" migration. Renders the child unchanged when `text` is empty, so
// it's drop-in safe at sites where the original title was a conditional
// expression that could resolve to an empty string.
function WithTooltip({
  text,
  side,
  children,
}: {
  text?: string | null;
  side?: "top" | "right" | "bottom" | "left";
  children: React.ReactElement;
}) {
  if (!text) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{text}</TooltipContent>
    </Tooltip>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, WithTooltip };
