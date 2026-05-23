"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { RichEditor, type RichEditorRef } from "@/components/rich-editor";
import { TeluguInput } from "@/components/telugu-input";
import { ImageUpload } from "@/components/image-upload";

interface Category {
  id: string;
  name: string;
  nameEn: string;
  slug: string;
}

export default function EditArticlePage() {
  const router = useRouter();
  const params = useParams();
  const articleId = params.id as string;

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [featuredImage, setFeaturedImage] = useState("");
  const [status, setStatus] = useState("DRAFT");
  const [featured, setFeatured] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(""); // datetime-local value, empty = no schedule
  const [tagsInput, setTagsInput] = useState(""); // comma-separated tag names
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [deskId, setDeskId] = useState("");   // "" = auto-resolve on save
  const [desks, setDesks] = useState<any[]>([]);
  const [currentDeskLabel, setCurrentDeskLabel] = useState("");

  // Revisions
  const [revisions, setRevisions] = useState<any[]>([]);
  const [showRevisions, setShowRevisions] = useState(false);
  const [previewRev, setPreviewRev] = useState<any | null>(null);
  const [revLoading, setRevLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);

  const [districts, setDistricts] = useState<any[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [selectedConstituency, setSelectedConstituency] = useState("");
  const [breaking, setBreaking] = useState(false);
  const [socialPlatforms, setSocialPlatforms] = useState<Record<string, boolean>>({
    telegram: true, twitter: true, facebook: true, linkedin: false, instagram: false, whatsapp: false, pinterest: false,
  });
  const [shareResults, setShareResults] = useState<Record<string, { success: boolean; error?: string }>>({});
  const [sharing, setSharing] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAction, setAiAction] = useState("");
  const editorRef = useRef<RichEditorRef>(null);

  // Load article, categories, and locations
  useEffect(() => {
    Promise.all([
      fetch(`/api/articles/${articleId}`).then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
      fetch("/api/locations").then((r) => r.json()).catch(() => []),
      fetch("/api/desks").then((r) => r.json()).catch(() => []),
    ]).then(([article, cats, locs, deskList]) => {
      setDistricts(locs || []);
      setDesks(deskList || []);
      if (article.error) {
        setError("Article not found");
        setLoading(false);
        return;
      }
      setTitle(article.title || "");
      setSlug(article.slug || "");
      setSummary(article.summary || "");
      setBody(article.body || "");
      setCategoryId(article.categoryId || "");
      setFeaturedImage(article.featuredImage || "");
      setStatus(article.status || "DRAFT");
      setFeatured(article.featured || false);
      setSelectedConstituency(article.constituencyId || "");
      setBreaking(article.breaking || false);
      // Convert ISO date to datetime-local format (YYYY-MM-DDTHH:mm) in local TZ
      if (article.scheduledAt) {
        const d = new Date(article.scheduledAt);
        const off = d.getTimezoneOffset() * 60000;
        setScheduledAt(new Date(d.getTime() - off).toISOString().slice(0, 16));
      }
      // Tags + SEO
      if (Array.isArray(article.tags)) {
        setTagsInput(article.tags.map((at: any) => at.tag?.name).filter(Boolean).join(", "));
      }
      setMetaTitle(article.metaTitle || "");
      setMetaDescription(article.metaDescription || "");
      setOgImage(article.ogImage || "");
      setDeskId(article.deskId || "");
      // Look up the current desk name for display (the article API doesn't include the join).
      if (article.deskId && Array.isArray(deskList)) {
        const d = deskList.find((x: any) => x.id === article.deskId);
        if (d) setCurrentDeskLabel(`${d.name} (${d.branch})`);
      }
      setCategories(cats);
      setLoading(false);
    });
  }, [articleId]);

  const handleSave = async (newStatus?: string) => {
    setSaving(true);
    setError("");
    setSuccess("");

    // Validate schedule if scheduling
    if (newStatus === "SCHEDULED") {
      if (!scheduledAt) { setError("Pick a date/time to schedule"); setSaving(false); return; }
      if (new Date(scheduledAt).getTime() <= Date.now()) { setError("Schedule time must be in the future"); setSaving(false); return; }
    }

    const res = await fetch(`/api/articles/${articleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title, slug, summary, body, categoryId,
        featuredImage: featuredImage || null,
        status: newStatus || status,
        featured, breaking,
        constituencyId: selectedConstituency || null,
        deskId: deskId || null,    // null → backend auto-resolves via desk-resolver.ts
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        tagNames: tagsInput.split(",").map((s) => s.trim()).filter(Boolean),
        metaTitle: metaTitle.trim() || null,
        metaDescription: metaDescription.trim() || null,
        ogImage: ogImage.trim() || null,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to save");
    } else {
      setSuccess("Article saved successfully!");
      if (newStatus) setStatus(newStatus);
      setTimeout(() => setSuccess(""), 3000);
    }
    setSaving(false);
  };

  const handleAI = async (action: string) => {
    const text = body || summary || title;
    if (!text) { setError("No content to process"); return; }
    setAiLoading(true);
    setAiAction(action);
    setError("");
    try {
      // Extract source URL from body if present
      const urlMatch = body.match(/href="(https?:\/\/[^"]+)"/);
      const sourceUrl = urlMatch ? urlMatch[1] : undefined;

      const res = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `Title: ${title}\n\nSummary: ${summary}\n\nBody: ${body.replace(/<[^>]+>/g, " ").trim()}`,
          action,
          sourceUrl,
        }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); }
      else if (data.result) {
        if (action === "summarize") {
          setSummary(data.result.replace(/<[^>]+>/g, "").trim());
          setSuccess("Summary generated!");
        } else if (action === "headline") {
          setSuccess(data.result);
        } else {
          // Extract Telugu title from first h2 tag
          const h2Match = data.result.match(/<h2[^>]*>(.*?)<\/h2>/);
          if (h2Match) {
            setTitle(h2Match[1].replace(/<[^>]+>/g, "").trim());
          }
          // Extract summary from first paragraph
          const pMatch = data.result.match(/<p[^>]*>(.*?)<\/p>/);
          if (pMatch) {
            const firstPara = pMatch[1].replace(/<[^>]+>/g, "").trim();
            if (firstPara.length > 20) {
              setSummary(firstPara.substring(0, 200));
            }
          }
          setBody(data.result);
          editorRef.current?.setContent(data.result);
          setSuccess(`Title, summary & body translated! (${data.tokens?.total_tokens || data.tokens?.total || 0} tokens)`);
        }
      }
    } catch (e: any) { setError(e.message); }
    setAiLoading(false);
    setAiAction("");
    setTimeout(() => setSuccess(""), 5000);
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this article? This cannot be undone.")) return;
    await fetch(`/api/articles/${articleId}`, { method: "DELETE" });
    router.push("/articles");
    router.refresh();
  };

  const loadRevisions = async () => {
    setRevLoading(true);
    try {
      const res = await fetch(`/api/articles/${articleId}/revisions`);
      const data = await res.json();
      setRevisions(data.revisions || []);
    } finally {
      setRevLoading(false);
    }
  };

  const openRevision = async (revId: string) => {
    const res = await fetch(`/api/articles/${articleId}/revisions/${revId}`);
    const data = await res.json();
    setPreviewRev(data);
  };

  const restoreRevision = async (revId: string) => {
    if (!confirm("Restore this version? Current content will be saved as a new revision first (reversible).")) return;
    setRestoreLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/articles/${articleId}/revisions/${revId}/restore`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Restore failed"); return; }
      // Reload article from server
      const fresh = await fetch(`/api/articles/${articleId}`).then(r => r.json());
      setTitle(fresh.title);
      setSlug(fresh.slug);
      setSummary(fresh.summary || "");
      setBody(fresh.body || "");
      setFeaturedImage(fresh.featuredImage || "");
      setCategoryId(fresh.categoryId || "");
      editorRef.current?.setContent(fresh.body || "");
      setPreviewRev(null);
      setSuccess("Version restored");
      await loadRevisions();
      setTimeout(() => setSuccess(""), 3000);
    } finally {
      setRestoreLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
        <Sidebar />
        <main style={{ marginLeft: 240, flex: 1, padding: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: "#888" }}>Loading article...</p>
        </main>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111" }}>Edit Article</h1>
            <p style={{ fontSize: 12, color: "#888", marginTop: 2, fontFamily: "monospace" }}>ID: {articleId}</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {/* Status badge */}
            <span style={{
              padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700,
              background: status === "PUBLISHED" ? "#dcfce7" : status === "DRAFT" ? "#fef3c7" : status === "SCHEDULED" ? "#ede9fe" : "#dbeafe",
              color: status === "PUBLISHED" ? "#166534" : status === "DRAFT" ? "#92400e" : status === "SCHEDULED" ? "#5b21b6" : "#1e40af",
            }}>
              {status === "SCHEDULED" && scheduledAt
                ? `SCHEDULED · ${new Date(scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`
                : status}
            </span>

            <button onClick={() => handleSave()} disabled={saving}
              style={{ padding: "8px 16px", background: "#fff", color: "#333", border: "1px solid #ddd", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Save
            </button>

            {/* Submit for Review (Reporter/Draft) */}
            {(status === "DRAFT" || status === "REJECTED") && (
              <button onClick={() => handleSave("SUBMITTED")} disabled={saving}
                style={{ padding: "8px 16px", background: "#f59e0b", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Submit for Review
              </button>
            )}

            {/* Approve (Sub-editor/Chief) */}
            {(status === "SUBMITTED" || status === "IN_REVIEW") && (
              <button onClick={() => handleSave("APPROVED")} disabled={saving}
                style={{ padding: "8px 16px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Approve ✓
              </button>
            )}

            {/* Schedule (any non-published state can be scheduled) */}
            {status !== "PUBLISHED" && (
              <button onClick={() => handleSave("SCHEDULED")} disabled={saving || !scheduledAt}
                title={!scheduledAt ? "Pick a date/time in the sidebar first" : "Schedule auto-publish"}
                style={{ padding: "8px 16px", background: scheduledAt ? "#7c3aed" : "#e5e7eb", color: scheduledAt ? "#fff" : "#999", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: scheduledAt ? "pointer" : "not-allowed" }}>
                Schedule
              </button>
            )}

            {/* Publish (Chief/Admin) */}
            {status !== "PUBLISHED" && (
              <button onClick={() => handleSave("PUBLISHED")} disabled={saving}
                style={{ padding: "8px 16px", background: "#FF2C2C", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Publish
              </button>
            )}

            {/* Unpublish */}
            {status === "PUBLISHED" && (
              <button onClick={() => handleSave("DRAFT")} disabled={saving}
                style={{ padding: "8px 16px", background: "#f59e0b", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Unpublish
              </button>
            )}

            <button onClick={() => { setShowRevisions(true); loadRevisions(); }}
              style={{ padding: "8px 16px", background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Revisions
            </button>

            <button onClick={handleDelete}
              style={{ padding: "8px 16px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Delete
            </button>
          </div>
        </div>

        {/* Messages */}
        {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "#dc2626" }}>{error}</div>}
        {success && <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "#166534" }}>{success}</div>}

        <div className="admin-split" style={{ display: "flex", gap: 20 }}>
          {/* Left: Editor */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Title */}
            <div style={{ background: "#fff", borderRadius: 10, padding: 20, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <TeluguInput
                value={title}
                onChange={setTitle}
                placeholder="Article title..."
                style={{ fontSize: 22, fontWeight: 800, color: "#111" }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                <span style={{ fontSize: 12, color: "#888", flexShrink: 0 }}>Slug:</span>
                <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)}
                  style={{ flex: 1, border: "1px solid #eee", borderRadius: 6, padding: "6px 10px", fontSize: 13, color: "#333", fontFamily: "monospace", boxSizing: "border-box" }} />
              </div>
            </div>

            {/* Summary */}
            <div style={{ background: "#fff", borderRadius: 10, padding: 20, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 8 }}>Summary</label>
              <TeluguInput
                value={summary}
                onChange={setSummary}
                placeholder="Brief summary..."
                multiline rows={3}
                style={{ border: "1px solid #eee", borderRadius: 8, padding: 12, fontSize: 14, resize: "vertical" }}
              />
            </div>

            {/* AI Tools Bar - Just 2 buttons */}
            <div style={{ background: "#111827", borderRadius: 10, padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#9ca3af" }}>AI (GPT-5.1):</span>

              {/* Button 1: Standard Telugu */}
              <button
                onClick={() => handleAI("translate")}
                disabled={aiLoading}
                style={{
                  padding: "8px 20px", borderRadius: 8, border: "none", cursor: aiLoading ? "not-allowed" : "pointer",
                  fontSize: 13, fontWeight: 700,
                  background: aiLoading && aiAction === "translate" ? "#4b5563" : "#3b82f6",
                  color: "#fff",
                }}
              >
                {aiLoading && aiAction === "translate" ? "Translating..." : "తెలుగులో రాయండి (Standard Telugu)"}
              </button>

              {/* Button 2: Rayalaseema Editorial */}
              <button
                onClick={() => handleAI("editorial")}
                disabled={aiLoading}
                style={{
                  padding: "8px 20px", borderRadius: 8, border: "none", cursor: aiLoading ? "not-allowed" : "pointer",
                  fontSize: 13, fontWeight: 700,
                  background: aiLoading && aiAction === "editorial" ? "#4b5563" : "#FF2C2C",
                  color: "#fff",
                }}
              >
                {aiLoading && aiAction === "editorial" ? "Writing..." : "రాయలసీమ ఎడిటోరియల్"}
              </button>

              {/* Small utility buttons */}
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button onClick={() => handleAI("summarize")} disabled={aiLoading}
                  style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #374151", background: "transparent", color: "#9ca3af", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  Summary
                </button>
                <button onClick={() => handleAI("headline")} disabled={aiLoading}
                  style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #374151", background: "transparent", color: "#9ca3af", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  Headlines
                </button>
              </div>
            </div>

            {/* Body - Rich Editor */}
            <div style={{ marginBottom: 16 }}>
              <RichEditor ref={editorRef} content={body} onChange={setBody} />
            </div>
          </div>

          {/* Right: Settings */}
          <div className="admin-side" style={{ width: 300, flexShrink: 0 }}>
            {/* Category */}
            <div style={{ background: "#fff", borderRadius: 10, padding: 16, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 6 }}>Category</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
                style={{ width: "100%", border: "1px solid #eee", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none", boxSizing: "border-box" }}>
                <option value="">Select...</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.nameEn})</option>)}
              </select>
            </div>

            {/* Location - District & Constituency */}
            <div style={{ background: "#fff", borderRadius: 10, padding: 16, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 6 }}>Location (optional)</label>
              <select value={selectedDistrict} onChange={(e) => { setSelectedDistrict(e.target.value); setSelectedConstituency(""); }}
                style={{ width: "100%", border: "1px solid #eee", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 8 }}>
                <option value="">Select District...</option>
                {districts.map((d: any) => <option key={d.id} value={d.id}>{d.name} ({d.nameEn})</option>)}
              </select>
              {selectedDistrict && (
                <select value={selectedConstituency} onChange={(e) => setSelectedConstituency(e.target.value)}
                  style={{ width: "100%", border: "1px solid #eee", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none", boxSizing: "border-box" }}>
                  <option value="">Select Constituency...</option>
                  {districts.find((d: any) => d.id === selectedDistrict)?.constituencies?.map((c: any) =>
                    <option key={c.id} value={c.id}>{c.name} ({c.nameEn})</option>
                  )}
                </select>
              )}
              <p style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>Tag to district/constituency for location-based news</p>
            </div>

            {/* Desk byline */}
            <div style={{ background: "#fff", borderRadius: 10, padding: 16, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 6 }}>Desk (byline)</label>
              <select value={deskId} onChange={(e) => setDeskId(e.target.value)}
                style={{ width: "100%", border: "1px solid #eee", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none", boxSizing: "border-box" }}>
                <option value="">Auto (resolve from category/location)</option>
                <optgroup label="Geographic">
                  {desks.filter((d) => d.branch === "GEOGRAPHIC").map((d) => (
                    <option key={d.id} value={d.id}>{d.name}{d.nameEn ? ` — ${d.nameEn}` : ""}</option>
                  ))}
                </optgroup>
                <optgroup label="Topical">
                  {desks.filter((d) => d.branch === "TOPICAL").map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Editorial">
                  {desks.filter((d) => d.branch === "EDITORIAL").map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </optgroup>
              </select>
              {currentDeskLabel && deskId === "" && (
                <p style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
                  Currently: {currentDeskLabel}. Picking "Auto" will recompute on next save.
                </p>
              )}
            </div>

            {/* Featured Image */}
            <div style={{ background: "#fff", borderRadius: 10, padding: 16, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <ImageUpload value={featuredImage} onChange={setFeaturedImage} />
            </div>

            {/* Options */}
            <div style={{ background: "#fff", borderRadius: 10, padding: 16, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 10 }}>Options</label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 8 }}>
                <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} style={{ width: 16, height: 16 }} />
                <span style={{ fontSize: 13, color: "#555" }}>Featured (homepage slider)</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={breaking} onChange={(e) => setBreaking(e.target.checked)} style={{ width: 16, height: 16 }} />
                <span style={{ fontSize: 13, color: "#555" }}>Breaking News</span>
              </label>
            </div>

            {/* Tags */}
            <div style={{ background: "#fff", borderRadius: 10, padding: 16, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 6 }}>Tags</label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="comma, separated, tag, names"
                style={{ width: "100%", border: "1px solid #eee", borderRadius: 8, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }}
              />
              <p style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
                New tags auto-created on save. Public page: /tag/&lt;slug&gt;
              </p>
            </div>

            {/* SEO Meta Overrides */}
            <div style={{ background: "#fff", borderRadius: 10, padding: 16, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 10 }}>SEO overrides (optional)</label>
              <label style={{ display: "block", fontSize: 11, color: "#888", marginBottom: 4 }}>Meta title <span style={{ color: "#bbb" }}>(falls back to article title)</span></label>
              <input
                type="text"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                placeholder="60-70 chars"
                maxLength={120}
                style={{ width: "100%", border: "1px solid #eee", borderRadius: 8, padding: "8px 10px", fontSize: 13, boxSizing: "border-box", marginBottom: 10 }}
              />
              <label style={{ display: "block", fontSize: 11, color: "#888", marginBottom: 4 }}>Meta description <span style={{ color: "#bbb" }}>(falls back to summary)</span></label>
              <textarea
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                placeholder="155-160 chars"
                maxLength={220}
                rows={2}
                style={{ width: "100%", border: "1px solid #eee", borderRadius: 8, padding: "8px 10px", fontSize: 13, boxSizing: "border-box", marginBottom: 10, resize: "vertical" }}
              />
              <label style={{ display: "block", fontSize: 11, color: "#888", marginBottom: 4 }}>OG image URL <span style={{ color: "#bbb" }}>(falls back to featured image)</span></label>
              <input
                type="text"
                value={ogImage}
                onChange={(e) => setOgImage(e.target.value)}
                placeholder="https://..."
                style={{ width: "100%", border: "1px solid #eee", borderRadius: 8, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }}
              />
            </div>

            {/* Schedule */}
            <div style={{ background: "#fff", borderRadius: 10, padding: 16, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 8 }}>Schedule publish</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                style={{ width: "100%", border: "1px solid #eee", borderRadius: 8, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }}
              />
              <p style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
                Set future date/time then click <strong>Schedule</strong>. Hidden until then.
              </p>
              {status === "SCHEDULED" && (
                <button
                  onClick={() => { setScheduledAt(""); handleSave("DRAFT"); }}
                  style={{ marginTop: 8, padding: "6px 12px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                >
                  Cancel schedule
                </button>
              )}
            </div>

            {/* Social Media Sharing */}
            <div style={{ background: "#fff", borderRadius: 10, padding: 16, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 10 }}>Share to Social Media</label>
              {([
                { key: "telegram", label: "Telegram", icon: "✈️", color: "#0088cc" },
                { key: "twitter", label: "Twitter / X", icon: "𝕏", color: "#000" },
                { key: "facebook", label: "Facebook", icon: "f", color: "#1877f2" },
                { key: "linkedin", label: "LinkedIn", icon: "in", color: "#0a66c2" },
                { key: "instagram", label: "Instagram", icon: "📷", color: "#e4405f" },
                { key: "whatsapp", label: "WhatsApp", icon: "💬", color: "#25d366" },
                { key: "pinterest", label: "Pinterest", icon: "📌", color: "#e60023" },
              ] as const).map(({ key, label, icon, color }) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 6, padding: "4px 0" }}>
                  <input type="checkbox" checked={socialPlatforms[key] || false}
                    onChange={(e) => setSocialPlatforms((p) => ({ ...p, [key]: e.target.checked }))}
                    style={{ width: 15, height: 15 }} />
                  <span style={{ width: 22, height: 22, borderRadius: 5, background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{icon}</span>
                  <span style={{ fontSize: 12, color: "#333", flex: 1 }}>{label}</span>
                  {shareResults[key] && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: shareResults[key].success ? "#16a34a" : "#dc2626" }}>
                      {shareResults[key].success ? "✓ Posted" : "✗ Failed"}
                    </span>
                  )}
                </label>
              ))}
              {/* Share errors */}
              {Object.entries(shareResults).filter(([, r]) => !r.success && r.error).map(([key, r]) => (
                <p key={key} style={{ fontSize: 10, color: "#dc2626", margin: "2px 0 2px 30px" }}>{key}: {r.error}</p>
              ))}
              <button
                onClick={async () => {
                  const selected = Object.entries(socialPlatforms).filter(([, v]) => v).map(([k]) => k);
                  if (selected.length === 0) return alert("Select at least one platform");
                  if (status !== "PUBLISHED") return alert("Publish the article first before sharing");
                  setSharing(true);
                  setShareResults({});
                  try {
                    const categoryName = categories.find((c) => c.id === categoryId);
                    const res = await fetch("/api/social/share", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        platforms: selected,
                        article: { title, slug, summary, featuredImage, categoryNameEn: categoryName?.nameEn },
                      }),
                    });
                    const results = await res.json();
                    setShareResults(results);
                  } catch (err: any) {
                    alert("Share failed: " + err.message);
                  } finally {
                    setSharing(false);
                  }
                }}
                disabled={sharing || status !== "PUBLISHED"}
                style={{
                  width: "100%", marginTop: 10, padding: "10px 16px", borderRadius: 8, border: "none", cursor: sharing || status !== "PUBLISHED" ? "not-allowed" : "pointer",
                  fontSize: 13, fontWeight: 700,
                  background: status !== "PUBLISHED" ? "#e5e7eb" : sharing ? "#93c5fd" : "#3b82f6",
                  color: status !== "PUBLISHED" ? "#999" : "#fff",
                }}
              >
                {sharing ? "Sharing..." : status !== "PUBLISHED" ? "Publish first to share" : `Share to ${Object.values(socialPlatforms).filter(Boolean).length} platforms`}
              </button>
            </div>

            {/* View on frontend — uses NEXT_PUBLIC_SITE_URL so it points at
                the real public site in prod, not localhost. */}
            <a href={`${process.env.NEXT_PUBLIC_SITE_URL || "https://rayalaseemaexpress.com"}/article/${slug}`} target="_blank"
              style={{ display: "block", textAlign: "center", padding: "10px 16px", background: "#f3f4f6", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#555", textDecoration: "none", marginBottom: 12 }}>
              View on Frontend
            </a>
          </div>
        </div>

        {/* ===== Revisions Drawer ===== */}
        {showRevisions && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }} onClick={() => { setShowRevisions(false); setPreviewRev(null); }}>
            <div onClick={(e) => e.stopPropagation()} className="admin-rev-drawer" style={{ width: "min(900px, 95vw)", height: "100vh", background: "#fff", overflow: "auto", display: "flex" }}>
              {/* Revision list */}
              <div className="admin-rev-list" style={{ width: 320, borderRight: "1px solid #eee", overflowY: "auto" }}>
                <div style={{ padding: 16, borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>Version History</h2>
                  <button onClick={() => { setShowRevisions(false); setPreviewRev(null); }}
                    style={{ background: "none", border: "none", fontSize: 22, color: "#888", cursor: "pointer", lineHeight: 1 }}>×</button>
                </div>
                {revLoading && <p style={{ padding: 16, fontSize: 13, color: "#888" }}>Loading...</p>}
                {!revLoading && revisions.length === 0 && (
                  <p style={{ padding: 16, fontSize: 13, color: "#888" }}>No prior versions yet. Edits will appear here.</p>
                )}
                {revisions.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => openRevision(r.id)}
                    style={{
                      display: "block", width: "100%", textAlign: "left", padding: "12px 16px",
                      borderBottom: "1px solid #f3f4f6", background: previewRev?.id === r.id ? "#eff6ff" : "transparent",
                      border: "none", cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: 12, color: "#888", marginBottom: 2 }}>
                      {new Date(r.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#111", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                      {r.title}
                    </div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                      by {r.editedBy?.name || "?"} · {r.bodyLength} chars · {r.status}
                    </div>
                    {r.editNote && (
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4, fontStyle: "italic" }}>"{r.editNote}"</div>
                    )}
                  </button>
                ))}
              </div>

              {/* Preview pane */}
              <div style={{ flex: 1, padding: 20, overflowY: "auto" }}>
                {!previewRev && (
                  <p style={{ fontSize: 13, color: "#888" }}>Pick a version on the left to preview.</p>
                )}
                {previewRev && (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
                      <div>
                        <p style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em" }}>Version from</p>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>
                          {new Date(previewRev.createdAt).toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" })}
                        </p>
                        <p style={{ fontSize: 12, color: "#888" }}>by {previewRev.editedBy?.name}</p>
                      </div>
                      <button
                        onClick={() => restoreRevision(previewRev.id)}
                        disabled={restoreLoading}
                        style={{ padding: "8px 16px", background: "#FF2C2C", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: restoreLoading ? "not-allowed" : "pointer" }}
                      >
                        {restoreLoading ? "Restoring..." : "Restore this version"}
                      </button>
                    </div>

                    <div style={{ marginBottom: 12, padding: 12, background: "#f9fafb", borderRadius: 8, border: "1px solid #eee" }}>
                      <p style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Title</p>
                      <p style={{ fontSize: 18, fontWeight: 800, color: "#111", lineHeight: 1.3 }}>{previewRev.title}</p>
                      <p style={{ fontSize: 12, color: "#666", marginTop: 4, fontFamily: "monospace" }}>{previewRev.slug}</p>
                    </div>

                    {previewRev.summary && (
                      <div style={{ marginBottom: 12, padding: 12, background: "#f9fafb", borderRadius: 8, border: "1px solid #eee" }}>
                        <p style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Summary</p>
                        <p style={{ fontSize: 14, color: "#333", lineHeight: 1.6 }}>{previewRev.summary}</p>
                      </div>
                    )}

                    <div style={{ padding: 12, background: "#f9fafb", borderRadius: 8, border: "1px solid #eee" }}>
                      <p style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Body</p>
                      <div style={{ fontSize: 14, color: "#333", lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: previewRev.body || "" }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
