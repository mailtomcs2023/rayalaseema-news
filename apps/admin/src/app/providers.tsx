"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({
  children,
  session,
}: {
  children: React.ReactNode;
  // Server-resolved session passed through from RootLayout. When present,
  // useSession() returns it on the very first client render — no `loading`
  // state, no sidebar flash, no auth-aware components rendering twice.
  session: Session | null;
}) {
  return (
    <SessionProvider session={session}>
      <TooltipProvider>{children}</TooltipProvider>
    </SessionProvider>
  );
}
