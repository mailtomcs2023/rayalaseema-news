"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { pincodeToDistrict, pincodeToConstituency } from "@/data/pincodes";
import { cn } from "@/lib/utils";

// Same district list the onboarding wizard uses - keep slugs in lock-step.
const DISTRICTS = [
  { slug: "kurnool", label: "Kurnool" },
  { slug: "nandyal", label: "Nandyal" },
  { slug: "ananthapuramu", label: "Anantapur" },
  { slug: "sri-sathya-sai", label: "Sri Sathya Sai" },
  { slug: "ysr-kadapa", label: "YSR Kadapa" },
  { slug: "annamayya", label: "Annamayya" },
  { slug: "tirupati", label: "Tirupati" },
  { slug: "chittoor", label: "Chittoor" },
];

type Values = {
  address: string;
  city: string;
  pincode: string;
  primaryDistrict: string;
};

export function AddressForm({ initial }: { initial: Values }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(initial);
  const [busy, setBusy] = useState(false);
  const [pincodeInfo, setPincodeInfo] = useState<
    { status: "ok" | "outside"; district?: string } | null
  >(null);

  const pincodeInvalid =
    values.pincode.trim() !== "" && !/^\d{6}$/.test(values.pincode.trim());
  const trim = (s: string) => s.trim();
  const dirty = (Object.keys(initial) as (keyof Values)[]).some(
    (k) => trim(values[k]) !== trim(initial[k]),
  );

  const onPincodeChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    if (digits.length < 6) {
      setValues((s) => ({ ...s, pincode: digits }));
      setPincodeInfo(null);
      return;
    }
    const slug = pincodeToDistrict[digits];
    if (slug) {
      const constituency = pincodeToConstituency[digits] || "";
      setValues((s) => ({
        ...s,
        pincode: digits,
        primaryDistrict: slug,
        city: constituency || s.city,
      }));
      setPincodeInfo({ status: "ok", district: slug });
    } else {
      setValues((s) => ({ ...s, pincode: digits }));
      setPincodeInfo({ status: "outside" });
    }
  };

  const save = async () => {
    if (pincodeInvalid) {
      toast.error("Pincode must be 6 digits.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/onboarding/kyc", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: trim(values.address) || null,
          city: trim(values.city) || null,
          pincode: trim(values.pincode) || null,
          primaryDistrict: trim(values.primaryDistrict) || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || `Save failed (HTTP ${res.status})`);
        return;
      }
      toast.success("Address updated.");
      router.push("/profile");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  const districtLabel = (slug: string) =>
    DISTRICTS.find((d) => d.slug === slug)?.label ?? slug;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Label htmlFor="ad-address" className="text-xs">
          Address
        </Label>
        <Textarea
          id="ad-address"
          value={values.address}
          onChange={(e) =>
            setValues((s) => ({ ...s, address: e.target.value }))
          }
          disabled={busy}
          rows={3}
          maxLength={500}
          className="mt-1"
          placeholder="Door no, street, area"
        />
      </div>

      <div>
        <Label htmlFor="ad-pincode" className="text-xs">
          Pincode
        </Label>
        <Input
          id="ad-pincode"
          value={values.pincode}
          onChange={(e) => onPincodeChange(e.target.value)}
          disabled={busy}
          inputMode="numeric"
          maxLength={6}
          className="mt-1"
          placeholder="6 digits"
        />
        {pincodeInvalid && (
          <p className="mt-1 text-xs text-destructive">Pincode must be 6 digits.</p>
        )}
        {pincodeInfo?.status === "ok" && pincodeInfo.district && (
          <p
            className="mt-1 text-xs"
            style={{ color: "#166534", display: "flex", alignItems: "center", gap: 4 }}
          >
            <CheckCircle2 size={12} /> Matched: {districtLabel(pincodeInfo.district)}
          </p>
        )}
        {pincodeInfo?.status === "outside" && (
          <p
            className="mt-1 text-xs"
            style={{ color: "#92400e", display: "flex", alignItems: "center", gap: 4 }}
          >
            <AlertTriangle size={12} /> Pincode is outside the Rayalaseema map - pick a
            district below.
          </p>
        )}
      </div>

      <div>
        <Label className="text-xs">Primary district</Label>
        <div className="mt-2" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {DISTRICTS.map((d) => (
            <Chip
              key={d.slug}
              active={values.primaryDistrict === d.slug}
              disabled={busy}
              onClick={() =>
                setValues((s) => ({
                  ...s,
                  primaryDistrict: s.primaryDistrict === d.slug ? "" : d.slug,
                }))
              }
            >
              {d.label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="ad-city" className="text-xs">
          City / Constituency
        </Label>
        <Input
          id="ad-city"
          value={values.city}
          onChange={(e) => setValues((s) => ({ ...s, city: e.target.value }))}
          disabled={busy}
          maxLength={120}
          className="mt-1"
          placeholder="e.g. Kurnool, Allagadda, Adoni"
        />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="outline" onClick={() => router.push("/profile")} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || !dirty || pincodeInvalid}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function Chip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-[#FF2C2C] bg-[#FF2C2C0F] text-[#FF2C2C]"
          : "border-input bg-background text-foreground hover:bg-muted",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}
