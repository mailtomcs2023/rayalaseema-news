"use client";

// Inline TipTap editor for block headlines + body. Word/InDesign-style:
// click block → text becomes editable → type Telugu directly → blur saves
// to block.overrideTitle / overrideDek. Render path already reads these
// overrides, so what you type = what the PDF prints.
//
// Plain-text mode (single line) for headlines; rich-text (B/I/links) for
// body copy. Persists via onBlur (and debounced typing if onChange present).

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import { useEffect } from "react";

export interface InlineTextEditorProps {
  value: string;
  placeholder?: string;
  multiline?: boolean;         // false = headline (no newlines, no rich); true = body
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  textAlign?: "left" | "center" | "justify";
  onChange?: (next: string) => void;
  onBlur?: (next: string) => void;
}

export function InlineTextEditor({
  value, placeholder, multiline = false,
  fontFamily, fontSize, fontWeight, color, textAlign,
  onChange, onBlur,
}: InlineTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Headline mode: strip block/inline formatting that doesn't make sense
        // for a single-line title.
        heading: multiline ? undefined : false,
        bulletList: multiline ? undefined : false,
        orderedList: multiline ? undefined : false,
        blockquote: multiline ? undefined : false,
        codeBlock: multiline ? undefined : false,
        horizontalRule: false,
        // TipTap v3 removed `history` from StarterKit options - the History
        // extension is bundled with default depth 100. Customize via
        // disabling here + .extend({ depth: 50 }) if we need shallower undo.
      }),
      Placeholder.configure({ placeholder: placeholder || "Type here…" }),
      ...(multiline ? [Link.configure({ openOnClick: false })] : []),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        style: [
          fontFamily ? `font-family:${fontFamily}` : "",
          fontSize ? `font-size:${fontSize}px` : "",
          fontWeight ? `font-weight:${fontWeight}` : "",
          color ? `color:${color}` : "",
          textAlign ? `text-align:${textAlign}` : "",
          "outline:none",
          "min-height:1em",
        ].filter(Boolean).join(";"),
      },
      handleKeyDown(_view, e) {
        // Single-line headline: swallow Enter so the title doesn't wrap.
        if (!multiline && e.key === "Enter") { e.preventDefault(); return true; }
        return false;
      },
    },
    onUpdate({ editor }) {
      onChange?.(multiline ? editor.getHTML() : editor.getText());
    },
    onBlur({ editor }) {
      onBlur?.(multiline ? editor.getHTML() : editor.getText());
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!editor) return;
    const current = multiline ? editor.getHTML() : editor.getText();
    if (current !== (value || "")) {
      editor.commands.setContent(value || "");
    }
  }, [value, editor, multiline]);

  if (!editor) return null;

  return (
    <div onMouseDown={(e) => e.stopPropagation()}>
      {multiline && editor.isFocused && (
        <div style={{ position: "sticky", top: 0, display: "flex", gap: 2, background: "#1f2937", padding: 4, borderRadius: 4, marginBottom: 4, zIndex: 10 }}>
          <button onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }}
            style={btn(editor.isActive("bold"))} title="Bold (Ctrl+B)"><b>B</b></button>
          <button onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }}
            style={btn(editor.isActive("italic"))} title="Italic (Ctrl+I)"><i>I</i></button>
          <button onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleStrike().run(); }}
            style={btn(editor.isActive("strike"))} title="Strike"><s>S</s></button>
          <button onMouseDown={(e) => {
              e.preventDefault();
              const prev = editor.getAttributes("link").href as string | undefined;
              const url = window.prompt("URL:", prev || "https://");
              if (url === null) return;
              if (url === "") editor.chain().focus().unsetLink().run();
              else editor.chain().focus().setLink({ href: url }).run();
            }}
            style={btn(editor.isActive("link"))} title="Link">🔗</button>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

function btn(active: boolean): React.CSSProperties {
  return {
    background: active ? "#4f46e5" : "transparent",
    color: "#fff", border: "none",
    padding: "2px 8px", fontSize: 12, fontWeight: 700,
    cursor: "pointer", borderRadius: 3,
  };
}
