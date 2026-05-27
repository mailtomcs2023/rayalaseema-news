"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Camera, ImageIcon, Lock, X, Loader2 } from "lucide-react";

// Web port of the Expo NewArticleScreen.
//
// Same fields and same submission flow:
//   • title  (multiline)
//   • summary (multiline)
//   • body (plain text — wrapped in <p>…</p> on save, mirroring the Expo client)
//   • category (chip picker, /api/reporter/categories)
//   • featured image (file picker + preview, uploaded to /api/reporter/upload)
//   • "Translate to Telugu" — calls /api/ai/rewrite { action: "translate" }
//   • Save Draft / Submit for Review buttons
//
// The Expo screen also supports edit mode via ?id=. This web version is
// CREATE-only for now; edit will reuse the same component once we wire the
// edit route up.

interface Category {
  id: string;
  name: string | null;
  nameEn: string | null;
  slug: string;
  color: string | null;
}

interface Props {
  kycVerified: boolean;
}

export function ArticleEditor({ kycVerified }: Props) {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [catLoading, setCatLoading] = useState(true);
  const [catError, setCatError] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [topError, setTopError] = useState("");
  const busy = saving || submitting || translating;

  const loadCategories = async () => {
    setCatLoading(true);
    setCatError("");
    try {
      const r = await fetch("/api/reporter/categories", { cache: "no-store" });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setCategories(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setCatError(e?.message || "Failed to load categories");
    } finally {
      setCatLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  // Revoke object URLs when a new file replaces the old preview.
  useEffect(() => {
    return () => {
      if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  };

  const clearImage = () => {
    if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const translate = async () => {
    if (!title && !body) {
      setTopError("Write something to translate first.");
      return;
    }
    setTranslating(true);
    setTopError("");
    try {
      const r = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `Title: ${title}\n\nBody: ${body}`,
          action: "translate",
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      if (data.result) {
        const h2 = data.result.match(/<h2[^>]*>(.*?)<\/h2>/);
        if (h2) setTitle(h2[1].replace(/<[^>]+>/g, "").trim());
        const p = data.result.match(/<p[^>]*>(.*?)<\/p>/);
        if (p) setSummary(p[1].replace(/<[^>]+>/g, "").trim().substring(0, 200));
        setBody(htmlToPlain(data.result));
      }
    } catch (e: any) {
      setTopError(e?.message || "Translation failed");
    } finally {
      setTranslating(false);
    }
  };

  const uploadImage = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/reporter/upload", { method: "POST", body: fd });
    if (!r.ok) throw new Error((await r.json()).error || "Upload failed");
    const data = await r.json();
    return data.url as string;
  };

  const generateSlug = (t: string) => {
    const en = t.replace(/[^\x00-\x7F]/g, "").trim();
    if (!en) return `news-${Date.now()}`;
    return en
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .substring(0, 60);
  };

  const handleSave = async (intent: "draft" | "submit") => {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Title is required";
    if (!body.trim()) next.body = "Body is required";
    if (!categoryId) next.categoryId = "Pick a category";
    setErrors(next);
    if (Object.keys(next).length) return;

    const setBusy = intent === "submit" ? setSubmitting : setSaving;
    setBusy(true);
    setTopError("");
    try {
      let featuredImage: string | null = null;
      if (imageFile) featuredImage = await uploadImage(imageFile);

      const r = await fetch("/api/reporter/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          slug: generateSlug(title),
          summary: summary.trim(),
          body: `<p>${body.trim()}</p>`,
          categoryId,
          featuredImage,
          status: intent === "submit" ? "SUBMITTED" : "DRAFT",
        }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || `Save failed (${r.status})`);
      }

      router.push("/reporter/articles?status=" + (intent === "submit" ? "SUBMITTED" : "DRAFT"));
      router.refresh();
    } catch (e: any) {
      setTopError(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: "#111", marginBottom: 14 }}>
        New Article
      </h1>

      {topError ? (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#dc2626",
            borderRadius: 10,
            padding: 12,
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 12,
          }}
        >
          {topError}
        </div>
      ) : null}

      {/* Featured image — moved to the top so the visual hero anchors the
          page; the rest of the form (headline / body / category) sits below. */}
      <Label>Featured image</Label>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={photoBtnStyle}
        >
          <ImageIcon size={16} color="#555" />
          Choose from device
        </button>
        <button
          type="button"
          onClick={() => {
            if (fileInputRef.current) {
              fileInputRef.current.setAttribute("capture", "environment");
              fileInputRef.current.click();
            }
          }}
          style={photoBtnStyle}
        >
          <Camera size={16} color="#555" />
          Camera
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={onPickFile}
          style={{ display: "none" }}
        />
      </div>
      {imagePreview ? (
        <div style={{ position: "relative", marginBottom: 16 }}>
          <img
            src={imagePreview}
            alt=""
            style={{ width: "100%", maxHeight: 280, objectFit: "cover", borderRadius: 10, display: "block" }}
          />
          <button
            type="button"
            onClick={clearImage}
            aria-label="Remove image"
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              border: "none",
              borderRadius: "50%",
              width: 30,
              height: 30,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <X size={16} />
          </button>
        </div>
      ) : null}

      <Label>Headline</Label>
      <textarea
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          if (errors.title) setErrors((p) => ({ ...p, title: "" }));
        }}
        placeholder="Type the headline"
        rows={2}
        style={inputStyle(!!errors.title)}
      />
      <FieldError message={errors.title} />

      <Label>Summary</Label>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="Short summary"
        rows={3}
        style={inputStyle(false)}
      />

      <Label>Body</Label>
      <textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          if (errors.body) setErrors((p) => ({ ...p, body: "" }));
        }}
        placeholder="Write the article"
        rows={10}
        style={inputStyle(!!errors.body)}
      />
      <FieldError message={errors.body} />

      <button
        type="button"
        onClick={translate}
        disabled={busy}
        style={{
          width: "100%",
          marginTop: 6,
          marginBottom: 14,
          background: "#FF2C2C",
          color: "#fff",
          border: "none",
          borderRadius: 10,
          padding: "12px 14px",
          fontSize: 14,
          fontWeight: 700,
          cursor: busy ? "not-allowed" : "pointer",
          opacity: translating ? 0.7 : 1,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          boxShadow: "0 2px 6px rgba(255,44,44,0.25)",
        }}
      >
        {translating ? <Loader2 size={16} className="rep-spin" /> : <Sparkles size={16} />}
        {translating ? "Translating…" : "Translate to Telugu"}
      </button>

      <Label>Category</Label>
      {catError ? (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <p style={{ fontSize: 13, color: "#dc2626", fontWeight: 600 }}>{catError}</p>
          <button onClick={loadCategories} style={{ marginTop: 6, background: "transparent", border: "none", color: "#FF2C2C", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            Retry
          </button>
        </div>
      ) : catLoading ? (
        <p style={{ fontSize: 13, color: "#999", padding: "10px 0", marginBottom: 8 }}>Loading…</p>
      ) : categories.length === 0 ? (
        <p style={{ fontSize: 13, color: "#999", padding: "10px 0", marginBottom: 8 }}>
          No categories available yet.
        </p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {categories.map((c) => {
            const active = categoryId === c.id;
            const colour = c.color || "#FF2C2C";
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setCategoryId(c.id);
                  if (errors.categoryId) setErrors((p) => ({ ...p, categoryId: "" }));
                }}
                style={{
                  padding: "8px 14px",
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  border: `1px solid ${active ? colour : "#e5e7eb"}`,
                  background: active ? colour : "#fff",
                  color: active ? "#fff" : "#555",
                }}
              >
                {c.nameEn || c.name || c.slug}
              </button>
            );
          })}
        </div>
      )}
      <FieldError message={errors.categoryId} />

      {/* Action row */}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button
          type="button"
          onClick={() => handleSave("draft")}
          disabled={busy}
          style={{
            flex: 1,
            padding: 16,
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 700,
            color: "#555",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Save Draft"}
        </button>

        {kycVerified ? (
          <button
            type="button"
            onClick={() => handleSave("submit")}
            disabled={busy}
            style={{
              flex: 2,
              padding: 16,
              background: "#FF2C2C",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 700,
              cursor: busy ? "not-allowed" : "pointer",
              opacity: submitting ? 0.8 : 1,
            }}
          >
            {submitting ? "Submitting…" : "Submit for Review"}
          </button>
        ) : (
          <div
            style={{
              flex: 2,
              padding: 14,
              background: "#f3f4f6",
              borderRadius: 10,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              color: "#888",
              fontWeight: 700,
              fontSize: 12,
              textAlign: "center",
            }}
          >
            <Lock size={14} />
            Verify KYC to submit
          </div>
        )}
      </div>

      <div style={{ height: 40 }} />

      <style>{`
        .rep-spin { animation: rep-spin 0.9s linear infinite; }
        @keyframes rep-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 4, marginTop: 8 }}>
      {children}
    </p>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p style={{ fontSize: 12, color: "#dc2626", fontWeight: 600, marginTop: -4, marginBottom: 8 }}>
      {message}
    </p>
  );
}

function inputStyle(error: boolean): React.CSSProperties {
  return {
    width: "100%",
    background: "#fff",
    border: `1px solid ${error ? "#dc2626" : "#e5e7eb"}`,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    marginBottom: 8,
    fontFamily: "inherit",
    resize: "vertical",
    boxSizing: "border-box",
  };
}

const photoBtnStyle: React.CSSProperties = {
  flex: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: 14,
  background: "#fff",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
  color: "#555",
};

function htmlToPlain(html: string): string {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
