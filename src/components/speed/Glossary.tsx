"use client";

// Technical words get a dotted underline; hovering, focusing or tapping shows a plain explanation.
import { Fragment, useId, useState, type ReactNode } from "react";
import { GLOSSARY, glossaryByKey, type GlossaryEntry } from "@/lib/speed/glossary";

export function Term({ k, entry, children }: { k?: string; entry?: GlossaryEntry; children: ReactNode }) {
  const g = entry ?? (k ? glossaryByKey.get(k) : undefined);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  if (!g) return <>{children}</>;
  // Keep the explanation on screen: slide it left when the word is near the right edge.
  const place = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const w = Math.min(288, window.innerWidth - 32);
    const right = r.left + w - (window.innerWidth - 16);
    setShift(Math.max(16 - r.left, right > 0 ? -right : 0));
  };
  return (
    <span className="group/term relative inline" onMouseLeave={() => setOpen(false)} onMouseEnter={(e) => place(e.currentTarget)} onFocus={(e) => place(e.currentTarget)}>
      <button
        type="button"
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        className="cursor-help underline decoration-ink-soft/50 decoration-dotted underline-offset-[3px] hover:decoration-serp focus-visible:decoration-serp"
      >
        {children}
      </button>
      <span
        id={id}
        role="tooltip"
        style={{ left: shift }}
        className={`absolute top-full z-40 mt-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-rule bg-white p-3 text-left text-[0.85rem] leading-relaxed font-normal text-ink shadow-[0_12px_32px_-12px_rgba(14,26,43,0.35)] ${open ? "block" : "hidden group-hover/term:block group-focus-within/term:block"}`}
      >
        <span className="block font-semibold">{g.term}</span>
        <span className="mt-0.5 block text-ink-soft">{g.text}</span>
      </span>
    </span>
  );
}

/** Wraps the first mention of each glossary word in a text with an explanation. */
export function Glossed({ text, skip = [], list = GLOSSARY }: { text: string; skip?: string[]; list?: GlossaryEntry[] }) {
  type Hit = { start: number; end: number; key: string };
  const hits: Hit[] = [];
  for (const g of list) {
    if (skip.includes(g.key)) continue;
    const m = g.match.exec(text);
    if (!m) continue;
    const start = m.index;
    const end = start + m[0].length;
    if (hits.some((h) => start < h.end && end > h.start)) continue;
    hits.push({ start, end, key: g.key });
  }
  if (!hits.length) return <>{text}</>;
  hits.sort((a, b) => a.start - b.start);
  const out: ReactNode[] = [];
  let at = 0;
  hits.forEach((h, i) => {
    if (h.start > at) out.push(<Fragment key={`t${i}`}>{text.slice(at, h.start)}</Fragment>);
    out.push(
      <Term key={`g${i}`} entry={list.find((g) => g.key === h.key)}>
        {text.slice(h.start, h.end)}
      </Term>,
    );
    at = h.end;
  });
  if (at < text.length) out.push(<Fragment key="end">{text.slice(at)}</Fragment>);
  return <>{out}</>;
}
