"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CheckCircle2, XCircle, ShieldAlert, Wallet, Clock, History, X } from "lucide-react";

// Human label for each known field. Mirrors apps/admin/src/lib/profile-fields.ts.
const FIELD_LABEL: Record<string, string> = {
  name: "Name", phone: "Phone",
  fatherName: "Father's Name", dateOfBirth: "Date of Birth", gender: "Gender",
  address: "Address", city: "City", pincode: "Pincode",
  primaryDistrict: "Primary District", secondaryDistricts: "Secondary Districts",
  aadhaarNumber: "Aadhaar Number", aadhaarFrontUrl: "Aadhaar (Front)", aadhaarBackUrl: "Aadhaar (Back)",
  panNumber: "PAN Number", panCardUrl: "PAN Card", idCardUrl: "Press / ID Card",
  photoUrl: "Profile Photo",
  upiId: "UPI ID", bankName: "Bank Name", bankAccount: "Account Number",
  bankIfsc: "IFSC Code", bankBranch: "Branch",
  experience: "Experience", specialization: "Specialization", languages: "Languages",
};

// Per-field "this is critical" flag for the warning banner.
// Mirrors profile-fields.ts critical: "kyc" | "bank".
const KYC_FIELDS = new Set([
  "aadhaarNumber", "panNumber", "aadhaarFrontUrl", "aadhaarBackUrl",
  "panCardUrl", "idCardUrl", "photoUrl",
]);
const BANK_FIELDS = new Set(["upiId", "bankName", "bankAccount", "bankIfsc", "bankBranch"]);
const IMAGE_FIELDS = new Set(["aadhaarFrontUrl", "aadhaarBackUrl", "panCardUrl", "idCardUrl", "photoUrl"]);
const ARRAY_FIELDS = new Set(["languages", "secondaryDistricts"]);

interface ProfileRequest {
  id: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  previousKycStatus: string | null;
  reviewerNote: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  createdAt: string;
  reporterProfile: {
    id: string;
    fullName: string;
    kycStatus: string;
    user: { id: string; name: string; email: string; phone: string | null };
  };
  reviewedBy?: { id: string; name: string; email: string } | null;
}

function formatStoredValue(field: string, stored: string | null): string {
  if (stored == null || stored === "") return "—";
  if (ARRAY_FIELDS.has(field)) {
    try { return (JSON.parse(stored) as string[]).join(", "); } catch { return stored; }
  }
  if (field === "dateOfBirth") {
    // Accept either a full ISO timestamp ("2000-01-01T00:00:00.000Z" — how
    // Prisma serialises the stored DateTime) or a "YYYY-MM-DD" string from
    // the reporter app's date picker. Render as "Jan 31, 2000" — unambiguous
    // across locales (toLocaleDateString() defaults to "1/31/2000" in en-US,
    // "31/01/2000" in en-GB, etc., which is confusing on the admin UI).
    try {
      const d = new Date(stored);
      if (Number.isNaN(d.getTime())) return stored;
      return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return stored;
    }
  }
  return stored;
}

// Next.js 16 requires every component reading `useSearchParams()` to live
// inside a <Suspense> boundary, otherwise the static prerender phase fails
// with "missing-suspense-with-csr-bailout". Default export wraps the real
// page body so the rest of the file stays the same.
export default function ProfileRequestsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>
      <ProfileRequestsPageBody />
    </Suspense>
  );
}

