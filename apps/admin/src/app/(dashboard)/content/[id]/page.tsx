// /content/[id] — morphing editor (Spec #1 #117 + F2-F6).
//
// F1 ships: common fields (Title, Slug, Summary, Category, Desk, Constituency,
// Featured image, Tags, Featured?, Language, Status) + ARTICLE subform (body
// via RichEditor + rating/reviewerName/sourceUrl).
//
// Other ContentTypes render type-specific subforms in F2-F6. Until those land,
// non-ARTICLE rows still see common fields and can save title/category/etc;
// the type-specific subform panel surfaces a "coming soon" callout.
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { RichEditor, type RichEditorRef } from "@/components/rich-editor";
import { ImageUpload } from "@/components/image-upload";
import { ContentPayloadEditor } from "@/components/content-payload-editor";
import { ImageSearchModal } from "@/components/image-search-modal";

interface Category { id: string; name: string; nameEn: string; slug: string }

const TYPE_META: Record<string, { label: string; bg: string; fg: string }> = {
  ARTICLE: { label: "Article", bg: "#fee2e2", fg: "#991b1b" },
  VIDEO: { label: "Video", bg: "#dbeafe", fg: "#1e40af" },
  REEL: { label: "Reel", bg: "#dcfce7", fg: "#166534" },
  WEB_STORY: { label: "Web Story", bg: "#fef3c7", fg: "#92400e" },
  PHOTO_GALLERY: { label: "Photo Gallery", bg: "#f3e8ff", fg: "#6b21a8" },
  CARTOON: { label: "Cartoon", bg: "#fce7f3", fg: "#9d174d" },
  BREAKING_NEWS: { label: "Breaking News", bg: "#fef2f2", fg: "#7f1d1d" },
};

