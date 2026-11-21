"use client";

import { useState } from "react";

/** JSON-LD with the added fields highlighted, and a copy button. */
export function FixCode({ code, added = [], label }: { code: string; added?: string[]; label: string }) {
  const [done, setDone] = useState(false);
  const keys = new Set(added.map((p) => p.split(".").pop()!));
  const lines = code.split("\n");
  // Highlight an added key's line, and the lines of the object or array it opens.
  const marks: boolean[] = [];
  let until = -1;
  lines.forEach((l, i) => {
    const indent = l.length - l.trimStart().length;
    const key = l.trim().match(/^"([^"]+)":/)?.[1];
    if (until >= 0) {
      marks[i] = true;
      if (indent <= until && /^[\]}]/.test(l.trim())) until = -1;
      return;
    }
    if (key && keys.has(key)) {
      marks[i] = true;
      if (/[[{]\s*$/.test(l)) until = indent;
    } else marks[i] = false;
  });
  return (
    <figure className="min-w-0 overflow-hidden rounded-lg border border-rule">
      <figcaption className="flex items-center justify-between gap-3 border-b border-rule bg-mist/60 px-3 py-1.5 text-xs font-medium text-ink-soft">
        <span>{label}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setDone(true);
              setTimeout(() => setDone(false), 1600);
            } catch {
              /* clipboard blocked */
            }
          }}
          className="rounded-md border border-rule bg-white px-2.5 py-1 text-xs font-medium text-ink-soft hover:border-ink-soft hover:text-ink"
        >
          {done ? "Copied" : "Copy"}
        </button>
      </figcaption>
      <pre className="max-h-[28rem] overflow-auto bg-white py-2.5 font-mono text-[0.78rem] leading-relaxed text-ink">
        {lines.map((l, i) => (
          <span key={i} className={`block px-3 ${marks[i] ? "bg-pass/10" : ""}`}>
            {marks[i] ? <span className="mr-1 text-pass select-none">+</span> : <span className="mr-1 select-none text-transparent">+</span>}
            {l}
          </span>
        ))}
      </pre>
      {added.length > 0 && <p className="border-t border-rule bg-mist/40 px-3 py-1.5 text-xs text-ink-soft">Green lines are added. Replace the words in capitals with your real values.</p>}
    </figure>
  );
}
