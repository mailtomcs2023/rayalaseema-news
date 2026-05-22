"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/sidebar";

interface Slots { lead: string | null; majors: string[]; secondary: string[]; briefs: string[]; }
interface LPage { label: string; isFront: boolean; slots: Slots; }
type Titles = Record<string, { title: string; category: string }>;
interface PickTarget { page: number; kind: "lead" | "majors" | "secondary" | "briefs"; idx: number; }
interface Ad { id: string; pageNumber: number; slot: string; imageUrl: string; }

const EDITIONS = [
  { key: "main", name: "ప్రధాన ఎడిషన్" },
  { key: "kurnool", name: "కర్నూలు" },
  { key: "nandyal", name: "నంద్యాల" },
  { key: "ananthapuramu", name: "అనంతపురం" },
  { key: "sri-sathya-sai", name: "శ్రీ సత్యసాయి" },
  { key: "kadapa", name: "కడప" },
  { key: "annamayya", name: "అన్నమయ్య" },
  { key: "tirupati", name: "తిరుపతి" },
  { key: "chittoor", name: "చిత్తూరు" },
];

export default function EpaperEditorPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [edition, setEdition] = useState("main");
  const [pages, setPages] = useState<LPage[]>([]);
  const [titles, setTitles] = useState<Titles>({});
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [pick, setPick] = useState<PickTarget | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ id: string; title: string }[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [adPage, setAdPage] = useState(1);
  const [adSlot, setAdSlot] = useState("top");

  const qs = `date=${date}&edition=${edition}`;

  const loadLayout = useCallback(async () => {
    const r = await fetch(`/api/epaper/layout?${qs}`);
    if (r.ok) {
      const j = await r.json();
      setPages(j.layout?.pages || []);
      setTitles(j.titles || {});
      setStatus(j.status || "");
    } else { setPages([]); setTitles({}); setStatus(""); }
    const ra = await fetch(`/api/epaper/ads?${qs}`);
    if (ra.ok) setAds(await ra.json()); else setAds([]);
  }, [qs]);

  useEffect(() => { loadLayout(); }, [loadLayout]);

  const buildDraft = async () => {
    setBusy(true); setMsg("డ్రాఫ్ట్ తయారవుతోంది…");
    const r = await fetch(`/api/epaper/draft?${qs}`, { method: "POST" });
    const j = await r.json();
    setMsg(r.ok ? `✅ ${j.pages} పేజీల డ్రాఫ్ట్ సిద్ధం` : `❌ ${j.error}`);
    await loadLayout(); setBusy(false);
  };

  const saveLayout = async () => {
    setBusy(true); setMsg("సేవ్ అవుతోంది…");
    const r = await fetch(`/api/epaper/layout?${qs}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pages }),
    });
    setMsg(r.ok ? "✅ సేవ్ అయింది" : "❌ సేవ్ విఫలమైంది");
    setBusy(false);
  };

  const publish = async () => {
    setBusy(true); setMsg("రెండర్ అవుతోంది… (1-2 నిమిషాలు)");
    await fetch(`/api/epaper/layout?${qs}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pages }),
    });
    const r = await fetch(`/api/epaper/render?${qs}`, { method: "POST" });
    const j = await r.json();
    setMsg(r.ok ? `✅ ప్రచురితమైంది — ${j.pages} పేజీలు` : `❌ ${j.error}`);
    await loadLayout(); setBusy(false);
  };

  const uploadAd = async (file: File) => {
    setBusy(true); setMsg("ప్రకటన అప్‌లోడ్ అవుతోంది…");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("pageNumber", String(adPage));
    fd.append("slot", adSlot);
    const r = await fetch(`/api/epaper/ads?${qs}`, { method: "POST", body: fd });
    setMsg(r.ok ? "✅ ప్రకటన చేర్చబడింది" : "❌ అప్‌లోడ్ విఫలమైంది");
    await loadLayout(); setBusy(false);
  };

  const deleteAd = async (id: string) => {
    await fetch(`/api/epaper/ads?id=${id}`, { method: "DELETE" });
    await loadLayout();
  };

  useEffect(() => {
    if (!pick) return;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/articles?status=PUBLISHED&limit=20&search=${encodeURIComponent(search)}`);
      const j = await r.json();
      setResults((j.articles || j.data || j || []).map((a: any) => ({ id: a.id, title: a.title })));
    }, 300);
    return () => clearTimeout(t);
  }, [search, pick]);

  const assign = (articleId: string, articleTitle: string) => {
    if (!pick) return;
    setPages((prev) => {
      const next = structuredClone(prev);
      const s = next[pick.page].slots;
      if (pick.kind === "lead") s.lead = articleId;
      else (s[pick.kind] as string[])[pick.idx] = articleId;
      return next;
    });
    setTitles((t) => ({ ...t, [articleId]: { title: articleTitle, category: "" } }));
    setPick(null); setSearch(""); setResults([]);
  };

  const clearSlot = (page: number, kind: PickTarget["kind"], idx: number) => {
    setPages((prev) => {
      const next = structuredClone(prev);
      const s = next[page].slots;
      if (kind === "lead") s.lead = null;
      else (s[kind] as string[]).splice(idx, 1);
      return next;
    });
  };

  const Slot = ({ id, page, kind, idx }: { id: string | null; page: number; kind: PickTarget["kind"]; idx: number }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", background: id ? "#f9fafb" : "#fff7ed", border: "1px solid #e5e7eb", borderRadius: 5, marginBottom: 4 }}>
      <span style={{ flex: 1, fontSize: 12, color: id ? "#111" : "#9a3412" }}>{id ? (titles[id]?.title || id) : "— ఖాళీ —"}</span>
      <button onClick={() => setPick({ page, kind, idx })} style={{ fontSize: 11, padding: "2px 8px", background: "#E01B1B", color: "#fff", border: "none", borderRadius: 3, cursor: "pointer" }}>మార్చు</button>
      {id && <button onClick={() => clearSlot(page, kind, idx)} style={{ fontSize: 11, padding: "2px 6px", background: "#e5e7eb", border: "none", borderRadius: 3, cursor: "pointer" }}>×</button>}
    </div>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111", marginBottom: 4 }}>ePaper Editor</h1>
        <p style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>Per-district editions · build draft → edit slots → ads → publish.</p>

        <div style={{ background: "#fff", borderRadius: 10, padding: 16, marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6 }} />
          <select value={edition} onChange={(e) => setEdition(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6 }}>
            {EDITIONS.map((e) => <option key={e.key} value={e.key}>{e.name}</option>)}
          </select>
          <button onClick={buildDraft} disabled={busy} style={{ padding: "9px 18px", background: "#374151", color: "#fff", border: "none", borderRadius: 6, fontWeight: 700, cursor: "pointer" }}>Build Draft</button>
          <button onClick={saveLayout} disabled={busy || !pages.length} style={{ padding: "9px 18px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontWeight: 700, cursor: "pointer" }}>Save</button>
          <button onClick={publish} disabled={busy || !pages.length} style={{ padding: "9px 18px", background: "#E01B1B", color: "#fff", border: "none", borderRadius: 6, fontWeight: 700, cursor: "pointer" }}>Publish</button>
          {status && <span style={{ fontSize: 12, color: "#6b7280" }}>status: {status}</span>}
          {msg && <span style={{ fontSize: 13, color: "#374151" }}>{msg}</span>}
        </div>

        {/* Ads panel */}
        {pages.length > 0 && (
          <div style={{ background: "#fff", borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>ప్రకటనలు (Ads)</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
              <select value={adPage} onChange={(e) => setAdPage(Number(e.target.value))} style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 5, fontSize: 12 }}>
                {pages.map((_, i) => <option key={i} value={i + 1}>పేజీ {i + 1}</option>)}
              </select>
              <select value={adSlot} onChange={(e) => setAdSlot(e.target.value)} style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 5, fontSize: 12 }}>
                <option value="top">పై బ్యానర్</option>
                <option value="bottom">కింది స్ట్రిప్</option>
              </select>
              <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadAd(e.target.files[0])} style={{ fontSize: 12 }} />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ads.map((ad) => (
                <div key={ad.id} style={{ border: "1px solid #e5e7eb", borderRadius: 5, padding: 4, width: 110 }}>
                  <img src={ad.imageUrl} alt="" style={{ width: "100%", height: 50, objectFit: "cover", borderRadius: 3 }} />
                  <div style={{ fontSize: 10, color: "#6b7280", margin: "3px 0" }}>పేజీ {ad.pageNumber} · {ad.slot}</div>
                  <button onClick={() => deleteAd(ad.id)} style={{ fontSize: 10, width: "100%", background: "#fee2e2", color: "#991b1b", border: "none", borderRadius: 3, padding: "2px", cursor: "pointer" }}>తొలగించు</button>
                </div>
              ))}
              {ads.length === 0 && <span style={{ fontSize: 12, color: "#9ca3af" }}>ప్రకటనలు లేవు</span>}
            </div>
          </div>
        )}

        {pages.length === 0 && (
          <div style={{ background: "#fff", borderRadius: 10, padding: 40, textAlign: "center", color: "#9ca3af" }}>
            No draft. Pick date + edition, click <b>Build Draft</b>.
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 14 }}>
          {pages.map((p, pi) => (
            <div key={pi} style={{ background: "#fff", borderRadius: 10, padding: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <input value={p.label} onChange={(e) => setPages((prev) => { const n = structuredClone(prev); n[pi].label = e.target.value; return n; })}
                  style={{ fontWeight: 800, fontSize: 14, border: "none", borderBottom: "1px solid #e5e7eb", padding: "2px 0", width: 150 }} />
                <span style={{ fontSize: 11, color: "#9ca3af" }}>పేజీ {pi + 1}{p.isFront ? " · ముఖచిత్రం" : ""}</span>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#E01B1B", textTransform: "uppercase", margin: "6px 0 2px" }}>లీడ్</div>
              <Slot id={p.slots.lead} page={pi} kind="lead" idx={0} />
              <div style={{ fontSize: 10, fontWeight: 700, color: "#E01B1B", textTransform: "uppercase", margin: "6px 0 2px" }}>మేజర్</div>
              {p.slots.majors.map((id, i) => <Slot key={i} id={id} page={pi} kind="majors" idx={i} />)}
              <div style={{ fontSize: 10, fontWeight: 700, color: "#E01B1B", textTransform: "uppercase", margin: "6px 0 2px" }}>సెకండరీ</div>
              {p.slots.secondary.map((id, i) => <Slot key={i} id={id} page={pi} kind="secondary" idx={i} />)}
              <div style={{ fontSize: 10, fontWeight: 700, color: "#E01B1B", textTransform: "uppercase", margin: "6px 0 2px" }}>బ్రీఫ్‌లు</div>
              {p.slots.briefs.map((id, i) => <Slot key={i} id={id} page={pi} kind="briefs" idx={i} />)}
            </div>
          ))}
        </div>

        {pick && (
          <div onClick={() => setPick(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 10, padding: 18, width: 480, maxHeight: "75vh", display: "flex", flexDirection: "column" }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>వార్తను ఎంచుకోండి</h3>
              <input autoFocus placeholder="శోధించండి…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, marginBottom: 10 }} />
              <div style={{ overflowY: "auto", flex: 1 }}>
                {results.map((a) => (
                  <button key={a.id} onClick={() => assign(a.id, a.title)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", border: "none", borderBottom: "1px solid #f3f4f6", background: "#fff", cursor: "pointer", fontSize: 12 }}>{a.title}</button>
                ))}
                {results.length === 0 && <p style={{ color: "#9ca3af", fontSize: 12, padding: 12 }}>టైప్ చేసి శోధించండి</p>}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