export default function ContentEditorPage() {
  const router = useRouter();
  const params = useParams();
  const contentId = params.id as string;

  const [type, setType] = useState<string>("ARTICLE");
  const [categories, setCategories] = useState<Category[]>([]);
  const [desks, setDesks] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Common fields
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [featuredImage, setFeaturedImage] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [deskId, setDeskId] = useState("");
  const [constituencyId, setConstituencyId] = useState("");
  const [status, setStatus] = useState("DRAFT");
  const [featured, setFeatured] = useState(false);
  const [language, setLanguage] = useState("TELUGU");
  const [tagsInput, setTagsInput] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [imageSearchOpen, setImageSearchOpen] = useState(false);

  // ARTICLE-specific (payload)
  const [rating, setRating] = useState<string>("");
  const [reviewerName, setReviewerName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  // Typed payload state for non-ARTICLE types (F2-F6).
  const [typedPayload, setTypedPayload] = useState<Record<string, unknown>>({});
  const [payloadError, setPayloadError] = useState("");

  // AI helpers (translate / editorial / summarize / headline) + URL fetch.
  // Ported from the legacy /articles/[id] editor — same /api/ai/rewrite and
  // /api/fetch-news endpoints, now wired into the unified content editor.
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [pasteUrl, setPasteUrl] = useState("");

  const editorRef = useRef<RichEditorRef>(null);

  const runAI = async (action: "translate" | "editorial" | "summarize" | "headline") => {
    const text = body || summary || title;
    if (!text) { setError("No content to process — type or paste something first."); return; }
    setAiLoading(action);
    setError("");
    setSuccess("");
    try {
      const urlMatch = body.match(/href="(https?:\/\/[^"]+)"/);
      const ctxSourceUrl = urlMatch ? urlMatch[1] : (sourceUrl || undefined);
      const res = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `Title: ${title}\n\nSummary: ${summary}\n\nBody: ${body.replace(/<[^>]+>/g, " ").trim()}`,
          action,
          sourceUrl: ctxSourceUrl,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else if (data.result) {
        if (action === "summarize") {
          setSummary(String(data.result).replace(/<[^>]+>/g, "").trim());
          setSuccess("Summary generated.");
        } else if (action === "headline") {
          setSuccess(String(data.result));
        } else {
          // Translate / editorial — full body rewrite.
          const h2 = data.result.match(/<h2[^>]*>(.*?)<\/h2>/);
          if (h2) setTitle(h2[1].replace(/<[^>]+>/g, "").trim());
          const p = data.result.match(/<p[^>]*>(.*?)<\/p>/);
          if (p) {
            const first = p[1].replace(/<[^>]+>/g, "").trim();
            if (first.length > 20) setSummary(first.substring(0, 200));
          }
          setBody(data.result);
          editorRef.current?.setContent(data.result);
          setSuccess(`Done. Tokens used: ${data.tokens?.total_tokens || data.tokens?.total || 0}`);
        }
      }
    } catch (e: any) {
      setError(e.message || "AI request failed");
    }
    setAiLoading(null);
    setTimeout(() => setSuccess(""), 5000);
  };

  const fetchFromUrl = async () => {
    if (!pasteUrl.trim()) return;
    setAiLoading("fetch");
    setError("");
    try {
      // Single AI call: scrapes URL + translates + extracts og:image +
      // suggests English SEO slug + keywords + meta-description. Replaces
      // the older /api/fetch-news POST which required a title up-front and
      // saved a row on every click (the dummy-draft bug).
      const res = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl: pasteUrl.trim(), action: "full-import" }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || `Fetch failed (${res.status})`);
        setAiLoading(null);
        return;
      }
      if (data.title) setTitle(data.title);
      if (data.summary) setSummary(data.summary);
      if (data.body) {
        setBody(data.body);
        editorRef.current?.setContent(data.body);
      }
      if (data.ogImage && !featuredImage) setFeaturedImage(data.ogImage);
      if (data.slug) setSlug(data.slug);
      setSourceUrl(pasteUrl.trim());
      setPasteUrl("");
      const kw = Array.isArray(data.keywords) && data.keywords.length ? ` Keywords: ${data.keywords.join(", ")}.` : "";
      setSuccess(`Fetched + translated.${kw} Review + Save Draft when ready.`);
    } catch (e: any) {
      setError(e.message || "Fetch failed");
    }
    setAiLoading(null);
    setTimeout(() => setSuccess(""), 8000);
  };

  useEffect(() => {
    Promise.all([
      fetch(`/api/content/${contentId}`).then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
      fetch("/api/desks").then((r) => r.json()).catch(() => []),
      fetch("/api/locations").then((r) => r.json()).catch(() => []),
    ]).then(([row, cats, deskList, locs]) => {
      setCategories(cats || []);
      setDesks(deskList || []);
      setDistricts(locs || []);
      if (row.error) {
        setError(row.error);
        setLoading(false);
        return;
      }
      setType(row.type || "ARTICLE");
      setTitle(row.title || "");
      setSlug(row.slug || "");
      setSummary(row.summary || "");
      setBody(row.body || "");
      setFeaturedImage(row.featuredImage || "");
      setCategoryId(row.categoryId || "");
      setDeskId(row.deskId || "");
      setConstituencyId(row.constituencyId || "");
      setStatus(row.status || "DRAFT");
      setFeatured(!!row.featured);
      setLanguage(row.language || "TELUGU");
      setSourceUrl(row.sourceUrl || "");
      if (row.scheduledAt) {
        const d = new Date(row.scheduledAt);
        const off = d.getTimezoneOffset() * 60000;
        setScheduledAt(new Date(d.getTime() - off).toISOString().slice(0, 16));
      }
      if (Array.isArray(row.tags)) {
        setTagsInput(row.tags.map((t: any) => t.tag?.name).filter(Boolean).join(", "));
      }
      // Project payload into the right state shape per type. ARTICLE pulls
      // rating + reviewerName into dedicated inputs; everything else hands the
      // raw payload to ContentPayloadEditor which switches on type internally.
      const payload = row.payload || {};
      if (row.type === "ARTICLE") {
        setRating(typeof payload.rating === "number" ? String(payload.rating) : "");
        setReviewerName(payload.reviewerName || "");
      } else {
        setTypedPayload(payload as Record<string, unknown>);
      }
      setLoading(false);
    });
  }, [contentId]);

  const buildPayload = () => {
    if (type === "ARTICLE") {
      const p: Record<string, unknown> = {};
      if (rating.trim()) {
        const n = parseFloat(rating);
        if (Number.isFinite(n)) p.rating = n;
      }
      if (reviewerName.trim()) p.reviewerName = reviewerName.trim();
      return Object.keys(p).length > 0 ? p : null;
    }
    // Strip empty top-level fields so the Zod .strict() schemas don't trip on
    // empty strings that the user never filled.
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(typedPayload)) {
      if (v === "" || v === null || v === undefined) continue;
      cleaned[k] = v;
    }
    return Object.keys(cleaned).length > 0 ? cleaned : null;
  };

  const handleSave = async (newStatus?: string) => {
    setSaving(true);
    setError("");
    setSuccess("");
    setPayloadError("");

    const payload = buildPayload();
    if (payload === undefined) {
      setSaving(false);
      return;
    }

    const finalStatus = newStatus || status;

    const body_ = {
      type,
      title,
      slug,
      summary: summary || null,
      body: type === "ARTICLE" ? body : null,
      featuredImage: featuredImage || null,
      categoryId: categoryId || null,
      deskId: deskId || null,
      constituencyId: constituencyId || null,
      status: finalStatus,
      featured,
      language,
      sourceUrl: sourceUrl || null,
      payload,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      tagNames: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
    };

    try {
      const res = await fetch(`/api/content/${contentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body_),
      });
      const data = await res.json();
      if (!res.ok) {
        const fieldErrs = data.fieldErrors
          ? Object.entries(data.fieldErrors).map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`).join(" · ")
          : "";
        setError(data.error + (fieldErrs ? ` (${fieldErrs})` : "") || `Save failed (${res.status})`);
      } else {
        setStatus(data.status);
        setSuccess("Saved");
        setTimeout(() => setSuccess(""), 2000);
      }
    } catch (e: any) {
      setError(e.message || "Save failed");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
        <Sidebar />
        <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>Loading…</main>
      </div>
    );
  }

  const typeMeta = TYPE_META[type] || { label: type, bg: "#eee", fg: "#555" };
  const constituencies = districts.flatMap((d) =>
    (d.constituencies || []).map((c: any) => ({ ...c, districtName: d.nameEn })));

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <button onClick={() => router.push("/content")}
            style={{ padding: "6px 12px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
            ← Back
          </button>
          <span style={{ fontSize: 12, fontWeight: 700, color: typeMeta.fg, background: typeMeta.bg, padding: "4px 10px", borderRadius: 4 }}>
            {typeMeta.label}
          </span>
          <span style={{ fontSize: 12, color: "#6b7280" }}>·</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Status: {status}</span>
          {slug && <span style={{ fontSize: 12, color: "#6b7280", fontFamily: "monospace" }}>/{slug}</span>}
          <div style={{ flex: 1 }} />
          <button onClick={() => handleSave()} disabled={saving}
            style={{ padding: "8px 16px", background: "#fff", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Saving…" : "Save Draft"}
          </button>
          <button onClick={() => handleSave("PUBLISHED")} disabled={saving}
            style={{ padding: "8px 16px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
            Publish
          </button>
        </div>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#dc2626" }}>{error}</div>
        )}
        {success && (
          <div style={{ background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: 8, padding: "8px 14px", marginBottom: 16, fontSize: 13, color: "#166534" }}>{success}</div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 20 }}>
          {/* Main column */}
          <div style={{ background: "#fff", borderRadius: 10, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            {/* Common */}
            <label style={lblStyle}>Title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              style={{ ...inpStyle, fontSize: 20, fontWeight: 700 }} />

            <label style={lblStyle}>Slug</label>
            <input value={slug} onChange={(e) => setSlug(e.target.value)}
              placeholder={type === "BREAKING_NEWS" ? "(optional for breaking)" : "url-segment"}
              style={{ ...inpStyle, fontFamily: "monospace", fontSize: 13 }} />

            <label style={lblStyle}>Summary</label>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2}
              placeholder="Short 60-word summary..." style={{ ...inpStyle, resize: "vertical" }} />

            {/* AI assist — ARTICLE only. Paste URL → fetch + translate, or
                run translate / editorial / summarize / headline on the
                current body. */}
            {type === "ARTICLE" && (
              <div style={{ marginTop: 12, padding: 12, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <input
                    value={pasteUrl}
                    onChange={(e) => setPasteUrl(e.target.value)}
                    placeholder="Paste a source URL (optional) — తెలుగులో రాయండి will fetch + translate it"
                    style={{ ...inpStyle, fontSize: 12 }}
                  />
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {/* Unified Telugu button: if URL pasted -> scrape + translate
                      (was the separate "Fetch + translate" button); else translate
                      the existing title/summary/body in place. */}
                  <button
                    onClick={() => (pasteUrl.trim() ? fetchFromUrl() : runAI("translate"))}
                    disabled={aiLoading !== null}
                    style={{ padding: "6px 12px", background: aiLoading === "translate" || aiLoading === "fetch" ? "#4b5563" : "#3b82f6", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: aiLoading ? "not-allowed" : "pointer" }}
                  >
                    {aiLoading === "translate" || aiLoading === "fetch" ? "Translating…" : "తెలుగులో రాయండి"}
                  </button>
                  <button onClick={() => runAI("editorial")} disabled={aiLoading !== null}
                    style={{ padding: "6px 12px", background: aiLoading === "editorial" ? "#4b5563" : "#dc2626", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: aiLoading ? "not-allowed" : "pointer" }}>
                    {aiLoading === "editorial" ? "Writing…" : "Editorial style"}
                  </button>
                  <button onClick={() => runAI("summarize")} disabled={aiLoading !== null}
                    style={{ padding: "6px 12px", background: "#fff", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: aiLoading ? "not-allowed" : "pointer" }}>
                    {aiLoading === "summarize" ? "Summarizing…" : "Summarize"}
                  </button>
                  <button onClick={() => runAI("headline")} disabled={aiLoading !== null}
                    style={{ padding: "6px 12px", background: "#fff", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: aiLoading ? "not-allowed" : "pointer" }}>
                    {aiLoading === "headline" ? "Generating…" : "Headline ideas"}
                  </button>
                </div>
              </div>
            )}

            {/* Type-specific body / payload */}
            {type === "ARTICLE" && (
              <>
                <label style={lblStyle}>Body</label>
                <RichEditor ref={editorRef} content={body} onChange={setBody} />
                {/* Rating + reviewer-byline are movie-review-only inputs. The
                    Source URL is also gated to that category — most ARTICLEs
                    are original reporting, not wire imports. The "Fetch +
                    translate" URL bar above already feeds sourceUrl when
                    importing from a foreign site. */}
                {(() => {
                  const cat = categories.find((c) => c.id === categoryId);
                  const isMovieReview = cat?.slug === "movie-reviews";
                  if (!isMovieReview) return null;
                  return (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 10, marginTop: 12, padding: 10, background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 8 }}>
                      <div>
                        <label style={lblStyle}>Rating</label>
                        <input type="number" min="0" max="5" step="0.1" value={rating}
                          onChange={(e) => setRating(e.target.value)} placeholder="0.0 - 5.0"
                          style={inpStyle} />
                      </div>
                      <div>
                        <label style={lblStyle}>Reviewer name</label>
                        <input value={reviewerName} onChange={(e) => setReviewerName(e.target.value)}
                          placeholder="Critic byline" style={inpStyle} />
                      </div>
                      <div>
                        <label style={lblStyle}>Source URL</label>
                        <input type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)}
                          placeholder="https://..." style={inpStyle} />
                      </div>
                    </div>
                  );
                })()}
              </>
            )}

            {type !== "ARTICLE" && (
              <ContentPayloadEditor type={type} payload={typedPayload} setPayload={setTypedPayload} />
            )}
          </div>

          {/* Sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Section title="Publishing">
              <label style={lblStyle}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={inpStyle}>
                {["DRAFT", "SUBMITTED", "IN_REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED", "REJECTED", "ARCHIVED"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <label style={lblStyle}>Schedule for</label>
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} style={inpStyle} />
              <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
                Featured
              </label>
            </Section>

            <Section title="Classification">
              <label style={lblStyle}>Category</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={inpStyle}>
                <option value="">— none —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.nameEn}</option>)}
              </select>
              <label style={lblStyle}>Desk (auto-resolves if blank)</label>
              <select value={deskId} onChange={(e) => setDeskId(e.target.value)} style={inpStyle}>
                <option value="">— auto —</option>
                {desks.map((d) => <option key={d.id} value={d.id}>{d.nameEn} · {d.branch}</option>)}
              </select>
              <label style={lblStyle}>Constituency</label>
              <select value={constituencyId} onChange={(e) => setConstituencyId(e.target.value)} style={inpStyle}>
                <option value="">— none —</option>
                {constituencies.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.nameEn} ({c.districtName})</option>
                ))}
              </select>
              <label style={lblStyle}>Language</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} style={inpStyle}>
                <option value="TELUGU">Telugu</option>
                <option value="ENGLISH">English</option>
              </select>
              <label style={lblStyle}>Tags (comma-separated)</label>
              <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)}
                placeholder="elections, politics, ap" style={inpStyle} />
            </Section>

            <Section title="Featured image">
              <ImageUpload value={featuredImage} onChange={setFeaturedImage} />
              <button
                type="button"
                onClick={() => setImageSearchOpen(true)}
                style={{
                  marginTop: 8, padding: "6px 12px", background: "#fff", color: "#374151",
                  border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12, fontWeight: 600,
                  cursor: "pointer", width: "100%",
                }}
              >
                🔍 Search free / web images
              </button>
            </Section>
          </div>
        </div>
      </main>

      <ImageSearchModal
        open={imageSearchOpen}
        initialQuery={title.replace(/<[^>]+>/g, "").trim().slice(0, 80)}
        onClose={() => setImageSearchOpen(false)}
        onPick={(url) => setFeaturedImage(url)}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid #f3f4f6" }}>{title}</h3>
      {children}
    </div>
  );
}

const lblStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginTop: 12, marginBottom: 4 };
const inpStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none", background: "#fff", boxSizing: "border-box" };
