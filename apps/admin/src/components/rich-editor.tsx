"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import TiptapImage from "@tiptap/extension-image";
import TiptapLink from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import React from "react";
import Highlight from "@tiptap/extension-highlight";
import { useState, useCallback, useRef, useEffect } from "react";

// Spec #1 G1 #127 - industry-standard extensions.
// TipTap v3 exports many of these as named (not default). Color lives inside
// extension-text-style; text-style must be loaded for color to attach.
import { TextStyle, Color } from "@tiptap/extension-text-style";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Superscript } from "@tiptap/extension-superscript";
import { Subscript } from "@tiptap/extension-subscript";
import { Youtube } from "@tiptap/extension-youtube";

// G2 #129 - crop modal opened on image insert + on selected image edit.
import { ImageCropModal } from "@/components/image-crop-modal";

// Google Transliteration API (free, no key needed, works in 2026)
async function transliterate(word: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://inputtools.google.com/request?text=${encodeURIComponent(word)}&itc=te-t-i0-und&num=5&cp=0&cs=1&ie=utf-8&oe=utf-8&app=demopage`
    );
    const data = await res.json();
    if (data[0] === "SUCCESS" && data[1]?.[0]?.[1]?.length > 0) {
      return data[1][0][1];
    }
  } catch {}
  return [word];
}

export interface RichEditorRef {
  setContent: (html: string) => void;
  getHTML: () => string;
}