function ProfileRequestsPageBody() {
  const searchParams = useSearchParams();
  const reporterId = searchParams.get("reporterId");
  const initialStatus = searchParams.get("status") === "ALL" ? "ALL" : "PENDING";

  const [filter, setFilter] = useState<"PENDING" | "ALL">(initialStatus);
  const [items, setItems] = useState<ProfileRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [approveTarget, setApproveTarget] = useState<ProfileRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ProfileRequest | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ status: filter });
      if (reporterId) qs.set("reporterId", reporterId);
      const res = await fetch(`/api/admin/profile-requests?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setItems(data.requests || []);
      setPendingCount(data.pendingCount || 0);
    } catch (e: any) {
      console.error(e);
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }, [filter, reporterId]);

  useEffect(() => { load(); }, [load]);

  // When filtering by a reporter, surface their identity above the list so
  // it's clear whose changes the admin is reviewing.
  const filteredReporter = useMemo(() => {
    if (!reporterId || items.length === 0) return null;
    return items[0]?.reporterProfile?.user ?? null;
  }, [reporterId, items]);

  const doApprove = async () => {
    if (!approveTarget) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/profile-requests/${approveTarget.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setApproveTarget(null);
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const doReject = async () => {
    if (!rejectTarget) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/profile-requests/${rejectTarget.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", note: rejectNote.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setRejectTarget(null);
      setRejectNote("");
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f9fafb" }}>
      <Sidebar />
      <main style={{ flex: 1, padding: "28px 32px", marginLeft: 240 }} className="admin-main">
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111827", margin: 0 }}>
            Profile Change Requests
          </h1>
          <p style={{ color: "#6b7280", fontSize: 14, marginTop: 4 }}>
            Review and approve field changes submitted by reporters from the app.
            {pendingCount > 0 ? ` ${pendingCount} pending.` : ""}
          </p>
        </header>

        {/* Reporter-filter banner — shown when arriving from the users
            page via /profile-requests?reporterId=... */}
        {reporterId ? (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px", marginBottom: 16,
            background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
          }}>
            <Badge variant="outline" style={{ fontWeight: 700 }}>Filtered</Badge>
            <span style={{ fontSize: 13, color: "#374151" }}>
              {filteredReporter
                ? <>Reviewing requests from <strong>{filteredReporter.name}</strong> · {filteredReporter.email}</>
                : <>Reviewing requests for reporter <code style={{ fontSize: 12 }}>{reporterId}</code> (no requests on file)</>}
            </span>
            <Link href="/profile-requests" style={{ marginLeft: "auto" }}>
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
                <X style={{ width: 12, height: 12 }} /> Clear filter
              </Button>
            </Link>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <Button
            variant={filter === "PENDING" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("PENDING")}
          >
            <Clock style={{ width: 14, height: 14, marginRight: 6 }} /> Pending
            {pendingCount > 0 ? <Badge variant="secondary" style={{ marginLeft: 8 }}>{pendingCount}</Badge> : null}
          </Button>
          <Button
            variant={filter === "ALL" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("ALL")}
          >
            <History style={{ width: 14, height: 14, marginRight: 6 }} /> All history
          </Button>
        </div>

        {loading ? (
          <p style={{ color: "#6b7280" }}>Loading…</p>
        ) : items.length === 0 ? (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 48, textAlign: "center", color: "#6b7280" }}>
            <p style={{ fontSize: 14, fontWeight: 600 }}>No requests {filter === "PENDING" ? "pending" : "yet"}.</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>Reporter-initiated profile edits will appear here for review.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {items.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                onApprove={() => setApproveTarget(r)}
                onReject={() => setRejectTarget(r)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Approve confirm */}
      <AlertDialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve change?</AlertDialogTitle>
            <AlertDialogDescription>
              {approveTarget ? (
                <>
                  Apply <strong>{FIELD_LABEL[approveTarget.field] || approveTarget.field}</strong> change for{" "}
                  <strong>{approveTarget.reporterProfile.user.name}</strong>.
                  {KYC_FIELDS.has(approveTarget.field)
                    ? " This will set their KYC back to Verified and resume earnings."
                    : ""}
                  {BANK_FIELDS.has(approveTarget.field)
                    ? " Future payments will route to the new account."
                    : ""}
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doApprove} disabled={busy}>
              {busy ? "Approving…" : "Approve"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject with note */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject change</DialogTitle>
            <DialogDescription>
              {rejectTarget ? (
                <>
                  Reject the requested change to <strong>{FIELD_LABEL[rejectTarget.field] || rejectTarget.field}</strong>.
                  The reporter will see this note in the app.
                  {rejectTarget.previousKycStatus
                    ? " Their KYC status will be restored from “Under review” back to its previous state."
                    : ""}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div style={{ marginTop: 8 }}>
            <Label htmlFor="reject-note">Reason (shown to reporter)</Label>
            <Input
              id="reject-note"
              placeholder="e.g. Photo is blurry, please re-upload"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              style={{ marginTop: 6 }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectTarget(null); setRejectNote(""); }} disabled={busy}>Cancel</Button>
            <Button variant="destructive" onClick={doReject} disabled={busy}>
              {busy ? "Rejecting…" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── One request card ──────────────────────────────────────────────────────

function RequestCard({ request, onApprove, onReject }: {
  request: ProfileRequest;
  onApprove: () => void;
  onReject: () => void;
}) {
  const isImage = IMAGE_FIELDS.has(request.field);
  const isKyc = KYC_FIELDS.has(request.field);
  const isBank = BANK_FIELDS.has(request.field);
  const isPending = request.status === "PENDING";

  return (
    <div style={{
      background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 18,
      display: "flex", flexDirection: "column", gap: 14,
    }}>
      {/* Header — journalist + field + status */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>
            {request.reporterProfile.user.name}
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
            {request.reporterProfile.user.email} • {request.reporterProfile.user.phone || "no phone"}
          </div>
          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Badge variant="outline" style={{ fontWeight: 600 }}>{FIELD_LABEL[request.field] || request.field}</Badge>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>
              Requested {new Date(request.createdAt).toLocaleString()}
            </span>
          </div>
        </div>
        <StatusBadge status={request.status} />
      </div>

      {/* Critical-change banner */}
      {isKyc ? (
        <Banner icon={<ShieldAlert size={16} />} tone="warn"
          text="KYC-critical: approving re-verifies KYC and resumes earnings. Rejecting restores the paused KYC status." />
      ) : isBank ? (
        <Banner icon={<Wallet size={16} />} tone="info"
          text="Bank change: approving routes future payments to the new account. Verify the new details before approving." />
      ) : null}

      {/* Old vs new.
          - Text fields: single inline row "<old> → <new>" with the action
            buttons on the right so the whole diff is scannable at a glance.
          - Image fields: keep the stacked side-by-side card layout since
            thumbnails need the vertical space. */}
      {isImage ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 14, alignItems: "stretch" }}>
            <ValueBox label="Current" value={request.oldValue} isImage field={request.field} />
            <div style={{ display: "flex", alignItems: "center", color: "#9ca3af", fontWeight: 700 }}>→</div>
            <ValueBox label="Proposed" value={request.newValue} isImage field={request.field} highlight />
          </div>
          {isPending ? (
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="outline" onClick={onReject}>
                <XCircle style={{ width: 14, height: 14, marginRight: 6 }} /> Reject
              </Button>
              <Button onClick={onApprove}>
                <CheckCircle2 style={{ width: 14, height: 14, marginRight: 6 }} /> Approve
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <div style={{
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          padding: "10px 14px", background: "#f9fafb", border: "1px solid #e5e7eb",
          borderRadius: 10,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Current
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", wordBreak: "break-word" }}>
            {formatStoredValue(request.field, request.oldValue)}
          </span>
          <span style={{ color: "#9ca3af", fontWeight: 700 }}>→</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Proposed
          </span>
          <span style={{
            fontSize: 13, fontWeight: 700, color: "#111827", wordBreak: "break-word",
            padding: "3px 8px", background: "#fef3c7", borderRadius: 6, border: "1px solid #fde68a",
          }}>
            {formatStoredValue(request.field, request.newValue)}
          </span>
          {isPending ? (
            <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
              <Button variant="outline" size="sm" onClick={onReject}>
                <XCircle style={{ width: 14, height: 14, marginRight: 6 }} /> Reject
              </Button>
              <Button size="sm" onClick={onApprove}>
                <CheckCircle2 style={{ width: 14, height: 14, marginRight: 6 }} /> Approve
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {/* Reviewer note for resolved items */}
      {request.status !== "PENDING" && request.reviewerNote ? (
        <div style={{ padding: 10, background: "#f9fafb", borderRadius: 8, fontSize: 12, color: "#374151" }}>
          <span style={{ fontWeight: 700 }}>Reviewer note:</span> {request.reviewerNote}
          {request.reviewedBy ? (
            <span style={{ color: "#6b7280", marginLeft: 6 }}>— {request.reviewedBy.name}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ValueBox({ label, value, isImage, field, highlight }: {
  label: string; value: string | null; isImage: boolean; field?: string; highlight?: boolean;
}) {
  return (
    <div style={{
      padding: 10, background: highlight ? "#fef3c7" : "#f9fafb",
      borderRadius: 8, border: `1px solid ${highlight ? "#fde68a" : "#e5e7eb"}`,
      minHeight: 60, display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      {isImage && value ? (
        <a href={value} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={label} style={{ width: "100%", maxHeight: 120, objectFit: "contain", borderRadius: 6, background: "#fff" }} />
        </a>
      ) : (
        <div style={{ fontSize: 13, color: "#111827", wordBreak: "break-word", fontWeight: 600 }}>
          {formatStoredValue(field || "", value)}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    PENDING:  { bg: "#fef3c7", fg: "#92400e", label: "Pending" },
    APPROVED: { bg: "#dcfce7", fg: "#166534", label: "Approved" },
    REJECTED: { bg: "#fef2f2", fg: "#dc2626", label: "Rejected" },
  };
  const c = map[status] || map.PENDING;
  return (
    <span style={{
      padding: "4px 10px", borderRadius: 999, background: c.bg, color: c.fg,
      fontSize: 11, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase",
    }}>
      {c.label}
    </span>
  );
}

function Banner({ icon, text, tone }: { icon: React.ReactNode; text: string; tone: "warn" | "info" }) {
  const styles = tone === "warn"
    ? { bg: "#fef3c7", fg: "#92400e", border: "#fde68a" }
    : { bg: "#dbeafe", fg: "#1d4ed8", border: "#bfdbfe" };
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 8, padding: 10,
      background: styles.bg, color: styles.fg, border: `1px solid ${styles.border}`,
      borderRadius: 8, fontSize: 12, lineHeight: 1.5,
    }}>
      <span style={{ flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <span>{text}</span>
    </div>
  );
}
