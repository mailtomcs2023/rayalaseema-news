"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

// Standalone client component so the reporter profile page (server-rendered)
// can still mount a sign-out action. Uses NextAuth's client-side signOut
// helper which clears the cookie and redirects to /login.
export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      style={{
        width: "100%",
        padding: "12px 16px",
        borderRadius: 12,
        border: "1px solid #fecaca",
        backgroundColor: "#fff",
        color: "#dc2626",
        fontSize: 14,
        fontWeight: 700,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      <LogOut size={16} />
      Sign out
    </button>
  );
}
