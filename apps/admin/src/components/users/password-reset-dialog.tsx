"use client";

// Admin password-reset dialog. Opens from the /users row dropdown for any
// user. Two-step flow:
//   1. Admin types a password (or hits Generate) + chooses one-time vs
//      permanent, then submits.
//   2. Backend returns the password just set; we surface it once so the
//      admin can copy/relay it.
//
// Two backend paths depending on role:
//   - REPORTER (has reporterProfileId) → /api/reporters POST action=reset-
//     password. Server can generate one if `customPassword` is omitted.
//   - All other roles (ADMIN / EDITOR / SUB_EDITOR / USER) → /api/users/[id]
//     PUT with { password, mustChangePassword }. The users PUT doesn't have
//     a "server-side generate" mode, so when the admin leaves the field
//     blank we generate locally with makeStrongPassword() and pass it
//     through.
//
// One-time mode flips User.mustChangePassword=true so the user is forced
// through /change-password on next sign-in. Uncheck for a permanent reset
// (rare - usually only when the admin has already shared the password
// over a secure channel).

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SlimUser {
  id: string;
  name: string;
  email: string;
  // Reporter profile id - when present we use the reporter endpoint (which
  // also handles bank-account / KYC side effects). When absent (Admin /
  // Editor / Sub-Editor / User accounts), we fall through to the generic
  // /api/users/[id] PUT path.
  reporterProfileId?: string | null;
}

export function PasswordResetDialog({
  user,
  onClose,
}: {
  user: SlimUser | null;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [oneTime, setOneTime] = useState(true);
  const [busy, setBusy] = useState(false);
  const [resultPassword, setResultPassword] = useState("");
  const [error, setError] = useState("");

  // Fresh state each time a different user opens the dialog.
  useEffect(() => {
    setPassword("");
    setOneTime(true);
    setResultPassword("");
    setError("");
    setBusy(false);
  }, [user?.id]);

  const generate = () => {
    setPassword(makeStrongPassword());
    setError("");
  };

  const submit = async () => {
    if (!user) return;
    if (password && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      let finalPassword = "";

      if (user.reporterProfileId) {
        // Reporter - server-side generate when blank, customPassword overrides.
        const res = await fetch("/api/reporters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileId: user.reporterProfileId,
            action: "reset-password",
            customPassword: password || undefined,
            oneTime,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Reset failed");
          return;
        }
        finalPassword = data.password || data.tempPassword || "";
      } else {
        // Admin / Editor / Sub-Editor / User - go through the generic users
        // PUT, generating a password client-side if the admin left it blank.
        finalPassword = password || makeStrongPassword();
        const res = await fetch(`/api/users/${user.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            password: finalPassword,
            mustChangePassword: oneTime,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || `Reset failed (HTTP ${res.status})`);
          return;
        }
      }

      setResultPassword(finalPassword);
      toast.success("Password reset.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  const done = !!resultPassword;

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        {user && (
          <>
            <DialogHeader>
              <DialogTitle>Reset password</DialogTitle>
              <DialogDescription>
                Set a new password for <span className="font-semibold">{user.name}</span>.
              </DialogDescription>
            </DialogHeader>

            {!done ? (
              <>
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs" htmlFor="rp-password">New password</Label>
                    <div className="mt-1 flex gap-2">
                      <Input
                        id="rp-password"
                        type="text"
                        placeholder="Type or click Generate"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setError(""); }}
                        autoComplete="new-password"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        disabled={busy}
                      />
                      <Button type="button" variant="outline" onClick={generate} disabled={busy}>
                        Generate
                      </Button>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Leave blank to let the system generate one for you.
                    </p>
                    {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
                  </div>

                  <label className="flex cursor-pointer items-start gap-2">
                    <Checkbox
                      checked={oneTime}
                      onCheckedChange={(v) => setOneTime(v === true)}
                      className="mt-0.5"
                      disabled={busy}
                    />
                    <div className="text-sm leading-tight">
                      <p className="font-semibold">Require password change at next sign-in</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        User must replace this one-time password the first time they log in.
                        Uncheck for a permanent password.
                      </p>
                    </div>
                  </label>
                </div>

                <DialogFooter className="mt-2">
                  <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
                  <Button onClick={submit} disabled={busy}>
                    {busy ? "Resetting…" : "Reset password"}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
                  <p className="mb-2 text-[11px] font-bold text-amber-800">
                    {oneTime
                      ? "One-time password - they must change it at next sign-in."
                      : "New password set."}
                  </p>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={resultPassword}
                      onFocus={(e) => e.currentTarget.select()}
                      className="font-mono tracking-wide"
                      aria-label="Generated password"
                    />
                    <Button
                      variant="outline"
                      onClick={() => navigator.clipboard?.writeText(resultPassword)}
                    >
                      Copy
                    </Button>
                  </div>
                  <p className="mt-2 text-[11px] text-amber-700">
                    Share it with the user. It won&apos;t be shown again.
                  </p>
                </div>
                <DialogFooter className="mt-2">
                  <Button onClick={onClose}>Done</Button>
                </DialogFooter>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function makeStrongPassword(length = 14): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*-_=+";
  const all = upper + lower + digits + symbols;
  const pickFrom = (s: string) => s[Math.floor(Math.random() * s.length)];
  const seeded = [pickFrom(upper), pickFrom(lower), pickFrom(digits), pickFrom(symbols)];
  while (seeded.length < length) seeded.push(pickFrom(all));
  return seeded.sort(() => Math.random() - 0.5).join("");
}
