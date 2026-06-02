"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

// Standalone client component so the reporter profile page (server-rendered)
// can still mount a sign-out action. Uses NextAuth's client-side signOut
// helper which clears the cookie and redirects to /login.
export function SignOutButton() {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="h-11 w-full gap-2 rounded-xl border-red-200 text-sm font-bold text-red-600 hover:bg-red-50 hover:text-red-700"
    >
      <LogOut size={16} />
      Sign out
    </Button>
  );
}
