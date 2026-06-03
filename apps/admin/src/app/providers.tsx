"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmDialogHost } from "@/components/confirm-dialog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({
  children,
  session,
}: {
  children: React.ReactNode;
  // Server-resolved session passed through from RootLayout. When present,
  // useSession() returns it on the very first client render - no `loading`
  // state, no sidebar flash, no auth-aware components rendering twice.
  session: Session | null;
}) {
  // One QueryClient per browser session, created lazily so SSR + the first
  // client render share the same instance. Defaults tuned for an editorial
  // CMS: data is fresh for 30s (categories, taxonomy lists change rarely),
  // background refetch on window focus is off (editors hate seeing tables
  // shuffle while they work), and 1 retry on network errors.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );
  return (
    <SessionProvider session={session}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          {children}
          {/* Single app-wide sonner mount - any client component can call
              `toast.success(...)` etc. and have it show up here. Top-right
              with rich colors matches the admin's other notification chrome. */}
          <Toaster position="bottom-right" richColors closeButton />
          {/* App-wide promise-based confirm()/prompt() host - replaces the
              native browser dialogs. Any client component can import
              { confirm, prompt } from "@/components/confirm-dialog". */}
          <ConfirmDialogHost />
        </TooltipProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
