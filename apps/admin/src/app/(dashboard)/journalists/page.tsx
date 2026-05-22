"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/sidebar";

interface JournalistProfile {
  id: string; fullName: string; kycStatus: string; primaryDistrict: string;
  aadhaarFrontUrl: string; aadhaarBackUrl: string; panCardUrl: string; photoUrl: string;
  upiId: string; phone: string; kycRejectionNote: string; createdAt: string; verifiedAt: string;
}

interface Journalist {
  id: string; email: string; name: string; phone: string; active: boolean; createdAt: string;
  journalistProfile: JournalistProfile | null;
  _count: { articles: number; payments: number };
}

const kycColors: Record<string, { bg: string; color: string }> = {
  PENDING: { bg: "#fef3c7", color: "#92400e" },
  SUBMITTED: { bg: "#dbeafe", color: "#1d4ed8" },
  VERIFIED: { bg: "#dcfce7", color: "#166534" },
  REJECTED: { bg: "#fef2f2", color: "#dc2626" },
};

export default function JournalistsPage() {
  const [journalists, setJournalists] = useState<Journalist[]>([]);
  const [selected, setSelected] = useState<Journalist | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  useEffect(() => {
    fetch("/api/journalists").then((r) => r.json()).then(setJournalists);
  }, []);

  const handleAction = async (profileId: string, action: string, note?: string) => {
    await fetch("/api/journalists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, action, note }),
    });
    setSelected(null);
    setRejectNote("");
    fetch("/api/journalists").then((r) => r.json()).then(setJournalists);
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111", marginBottom: 4 }}>Journalists & KYC</h1>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>Manage reporter profiles, verify KYC, track performance</p>

        <div className="admin-split" style={{ display: "flex", gap: 16 }}>
          {/* Left: Journalist List */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {journalists.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 10, padding: 40, textAlign: "center", color: "#aaa" }}>
                <p>No journalists registered yet.</p>
                <p style={{ fontSize: 12, marginTop: 4 }}>They'll appear here when they sign up via the RE Reporter app.</p>
              </div>
            ) : (
              journalists.map((j) => {
                const p = j.journalistProfile;
                const kyc = kycColors[p?.kycStatus || "PENDING"];
                return (
                  <div key={j.id} onClick={() => setSelected(j)} style={{
                    background: selected?.id === j.id ? "#eff6ff" : "#fff",
                    borderRadius: 10, padding: 14, marginBottom: 8, cursor: "pointer",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.06)", border: selected?.id === j.id ? "2px solid #3b82f6" : "2px solid transparent",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>{j.name}</span>
                        <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: kyc.bg, color: kyc.color }}>
                          {p?.kycStatus || "NO PROFILE"}
                        </span>
                      </div>
                      <span style={{ fontSize: 12, color: "#888" }}>{j._count.articles} articles</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                      {j.email} {j.phone ? `| ${j.phone}` : ""} {p?.primaryDistrict ? `| ${p.primaryDistrict}` : ""}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right: Selected Journalist Details */}
          {selected?.journalistProfile && (
            <div className="admin-side" style={{ width: 400, flexShrink: 0 }}>
              <div style={{ background: "#fff", borderRadius: 10, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", position: "sticky", top: 24 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>{selected.journalistProfile.fullName}</h3>

                {/* KYC Status */}
                <div style={{ marginBottom: 12 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 4, ...kycColors[selected.journalistProfile.kycStatus] }}>
                    KYC: {selected.journalistProfile.kycStatus}
                  </span>
                </div>

                {/* Documents */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  {selected.journalistProfile.photoUrl && (
                    <div>
                      <p style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>Photo</p>
                      <img src={selected.journalistProfile.photoUrl} alt="Photo" style={{ width: "100%", borderRadius: 6, border: "1px solid #eee" }} />
                    </div>
                  )}
                  {selected.journalistProfile.aadhaarFrontUrl && (
                    <div>
                      <p style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>Aadhaar Front</p>
                      <img src={selected.journalistProfile.aadhaarFrontUrl} alt="Aadhaar" style={{ width: "100%", borderRadius: 6, border: "1px solid #eee" }} />
                    </div>
                  )}
                  {selected.journalistProfile.aadhaarBackUrl && (
                    <div>
                      <p style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>Aadhaar Back</p>
                      <img src={selected.journalistProfile.aadhaarBackUrl} alt="Aadhaar Back" style={{ width: "100%", borderRadius: 6, border: "1px solid #eee" }} />
                    </div>
                  )}
                  {selected.journalistProfile.panCardUrl && (
                    <div>
                      <p style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>PAN Card</p>
                      <img src={selected.journalistProfile.panCardUrl} alt="PAN" style={{ width: "100%", borderRadius: 6, border: "1px solid #eee" }} />
                    </div>
                  )}
                </div>

                {/* Details */}
                <div style={{ fontSize: 12, color: "#555", lineHeight: 2 }}>
                  <p><strong>District:</strong> {selected.journalistProfile.primaryDistrict || "—"}</p>
                  <p><strong>UPI:</strong> {selected.journalistProfile.upiId || "—"}</p>
                  <p><strong>Articles:</strong> {selected._count.articles}</p>
                  <p><strong>Joined:</strong> {new Date(selected.createdAt).toLocaleDateString()}</p>
                </div>

                {/* Actions */}
                {selected.journalistProfile.kycStatus === "SUBMITTED" && (
                  <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                    <button onClick={() => handleAction(selected.journalistProfile!.id, "verify")}
                      style={{ width: "100%", padding: "10px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      Verify KYC ✓
                    </button>
                    <input value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Rejection reason..."
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #fecaca", borderRadius: 6, fontSize: 12, boxSizing: "border-box" }} />
                    <button onClick={() => handleAction(selected.journalistProfile!.id, "reject", rejectNote)}
                      style={{ width: "100%", padding: "10px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      Reject KYC
                    </button>
                  </div>
                )}

                {selected.journalistProfile.kycRejectionNote && (
                  <div style={{ marginTop: 12, padding: 10, background: "#fef2f2", borderRadius: 6, borderLeft: "3px solid #dc2626" }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: "#dc2626" }}>Rejection Note:</p>
                    <p style={{ fontSize: 12, color: "#666" }}>{selected.journalistProfile.kycRejectionNote}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
