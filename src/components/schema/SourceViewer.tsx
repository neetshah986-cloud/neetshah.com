"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Severity } from "@/lib/schema/types";

const LINE_H = 20; // px, keep in sync with the row class below
const MAX_COLS = 600; // long minified lines are shown as a window around the point of interest

export type Focus = { start: number; end: number; at?: number } | null;

function lineIndex(starts: number[], offset: number) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// Light syntax colouring for the visible lines only.
const TOKEN = /("(?:[^"\\]|\\.)*"\s*:)|("(?:[^"\\]|\\.)*")|(<\/?[A-Za-z][^>]*>|<!--|-->)/g;
function Colored({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const cls = m[1] ? "text-serp" : m[2] ? "text-pass" : "text-ink-soft";
    out.push(
      <span key={k++} className={cls}>
        {m[0]}
      </span>,
    );
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

export function SourceViewer({
  html,
  focus,
  markers,
  className = "",
}: {
  html: string;
  focus: Focus;
  markers: Map<number, Severity>; // offset -> worst issue severity at that spot
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);

  const { lines, starts } = useMemo(() => {
    const lines = html.split("\n");
    const starts: number[] = new Array(lines.length);
    let o = 0;
    for (let i = 0; i < lines.length; i++) {
      starts[i] = o;
      o += lines[i].length + 1;
    }
    return { lines, starts };
  }, [html]);

  const lineMarkers = useMemo(() => {
    const m = new Map<number, Severity>();
    const rank = { error: 0, warning: 1, info: 2 } as const;
    for (const [offset, sev] of markers) {
      const l = lineIndex(starts, offset);
      const cur = m.get(l);
      if (!cur || rank[sev] < rank[cur]) m.set(l, sev);
    }
    return m;
  }, [markers, starts]);

  const range = focus ? { from: lineIndex(starts, focus.start), to: lineIndex(starts, Math.max(focus.start, focus.end - 1)) } : null;
  const focusLine = focus ? lineIndex(starts, focus.at ?? focus.start) : -1;
  const focusCol = focus ? (focus.at ?? focus.start) - starts[focusLine] : 0;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Bring the focused line into view, about a third of the way down.
  useEffect(() => {
    const el = box.current;
    if (!el || focusLine < 0) return;
    el.scrollTo({ top: Math.max(0, focusLine * LINE_H - el.clientHeight / 3), left: 0 });
  }, [focusLine, focus?.at, focus?.start]);

  const first = Math.max(0, Math.floor(scrollTop / LINE_H) - 30);
  const last = Math.min(lines.length, Math.ceil((scrollTop + height) / LINE_H) + 30);
  const gutter = String(lines.length).length;

  const rows: React.ReactNode[] = [];
  for (let i = first; i < last; i++) {
    let text = lines[i];
    let lead = "";
    if (text.length > MAX_COLS) {
      const start = i === focusLine ? Math.max(0, focusCol - 80) : 0;
      lead = start > 0 ? "… " : "";
      text = text.slice(start, start + MAX_COLS) + (start + MAX_COLS < lines[i].length ? " …" : "");
    }
    const inRange = range && i >= range.from && i <= range.to;
    const isFocus = i === focusLine && focus?.at !== undefined;
    const mark = lineMarkers.get(i);
    rows.push(
      <div
        key={i}
        style={{ top: i * LINE_H, height: LINE_H }}
        className={`absolute left-0 right-0 flex whitespace-pre font-mono text-[12.5px] leading-[20px] ${isFocus ? "bg-serp/15" : inRange ? "bg-serp/[0.06]" : ""}`}
      >
        <span
          className={`sticky left-0 z-10 flex shrink-0 select-none items-center justify-end gap-1.5 border-r pr-2.5 text-right tabular-nums ${isFocus ? "border-serp bg-[#E3E9FB] text-ink" : inRange ? "border-serp/40 bg-[#F1F4FC] text-ink-soft" : "border-rule bg-mist text-ink-soft/70"}`}
          style={{ width: `${gutter + 3}ch` }}
        >
          {mark && <span className={`h-1.5 w-1.5 rounded-full ${mark === "error" ? "bg-fail" : mark === "warning" ? "bg-warn" : "bg-serp"}`} />}
          {i + 1}
        </span>
        <span className="pl-3 pr-6 text-ink">
          {lead}
          <Colored text={text} />
        </span>
      </div>,
    );
  }

  return (
    <div
      ref={box}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className={`relative overflow-auto rounded-xl border border-rule bg-white ${className}`}
      aria-label="Page source"
      role="region"
      tabIndex={0}
    >
      <div style={{ height: lines.length * LINE_H, minWidth: "100%", width: `calc(${Math.min(MAX_COLS + 8, Math.max(...lines.slice(first, last).map((l) => Math.min(l.length, MAX_COLS + 4)), 40)) + gutter + 6}ch)` }} className="relative">
        {rows}
      </div>
    </div>
  );
}