export const RichEditor = React.forwardRef<RichEditorRef, { content: string; onChange: (html: string) => void }>(function RichEditor({ content, onChange }, ref) {
  const [activePanel, setActivePanel] = useState<"none" | "link" | "image">("none");
  const [linkUrl, setLinkUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [inputMode, setInputMode] = useState<"telugu" | "english">("telugu");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // H1-H6 all enabled (industry-standard editor expects every level).
      // Tiptap v3 StarterKit now bundles Link + Underline; disable here so
      // our custom-configured TiptapLink (openOnClick: false, autolink: true)
      // and Underline don't double-register (was throwing "Duplicate
      // extension names found: ['link', 'underline']" in console).
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] }, link: false, underline: false }),
      TiptapImage.configure({ inline: false, allowBase64: true }),
      TiptapLink.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: "Start writing your article..." }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Underline,
      Highlight,
      // Spec #1 G1 #127 additions - text color, task list, table, sub/sup,
      // YouTube embed. text-style first so color can attach to its mark.
      TextStyle,
      Color,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Superscript,
      Subscript,
      Youtube.configure({ controls: true, nocookie: true }),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: { class: "tiptap-editor" },
      handleKeyDown: (view, event) => {
        if (inputMode !== "telugu") return false;
        if (event.key === " " || event.key === "Enter") {
          const { state } = view;
          const { from } = state.selection;
          const textBefore = state.doc.textBetween(Math.max(0, from - 30), from, " ");
          const words = textBefore.split(/\s/);
          const lastWord = words[words.length - 1];
          if (lastWord && /^[a-zA-Z]+$/.test(lastWord)) {
            event.preventDefault();
            transliterate(lastWord).then((results) => {
              if (results.length > 0 && results[0] !== lastWord) {
                const tr = view.state.tr;
                const wordStart = from - lastWord.length;
                tr.replaceWith(wordStart, from, view.state.schema.text(results[0]));
                if (event.key === " ") tr.insertText(" ");
                view.dispatch(tr);
              }
            });
            return true;
          }
        }
        return false;
      },
    },
  });

  // Expose setContent and getHTML to parent via ref
  React.useImperativeHandle(ref, () => ({
    setContent: (html: string) => {
      if (editor) editor.commands.setContent(html);
    },
    getHTML: () => {
      return editor?.getHTML() || "";
    },
  }), [editor]);

  // Drag & drop images
  useEffect(() => {
    if (!editor) return;
    const el = document.querySelector(".tiptap-editor");
    if (!el) return;
    const onDrop = (e: Event) => {
      const de = e as DragEvent;
      de.preventDefault();
      el.classList.remove("drag-over");
      const file = de.dataTransfer?.files?.[0];
      if (file?.type.startsWith("image/")) uploadFile(file);
    };
    const onOver = (e: Event) => { e.preventDefault(); el.classList.add("drag-over"); };
    const onLeave = () => el.classList.remove("drag-over");
    el.addEventListener("drop", onDrop);
    el.addEventListener("dragover", onOver);
    el.addEventListener("dragleave", onLeave);
    return () => { el.removeEventListener("drop", onDrop); el.removeEventListener("dragover", onOver); el.removeEventListener("dragleave", onLeave); };
  }, [editor]);

  // Source URL waiting to be cropped, then inserted on confirm.
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  const insertImage = useCallback((src: string) => {
    if (!editor) return;
    editor.chain().focus().setImage({ src }).run();
  }, [editor]);

  const uploadFile = useCallback((file: File) => {
    const reader = new FileReader();
    // Open crop modal with the file as data URL; final insert happens on
    // crop-confirm. Skipping the modal would lose the crop UX users expect.
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  if (!editor) return null;

  const togglePanel = (panel: "link" | "image") => {
    setActivePanel(activePanel === panel ? "none" : panel);
  };

  return (
    <div style={{ borderRadius: 12, overflow: "hidden", background: "#fff", boxShadow: "0 1px 8px rgba(0,0,0,0.06)", border: "1px solid #e5e7eb" }}>
      {/* Language toggle - compact */}
      <div style={{ padding: "6px 12px", background: "#111827", display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={() => setInputMode("telugu")} style={{ padding: "4px 12px", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, background: inputMode === "telugu" ? "#FF2C2C" : "#374151", color: inputMode === "telugu" ? "#fff" : "#9ca3af" }}>
          EN → తెలుగు
        </button>
        <button onClick={() => setInputMode("english")} style={{ padding: "4px 12px", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, background: inputMode === "english" ? "#FF2C2C" : "#374151", color: inputMode === "english" ? "#fff" : "#9ca3af" }}>
          English
        </button>
        <span style={{ fontSize: 11, color: "#555", marginLeft: "auto" }}>
          {inputMode === "telugu" ? "Type English → Space → Telugu" : "English mode"}
        </span>
      </div>

      {/* Toolbar - clean, single row */}
      <div style={{ borderBottom: "1px solid #eee", padding: "4px 8px", display: "flex", gap: 1, background: "#fafafa", flexWrap: "wrap" }}>
        <T on={editor.isActive("bold")} fn={() => editor.chain().focus().toggleBold().run()}><b>B</b></T>
        <T on={editor.isActive("italic")} fn={() => editor.chain().focus().toggleItalic().run()}><i>I</i></T>
        <T on={editor.isActive("underline")} fn={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></T>
        <T on={editor.isActive("highlight")} fn={() => editor.chain().focus().toggleHighlight().run()}>
          <span style={{ background: "#fef08a", padding: "0 2px", borderRadius: 2 }}>H</span>
        </T>
        <S />
        <T on={editor.isActive("heading", { level: 1 })} fn={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</T>
        <T on={editor.isActive("heading", { level: 2 })} fn={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</T>
        <T on={editor.isActive("heading", { level: 3 })} fn={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</T>
        <T on={editor.isActive("heading", { level: 4 })} fn={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}>H4</T>
        <T on={editor.isActive("heading", { level: 5 })} fn={() => editor.chain().focus().toggleHeading({ level: 5 }).run()}>H5</T>
        <T on={editor.isActive("heading", { level: 6 })} fn={() => editor.chain().focus().toggleHeading({ level: 6 }).run()}>H6</T>
        <S />
        {/* Spec #1 G1 #127 - color picker, code, sub/sup, task list, table, YouTube */}
        <label title="Text color" style={{ display: "inline-flex", alignItems: "center", padding: "0 6px", height: 30, cursor: "pointer" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>A</span>
          <input type="color" onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
            style={{ width: 18, height: 14, marginLeft: 4, border: "none", padding: 0, cursor: "pointer", background: "transparent" }} />
        </label>
        <T on={editor.isActive("strike")} fn={() => editor.chain().focus().toggleStrike().run()}><s>S</s></T>
        <T on={editor.isActive("code")} fn={() => editor.chain().focus().toggleCode().run()}>
          <span style={{ fontFamily: "monospace", fontSize: 12 }}>&lt;/&gt;</span>
        </T>
        <T on={editor.isActive("codeBlock")} fn={() => editor.chain().focus().toggleCodeBlock().run()}>
          <span style={{ fontFamily: "monospace", fontSize: 11 }}>{"{}"}</span>
        </T>
        <T on={editor.isActive("superscript")} fn={() => editor.chain().focus().toggleSuperscript().run()}>x²</T>
        <T on={editor.isActive("subscript")} fn={() => editor.chain().focus().toggleSubscript().run()}>x₂</T>
        <T on={editor.isActive("taskList")} fn={() => editor.chain().focus().toggleTaskList().run()}>☐</T>
        <T on={false} fn={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>⊞</T>
        <T on={false} fn={() => {
          const url = prompt("YouTube URL");
          if (url) editor.commands.setYoutubeVideo({ src: url });
        }}>▶</T>
        <S />
        <T on={editor.isActive("bulletList")} fn={() => editor.chain().focus().toggleBulletList().run()}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="3" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="3" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>
        </T>
        <T on={editor.isActive("orderedList")} fn={() => editor.chain().focus().toggleOrderedList().run()}>1.</T>
        <T on={editor.isActive("blockquote")} fn={() => editor.chain().focus().toggleBlockquote().run()}>
          <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/></svg>
        </T>
        <S />
        <T on={editor.isActive({ textAlign: "left" })} fn={() => editor.chain().focus().setTextAlign("left").run()}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 6h18M3 10h12M3 14h18M3 18h12"/></svg>
        </T>
        <T on={editor.isActive({ textAlign: "center" })} fn={() => editor.chain().focus().setTextAlign("center").run()}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 6h18M6 10h12M3 14h18M6 18h12"/></svg>
        </T>
        <S />
        <T on={activePanel === "link"} fn={() => togglePanel("link")}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" strokeLinecap="round"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" strokeLinecap="round"/></svg>
        </T>
        <T on={activePanel === "image"} fn={() => togglePanel("image")}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/><path d="M21 15l-5-5L5 21"/></svg>
        </T>
        <T on={false} fn={() => editor.chain().focus().setHorizontalRule().run()}>-</T>
        <S />
        <T on={false} fn={() => editor.chain().focus().undo().run()}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 10h10a5 5 0 015 5 5 5 0 01-5 5H3" strokeLinecap="round"/><path d="M7 6l-4 4 4 4" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </T>
        <T on={false} fn={() => editor.chain().focus().redo().run()}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10H11a5 5 0 00-5 5 5 5 0 005 5h10" strokeLinecap="round"/><path d="M17 6l4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </T>
      </div>

      {/* Link panel - only shows when link button is clicked */}
      {activePanel === "link" && (
        <div style={{ padding: "8px 12px", background: "#f0f9ff", borderBottom: "1px solid #bae6fd", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <svg width="16" height="16" fill="none" stroke="#3b82f6" strokeWidth="2" viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" strokeLinecap="round"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" strokeLinecap="round"/></svg>
          <input type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="Paste link URL..." autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") { editor.chain().focus().extendMarkRange("link").setLink({ href: linkUrl }).run(); setLinkUrl(""); setActivePanel("none"); } if (e.key === "Escape") setActivePanel("none"); }}
            style={{ flex: "1 1 160px", minWidth: 0, padding: "6px 10px", border: "1px solid #93c5fd", borderRadius: 6, fontSize: 13, outline: "none" }} />
          <button onClick={() => { editor.chain().focus().extendMarkRange("link").setLink({ href: linkUrl }).run(); setLinkUrl(""); setActivePanel("none"); }}
            style={{ padding: "6px 12px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Add</button>
          <button onClick={() => { editor.chain().focus().unsetLink().run(); setActivePanel("none"); }}
            style={{ padding: "6px 12px", background: "#fee2e2", color: "#ef4444", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Remove</button>
        </div>
      )}

      {/* Image panel - only shows when image button is clicked */}
      {activePanel === "image" && (
        <div style={{ padding: "10px 12px", background: "#fafafa", borderBottom: "1px solid #eee" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {/* Upload from device */}
            <button onClick={() => fileInputRef.current?.click()}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "#fff", border: "2px dashed #d1d5db", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#555" }}>
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Upload from Device
            </button>
            <span style={{ color: "#aaa", fontSize: 12 }}>or</span>
            {/* URL input */}
            <input type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Paste image URL..."
              onKeyDown={(e) => { if (e.key === "Enter" && imageUrl) { setCropSrc(imageUrl); setImageUrl(""); setActivePanel("none"); } if (e.key === "Escape") setActivePanel("none"); }}
              style={{ flex: "1 1 160px", minWidth: 0, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, outline: "none" }} />
            <button onClick={() => { if (imageUrl) { setCropSrc(imageUrl); setImageUrl(""); setActivePanel("none"); } }}
              style={{ padding: "8px 14px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Insert</button>
          </div>
          <p style={{ fontSize: 11, color: "#999", marginTop: 6 }}>You can also drag & drop images directly into the editor</p>
        </div>
      )}

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={(e) => { if (e.target.files?.[0]) { uploadFile(e.target.files[0]); setActivePanel("none"); } e.target.value = ""; }} />

      {/* Bubble Menu - only appears on text selection (Medium style) */}
      <BubbleMenu editor={editor}>
        <div style={{ display: "flex", gap: 1, background: "#1e293b", borderRadius: 8, padding: "3px 5px", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
          <B on={editor.isActive("bold")} fn={() => editor.chain().focus().toggleBold().run()}><b>B</b></B>
          <B on={editor.isActive("italic")} fn={() => editor.chain().focus().toggleItalic().run()}><i>I</i></B>
          <B on={editor.isActive("underline")} fn={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></B>
          <B on={editor.isActive("highlight")} fn={() => editor.chain().focus().toggleHighlight().run()}>H</B>
          <div style={{ width: 1, background: "#475569", margin: "0 2px" }} />
          <B on={editor.isActive("heading", { level: 2 })} fn={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</B>
          <B on={editor.isActive("link")} fn={() => togglePanel("link")}>
            <svg width="13" height="13" fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" strokeLinecap="round"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" strokeLinecap="round"/></svg>
          </B>
        </div>
      </BubbleMenu>

      {/* Editor Content */}
      <EditorContent editor={editor} />

      {/* G2 #129 crop modal - opens whenever an image is queued for insert. */}
      {cropSrc && (
        <ImageCropModal
          src={cropSrc}
          onConfirm={(out) => { insertImage(out); setCropSrc(null); }}
          onClose={() => setCropSrc(null)}
        />
      )}

      {/* Styles */}
      <style>{`
        .tiptap-editor { min-height: 500px; padding: 32px 40px; font-size: 18px; line-height: 1.9; color: #1a1a1a; outline: none; font-family: "Noto Sans Telugu", Georgia, serif; position: relative; }
        .tiptap-editor > .tiptap { min-height: 500px; outline: none; }
        .tiptap-editor.drag-over::after { content: "Drop image here"; position: absolute; inset: 0; background: rgba(59,130,246,0.06); border: 3px dashed #3b82f6; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 20px; color: #3b82f6; font-weight: 700; pointer-events: none; z-index: 10; }
        .tiptap-editor p { margin-bottom: 16px; }
        .tiptap-editor h2 { font-size: 28px; font-weight: 800; margin: 36px 0 14px; color: #000; line-height: 1.3; }
        .tiptap-editor h3 { font-size: 22px; font-weight: 700; margin: 28px 0 10px; color: #111; }
        .tiptap-editor h4 { font-size: 19px; font-weight: 700; margin: 22px 0 8px; color: #222; }
        .tiptap-editor blockquote { border-left: 4px solid #FF2C2C; padding-left: 20px; margin: 24px 0; font-style: italic; color: #555; }
        .tiptap-editor img { max-width: 100%; border-radius: 8px; margin: 24px auto; display: block; box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
        .tiptap-editor img.ProseMirror-selectednode { outline: 3px solid #3b82f6; outline-offset: 3px; }
        .tiptap-editor a { color: #3b82f6; text-decoration: underline; }
        .tiptap-editor ul, .tiptap-editor ol { padding-left: 28px; margin: 14px 0; }
        .tiptap-editor li { margin-bottom: 6px; }
        .tiptap-editor hr { border: none; border-top: 2px solid #eee; margin: 36px 0; }
        .tiptap-editor mark { background: #fef08a; padding: 0 3px; border-radius: 2px; }
        .tiptap p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: #ccc; float: left; pointer-events: none; height: 0; font-size: 18px; }
        @media (max-width: 640px) {
          .tiptap-editor { padding: 18px 16px; font-size: 16px; line-height: 1.8; }
          .tiptap-editor h2 { font-size: 23px; }
          .tiptap-editor h3 { font-size: 19px; }
          .tiptap-editor h4 { font-size: 17px; }
        }
      `}</style>
    </div>
  );
});

// Toolbar button
function T({ on, fn, children }: { on: boolean; fn: () => void; children: React.ReactNode }) {
  return <button onClick={fn} style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 13, fontWeight: 700, background: on ? "#dbeafe" : "transparent", color: on ? "#1d4ed8" : "#666", transition: "all 0.1s" }}>{children}</button>;
}
// Bubble button
function B({ on, fn, children }: { on: boolean; fn: () => void; children: React.ReactNode }) {
  return <button onClick={fn} style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 700, background: on ? "#475569" : "transparent", color: "#fff" }}>{children}</button>;
}
// Separator
function S() { return <div style={{ width: 1, height: 20, background: "#e5e7eb", margin: "0 4px", alignSelf: "center" }} />; }
