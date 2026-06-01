"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI_RE = /^[\w.\-]{2,}@[\w.\-]{2,}$/;

type Values = {
  upiId: string;
  bankName: string;
  bankAccount: string;
  bankIfsc: string;
  bankBranch: string;
};

export function BankForm({ initial }: { initial: Values }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(initial);
  const [busy, setBusy] = useState(false);

  const ifscUpper = values.bankIfsc.trim().toUpperCase();
  const ifscInvalid = ifscUpper !== "" && !IFSC_RE.test(ifscUpper);
  const upiTrim = values.upiId.trim();
  const upiInvalid = upiTrim !== "" && !UPI_RE.test(upiTrim);
  const acctDigits = values.bankAccount.replace(/\D/g, "");
  const acctInvalid =
    values.bankAccount.trim() !== "" &&
    (acctDigits.length < 9 || acctDigits.length > 18);

  const trim = (s: string) => s.trim();
  const dirty = (Object.keys(initial) as (keyof Values)[]).some(
    (k) => trim(values[k]) !== trim(initial[k]),
  );

  const set = <K extends keyof Values>(k: K, v: Values[K]) =>
    setValues((s) => ({ ...s, [k]: v }));

  const save = async () => {
    if (upiInvalid) return toast.error("UPI ID format must be like name@bank.");
    if (ifscInvalid)
      return toast.error("IFSC must be 4 letters + 0 + 6 chars (e.g. SBIN0001234).");
    if (acctInvalid) return toast.error("Account number must be 9-18 digits.");

    setBusy(true);
    try {
      const res = await fetch("/api/onboarding/kyc", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upiId: upiTrim || null,
          bankName: trim(values.bankName) || null,
          bankAccount: acctDigits || null,
          bankIfsc: ifscUpper || null,
          bankBranch: trim(values.bankBranch) || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || `Save failed (HTTP ${res.status})`);
        return;
      }
      toast.success("Bank details updated.");
      router.push("/profile");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Label htmlFor="bf-upi" className="text-xs">
          UPI ID
        </Label>
        <Input
          id="bf-upi"
          value={values.upiId}
          onChange={(e) => set("upiId", e.target.value)}
          disabled={busy}
          className="mt-1"
          placeholder="e.g. yourname@okhdfc"
          maxLength={80}
        />
        {upiInvalid && (
          <p className="mt-1 text-xs text-destructive">
            UPI ID format must be like name@bank.
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="bf-bankName" className="text-xs">
          Bank name
        </Label>
        <Input
          id="bf-bankName"
          value={values.bankName}
          onChange={(e) => set("bankName", e.target.value)}
          disabled={busy}
          className="mt-1"
          placeholder="e.g. HDFC Bank"
          maxLength={80}
        />
      </div>

      <div>
        <Label htmlFor="bf-acct" className="text-xs">
          Account number
        </Label>
        <Input
          id="bf-acct"
          value={values.bankAccount}
          onChange={(e) =>
            set("bankAccount", e.target.value.replace(/\D/g, "").slice(0, 18))
          }
          disabled={busy}
          inputMode="numeric"
          className="mt-1"
          placeholder="9-18 digits"
        />
        {acctInvalid && (
          <p className="mt-1 text-xs text-destructive">
            Account number must be 9-18 digits.
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="bf-ifsc" className="text-xs">
          IFSC code
        </Label>
        <Input
          id="bf-ifsc"
          value={values.bankIfsc}
          onChange={(e) =>
            set("bankIfsc", e.target.value.toUpperCase().slice(0, 11))
          }
          disabled={busy}
          className="mt-1"
          placeholder="SBIN0001234"
        />
        {ifscInvalid && (
          <p className="mt-1 text-xs text-destructive">
            IFSC must be 4 letters + 0 + 6 chars (e.g. SBIN0001234).
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="bf-branch" className="text-xs">
          Branch
        </Label>
        <Input
          id="bf-branch"
          value={values.bankBranch}
          onChange={(e) => set("bankBranch", e.target.value)}
          disabled={busy}
          className="mt-1"
          maxLength={80}
        />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="outline" onClick={() => router.push("/profile")} disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={save}
          disabled={busy || !dirty || upiInvalid || ifscInvalid || acctInvalid}
        >
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
