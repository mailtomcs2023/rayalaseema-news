"use client";
// Press ID card panel - opens from the /users row dropdown. Issues, renews,
// revokes and downloads a user's card. Self-contained: fetches
// /api/press-card?userId= on open.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Dto = {
  id: string; cardNo: string; designation: string; photoUrl: string; validFrom: string; validTill: string;
  liveStatus: "ACTIVE" | "EXPIRED" | "REVOKED" | "SEPARATED"; revokeNote: string | null; verifyUrl: string;
};
type Payload = { card: Dto | null; issuable: { ok: boolean; reason?: string } };

const REASON: Record<string, string> = {
  KYC_NOT_VERIFIED: "KYC must be verified first (Review & documents).",
  NO_PHOTO: "No passport photo on the profile yet.",
  ALREADY_ACTIVE: "User already has an active card.",
};
const CHIP: Record<Dto["liveStatus"], string> = {
  ACTIVE: "bg-green-100 text-green-700 border-green-200",
  EXPIRED: "bg-amber-100 text-amber-700 border-amber-200",
  REVOKED: "bg-red-100 text-red-700 border-red-200",
  SEPARATED: "bg-muted text-muted-foreground border-transparent",
};

export function PressCardDialog({ user, onClose }: { user: { id: string; name: string; role: string } | null; onClose: () => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [designation, setDesignation] = useState("");
  const [revokeNote, setRevokeNote] = useState("");
  // Request-generation guard: prevents a slow GET for user A overwriting
  // `data` after the admin has already closed A and opened user B.
  const gen = useRef(0);

  const load = async () => {
    if (!user) return;
    const my = ++gen.current;
    const res = await fetch(`/api/press-card?userId=${user.id}`);
    if (my !== gen.current) return;
    if (!res.ok) { toast.error("Could not load press card"); return; }
    const p = (await res.json()) as Payload;
    if (my !== gen.current) return;
    setData(p);
    setDesignation(p.card?.designation ?? (user.role === "REPORTER" ? "Reporter / Copy Writer" : ""));
  };
  useEffect(() => { gen.current++; setData(null); setRevokeNote(""); if (user) void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  const call = async (url: string, body?: unknown, okMsg?: string) => {
    setBusy(true);
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(j.error || "Failed"); return; }
      if (okMsg) toast.success(okMsg);
      await load();
    } finally { setBusy(false); }
  };

  const card = data?.card ?? null;
  return (
    <Dialog open={!!user} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Press ID card · {user?.name}</DialogTitle>
          <DialogDescription>Issue, renew or revoke the card. Scanning the printed QR opens the verify page.</DialogDescription>
        </DialogHeader>
        {!data ? <p className="text-sm text-muted-foreground">Loading…</p> : (
          <div className="space-y-4">
            {card && (
              <div className="flex gap-4 rounded-md border p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={card.photoUrl} alt="" className="h-24 w-[72px] rounded object-cover border" />
                <div className="text-sm space-y-1">
                  <div className="flex items-center gap-2"><span className="font-semibold">{card.cardNo}</span><Badge className={CHIP[card.liveStatus]}>{card.liveStatus}</Badge></div>
                  <div>{card.designation}</div>
                  <div className="text-muted-foreground">Valid {card.validFrom} → {card.validTill}</div>
                  {card.revokeNote && <div className="text-red-700">Note: {card.revokeNote}</div>}
                  <a className="text-red-700 underline" href={card.verifyUrl} target="_blank" rel="noreferrer">{card.verifyUrl}</a>
                  <div className="flex gap-2 pt-1">
                    <Button asChild size="sm" variant="outline"><a href={`/api/press-card/${card.id}/pdf`}>Download PDF</a></Button>
                    {card.liveStatus === "ACTIVE" && (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => { if (confirm("Renew for one more year? The old QR stops working and the card must be reprinted.")) void call(`/api/press-card/${card.id}/renew`, undefined, "Card renewed"); }}>Renew</Button>
                    )}
                  </div>
                </div>
              </div>
            )}
            {card && card.liveStatus !== "REVOKED" && (
              <div className="space-y-2 rounded-md border border-red-200 p-3">
                <Label htmlFor="revokeNote">Revoke (reason, required)</Label>
                <Input id="revokeNote" value={revokeNote} onChange={(e) => setRevokeNote(e.target.value)} placeholder="Lost card / left organisation / misuse" />
                <Button size="sm" variant="destructive" disabled={busy || revokeNote.trim().length < 3} onClick={() => void call(`/api/press-card/${card.id}/revoke`, { note: revokeNote }, "Card revoked")}>Revoke card</Button>
              </div>
            )}
            {(!card || card.liveStatus !== "ACTIVE") && (
              <div className="space-y-2 rounded-md border p-3">
                <Label htmlFor="desig">Issue new card · designation</Label>
                <Input id="desig" value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Reporter / Copy Writer" />
                {!data.issuable.ok && <p className="text-xs text-amber-700">{REASON[data.issuable.reason ?? ""] ?? data.issuable.reason}</p>}
                <Button size="sm" disabled={busy || !data.issuable.ok || designation.trim().length < 2} onClick={() => void call("/api/press-card", { userId: user!.id, designation }, "Card issued")}>Issue card (1 year)</Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
