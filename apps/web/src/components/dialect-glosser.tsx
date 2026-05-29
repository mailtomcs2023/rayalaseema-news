"use client";

import { useEffect } from "react";

// Dialect glosser (#96). Mounted once per article page. Fetches the global
// glossary, walks the .article-body text nodes, wraps each known dialect
// token in <abbr title="standard Telugu meaning"> with a dotted underline
// so readers from outside Rayalaseema get a hover tooltip.
//
// Runs once after first paint; doesn't observe further DOM changes (article
// body is static after hydration).

interface Gloss {
  token: string;
  standardTelugu: string;
  note?: string | null;
  region?: string | null;
}

let glossCache: Promise<Gloss[]> | null = null;

function loadGlosses(): Promise<Gloss[]> {
  if (!glossCache) {
    glossCache = fetch("/api/dialect-gloss")
      .then((r) => r.json())
      .then((d) => (d.glosses as Gloss[]) || [])
      .catch(() => []);
  }
  return glossCache;
}

export function DialectGlosser() {
  useEffect(() => {
    let cancelled = false;
    loadGlosses().then((glosses) => {
      if (cancelled || glosses.length === 0) return;
      const map = new Map(glosses.map((g) => [g.token, g] as const));
      const root = document.querySelector(".article-body");
      if (!root) return;

      // Walk every text node, splitting on whitespace + punctuation. When a
      // token matches the glossary, wrap it with <abbr>. Skip nodes already
      // inside <abbr> to avoid double-wrapping on re-runs.
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const targets: Text[] = [];
      let n: Node | null;
      while ((n = walker.nextNode())) {
        if ((n.parentElement?.tagName || "") === "ABBR") continue;
        if (n.parentElement?.closest("abbr")) continue;
        targets.push(n as Text);
      }
      for (const text of targets) {
        const raw = text.nodeValue || "";
        if (!raw.trim()) continue;
        // Quick reject - only process nodes that actually contain a known token.
        let touched = false;
        for (const t of map.keys()) {
          if (raw.includes(t)) { touched = true; break; }
        }
        if (!touched) continue;

        const frag = document.createDocumentFragment();
        // Split keeping separators so we can reassemble accurately.
        const parts = raw.split(/(\s+|[,.;:!?()\[\]"'…–\-]+)/u);
        for (const p of parts) {
          const g = map.get(p);
          if (g) {
            const a = document.createElement("abbr");
            a.title = `${g.standardTelugu}${g.note ? " - " + g.note : ""}`;
            a.style.borderBottom = "1px dotted #E01B1B";
            a.style.cursor = "help";
            a.style.textDecoration = "none";
            a.textContent = p;
            frag.appendChild(a);
          } else {
            frag.appendChild(document.createTextNode(p));
          }
        }
        text.parentNode?.replaceChild(frag, text);
      }
    });
    return () => { cancelled = true; };
  }, []);

  return null;
}
