"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
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

export default function NewArticlePage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [featuredImage, setFeaturedImage] = useState("");
  const [status, setStatus] = useState("DRAFT");
  const [featured, setFeatured] = useState(false);
  const [breaking, setBreaking] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(""); // ISO local string from <input type="datetime-local">
  const [deskId, setDeskId] = useState("");          // "" = auto-resolve on create
  const [desks, setDesks] = useState<any[]>([]);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiAction, setAiAction] = useState("");
  const [success, setSuccess] = useState("");
  const editorRef = useRef<RichEditorRef>(null);

  // Load categories + desks
  useEffect(() => {
    fetch("/api/categories").then((r) => r.json()).then(setCategories);
    fetch("/api/desks").then((r) => r.json()).then(setDesks).catch(() => {});
  }, []);

  // Auto-generate slug - only from English characters
  const generateSlug = (text: string) => {
    // Extract only English/ASCII characters for slug
    const english = text.replace(/[^\x00-\x7F]/g, "").trim();
    if (!english) return "";
    return english
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .substring(0, 80);
  };

  const handleTitleChange = (val: string) => {
    setTitle(val);
    // Only auto-generate slug if user hasn't manually edited it
    const autoSlug = generateSlug(val);
    if (autoSlug && (!slug || slug === generateSlug(title))) {
      setSlug(autoSlug);
    }
  };

  const handleSubmit = async (publishStatus: string) => {
    setSaving(true);
    setError("");

    if (!title.trim()) { setError("Title is required"); setSaving(false); return; }
    if (!slug.trim()) { setError("Slug is required"); setSaving(false); return; }
    if (!categoryId) { setError("Category is required"); setSaving(false); return; }

    // Schedule = APPROVED status + future scheduledAt. API converts to SCHEDULED.
    const isSchedule = publishStatus === "SCHEDULED";
    if (isSchedule) {
      if (!scheduledAt) { setError("Pick a date/time to schedule"); setSaving(false); return; }
      if (new Date(scheduledAt).getTime() <= Date.now()) { setError("Schedule time must be in the future"); setSaving(false); return; }
    }

    const res = await fetch("/api/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        slug: slug.trim(),
        summary: summary.trim(),
        body,
        categoryId,
        featuredImage: featuredImage.trim() || null,
        status: publishStatus,
        featured,
        breaking,
        deskId: deskId || null,    // null → backend auto-resolves
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create article");
      setSaving(false);
      return;
    }

    router.push("/articles");
    router.refresh();
  };

  const handleAI = async (action: string) => {
    const text = body || summary || title;
    if (!text) { setError("No content to process - write something first"); return; }
    setAiLoading(true);
    setAiAction(action);
    setError("");
    try {
      const res = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `Title: ${title}\n\nSummary: ${summary}\n\nBody: ${body.replace(/<[^>]+>/g, " ").trim()}`,
          action,
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
        } else if (action === "proofread") {
          setBody(data.result);
          editorRef.current?.setContent(data.result);
          setSuccess("Proofread complete!");
        } else {
          // Translation or editorial - update title, summary, body
          const h2Match = data.result.match(/<h2[^>]*>(.*?)<\/h2>/);
          if (h2Match) setTitle(h2Match[1].replace(/<[^>]+>/g, "").trim());
          const pMatch = data.result.match(/<p[^>]*>(.*?)<\/p>/);
          if (pMatch) {
            const firstPara = pMatch[1].replace(/<[^>]+>/g, "").trim();
            if (firstPara.length > 20) setSummary(firstPara.substring(0, 200));
          }
          setBody(data.result);
          editorRef.current?.setContent(data.result);
          setSuccess(`Translated! (${data.tokens?.total_tokens || 0} tokens)`);
        }
      }
    } catch (e: any) { setError(e.message); }
    setAiLoading(false);
    setAiAction("");
    setTimeout(() => setSuccess(""), 6000);
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111" }}>New Article</h1>
            <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>Create a new article</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => handleSubmit("DRAFT")}
              disabled={saving}
              style={{ padding: "10px 20px", background: "#fff", color: "#555", border: "1px solid #ddd", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              Save Draft
            </button>
            <button
              onClick={() => handleSubmit("IN_REVIEW")}
              disabled={saving}
              style={{ padding: "10px 20px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              Submit for Review
            </button>
            <button
              onClick={() => handleSubmit("SCHEDULED")}
              disabled={saving || !scheduledAt}
              title={!scheduledAt ? "Pick a date/time in the sidebar first" : "Schedule for auto-publish"}
              style={{ padding: "10px 20px", background: scheduledAt ? "#7c3aed" : "#e5e7eb", color: scheduledAt ? "#fff" : "#999", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: scheduledAt ? "pointer" : "not-allowed" }}
            >
              Schedule
            </button>
            <button
              onClick={() => handleSubmit("PUBLISHED")}
              disabled={saving}
              style={{ padding: "10px 20px", background: "#FF2C2C", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              {saving ? "Publishing..." : "Publish Now"}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "#dc2626" }}>
            {error}
          </div>
        )}
        {/* Success */}
        {success && (
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "#166534", whiteSpace: "pre-wrap" }}>
            {success}
          </div>
        )}

        <div className="admin-split" style={{ display: "flex", gap: 20 }}>
          {/* Left: Main editor */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Title */}
            <div style={{ background: "#fff", borderRadius: 10, padding: 20, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <TeluguInput
                value={title}
                onChange={handleTitleChange}
                placeholder="Article title... (type English, press Space for Telugu)"
                style={{ fontSize: 22, fontWeight: 800, color: "#111" }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                <span style={{ fontSize: 12, color: "#888", flexShrink: 0 }}>Slug:</span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="enter-english-slug-here (required)"
                  style={{ flex: 1, border: "1px solid #eee", borderRadius: 6, padding: "6px 10px", fontSize: 13, color: "#333", fontFamily: "monospace", boxSizing: "border-box" }}
                />
              </div>
              <p style={{ fontSize: 11, color: "#bbb", marginTop: 4 }}>
                URL slug in English (e.g. "ipl-2026-lucknow-win"). Type in English - this is the URL path.
              </p>
            </div>

            {/* Summary */}
            <div style={{ background: "#fff", borderRadius: 10, padding: 20, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 8 }}>Summary (60 words for short news app)</label>
              <TeluguInput
                value={summary}
                onChange={setSummary}
                placeholder="Brief summary... (type English, press Space for Telugu)"
                multiline
                rows={3}
                style={{ border: "1px solid #eee", borderRadius: 8, padding: 12, fontSize: 14, resize: "vertical" }}
              />
              <p style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>{summary.split(/\s+/).filter(Boolean).length} / 60 words</p>
            </div>

            {/* AI Tools Bar */}
            <div style={{ background: "#111827", borderRadius: 10, padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#9ca3af" }}>AI (GPT-5.1):</span>
              <button onClick={() => handleAI("translate")} disabled={aiLoading}
                style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: aiLoading ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700, background: aiLoading && aiAction === "translate" ? "#4b5563" : "#3b82f6", color: "#fff" }}>
                {aiLoading && aiAction === "translate" ? "Translating..." : "తెలుగులో రాయండి"}
              </button>
              <button onClick={() => handleAI("editorial")} disabled={aiLoading}
                style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: aiLoading ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700, background: aiLoading && aiAction === "editorial" ? "#4b5563" : "#FF2C2C", color: "#fff" }}>
                {aiLoading && aiAction === "editorial" ? "Writing..." : "రాయలసీమ ఎడిటోరియల్"}
              </button>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button onClick={() => handleAI("proofread")} disabled={aiLoading}
                  style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #374151", background: "transparent", color: "#9ca3af", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  Proofread
                </button>
                <button onClick={() => handleAI("summarize")} disabled={aiLoading}
                  style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #374151", background: "transparent", color: "#9ca3af", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  Summary
                </button>
                <button onClick={() => handleAI("headline")} disabled={aiLoading}
                  style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #374151", background: "transparent", color: "#9ca3af", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  Headlines
                </button>
                <button onClick={() => handleAI("expand")} disabled={aiLoading}
                  style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #374151", background: "transparent", color: "#9ca3af", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  Expand
                </button>
              </div>
            </div>

            {/* Body - Rich Text Editor */}
            <div style={{ marginBottom: 16 }}>
              <RichEditor ref={editorRef} content={body} onChange={setBody} />
            </div>
          </div>

          {/* Right: Sidebar settings */}
          <div className="admin-side" style={{ width: 320, flexShrink: 0 }}>
            {/* Category */}
            <div style={{ background: "#fff", borderRadius: 10, padding: 20, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 8 }}>Category *</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                style={{ width: "100%", border: "1px solid #eee", borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none", boxSizing: "border-box" }}
              >
                <option value="">Select category...</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} ({cat.nameEn})
                  </option>
                ))}
              </select>
            </div>

            {/* Desk byline */}
            <div style={{ background: "#fff", borderRadius: 10, padding: 20, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 8 }}>Desk (byline)</label>
              <select value={deskId} onChange={(e) => setDeskId(e.target.value)}
                style={{ width: "100%", border: "1px solid #eee", borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none", boxSizing: "border-box" }}>
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
              <p style={{ fontSize: 11, color: "#aaa", marginTop: 6 }}>Leave on Auto unless you want a specific byline.</p>
            </div>

            {/* Featured Image */}
            <div style={{ background: "#fff", borderRadius: 10, padding: 20, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <ImageUpload value={featuredImage} onChange={setFeaturedImage} />
            </div>

            {/* Options */}
            <div style={{ background: "#fff", borderRadius: 10, padding: 20, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 12 }}>Options</label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 10 }}>
                <input
                  type="checkbox"
                  checked={featured}
                  onChange={(e) => setFeatured(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ fontSize: 13, color: "#555" }}>Featured (show in homepage slider)</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={breaking}
                  onChange={(e) => setBreaking(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ fontSize: 13, color: "#555" }}>Breaking News</span>
              </label>
            </div>

            {/* Schedule */}
            <div style={{ background: "#fff", borderRadius: 10, padding: 20, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 8 }}>
                Schedule publish (optional)
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                style={{ width: "100%", border: "1px solid #eee", borderRadius: 8, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }}
              />
              <p style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
                Pick a future date/time then click <strong>Schedule</strong>. Article stays hidden until then.
              </p>
            </div>

            {/* SEO Preview */}
            <div style={{ background: "#fff", borderRadius: 10, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 8 }}>SEO Preview</label>
              <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: "#1a0dab" }}>{title || "Article title"}</p>
                <p style={{ fontSize: 12, color: "#006621", marginTop: 2 }}>rayalaseemaexpress.com/article/{slug || "article-slug"}</p>
                <p style={{ fontSize: 12, color: "#545454", marginTop: 4, lineHeight: 1.5 }}>{summary || "Article summary will appear here..."}</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
