// Self-serve password change. Forced flow when User.mustChangePassword
// is true (admin issued a temp password); also reachable from profile /
// settings via direct link.
//
// Mounted inside the (dashboard) group so the sidebar still renders -
// the user can sign out but can't navigate elsewhere until they finish
// (the dashboard root redirect re-fires until mustChangePassword flips
// to false).
"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound, LogOut, ShieldAlert } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function ChangePasswordPage() {
  const { data: session } = useSession();
  const mustChange = !!(session?.user as any)?.mustChangePassword;
  const role = (session?.user as any)?.role as string | undefined;
  const isReporter = role === "REPORTER";

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  // Refresh the session after a successful change so client-side reads of
  // `session.user.mustChangePassword` see the cleared flag without a full
  // page reload. Not strictly required (the server redirect chain re-
  // checks the DB), but stops a transient "forced" banner flicker.
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    // Light client-side sanity. Server is the authority via Zod.
    const local: Record<string, string[]> = {};
    if (!current) local.currentPassword = ["Current password is required"];
    if (next.length < 8) local.newPassword = ["Must be at least 8 characters"];
    if (next !== confirm) local.confirmPassword = ["Passwords don't match"];
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) setErrors(data.fieldErrors);
        toast.error(data.error || "Could not change password");
        setSubmitting(false);
        return;
      }
      toast.success("Password updated.");
      // Hard navigation triggers a fresh server request. The root layout
      // reads mustChangePassword from the DB (not the JWT), sees it's
      // false now, and falls through to the regular role-based routing -
      // REPORTERs land on /reporter, admins on /, etc. No JWT refresh
      // needed.
      window.location.assign("/");
    } catch (e: any) {
      toast.error(e?.message || "Could not change password");
      setSubmitting(false);
    }
  };

  // Lockdown layout: no sidebar/tab nav. Two header variants so the
  // chrome matches the portal the user expects:
  //   - REPORTER → red rounded banner from the reporter web shell (no tab
  //     bar / FAB, since the forced flow blocks navigation anyway)
  //   - everyone else → neutral white bar with the admin logo
  // The only escape hatch is "Sign out".
  return (
    <div
      className="shadcn-scope"
      style={{ minHeight: "100vh", background: "#f3f4f6", display: "flex", flexDirection: "column" }}
    >
      {isReporter ? (
        <header
          style={{
            background: "#FF2C2C",
            padding: "18px 20px",
            borderBottomLeftRadius: 20,
            borderBottomRightRadius: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-inverse.svg" alt="Rayalaseema News" style={{ height: 32, display: "block" }} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="gap-1.5 bg-white/15 text-white hover:bg-white/25 hover:text-white"
          >
            <LogOut size={14} /> Sign out
          </Button>
        </header>
      ) : (
        <header className="flex items-center justify-between border-b border-border bg-white px-6 py-3">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Rayalaseema News" style={{ height: 32, width: "auto" }} />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="gap-1.5"
          >
            <LogOut size={14} /> Sign out
          </Button>
        </header>
      )}

      <main className="flex flex-1 items-start justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <header className="mb-6 flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700">
              <KeyRound size={20} />
            </span>
            <div>
              <h1 className="text-2xl font-extrabold text-foreground">
                {mustChange ? "Set a new password" : "Change password"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {mustChange
                  ? "Your account was created with a temporary password. Pick a permanent one to continue."
                  : "Update your sign-in password. You'll stay signed in on this device."}
              </p>
            </div>
          </header>

          {mustChange && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" />
              <p>
                You can't access other pages until you change your password.
                If your admin shared the temp password over WhatsApp / email,
                that message should be deleted after this step.
              </p>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4 rounded-md border border-border bg-white p-5">
            <Field
              id="current"
              label="Current password"
              value={current}
              onChange={setCurrent}
              autoComplete="current-password"
              errors={errors.currentPassword}
            />
            <Field
              id="next"
              label="New password"
              value={next}
              onChange={setNext}
              autoComplete="new-password"
              errors={errors.newPassword}
              hint="At least 8 characters, including uppercase, lowercase, and a digit."
            />
            <Field
              id="confirm"
              label="Confirm new password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              errors={errors.confirmPassword}
            />
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Updating…" : "Update password"}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}

function Field({
  id, label, value, onChange, autoComplete, errors, hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  errors?: string[];
  hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          aria-invalid={!!errors?.length}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          tabIndex={-1}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {errors?.length ? (
        <p className="text-xs text-destructive">{errors[0]}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
