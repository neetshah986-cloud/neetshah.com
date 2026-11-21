"use client";

import { useMemo, useState } from "react";
import { formatBytes, formatMs } from "@/lib/speed/metrics";
import type { Waterfall as W, WaterfallRow } from "@/lib/speed/types";
import { ToneIcon } from "./ui";

// Categorical slots 1 to 6 of the validated palette, in fixed order. Every row also carries a text label.
const TYPE: Record<WaterfallRow["type"], { color: string; label: string }> = {
  Document: { color: "#2a78d6", label: "HTML" },
  Script: { color: "#eb6834", label: "JS" },
  Stylesheet: { color: "#1baf7a", label: "CSS" },
  Image: { color: "#eda100", label: "Image" },
  Font: { color: "#e87ba4", label: "Font" },
  Other: { color: "#008300", label: "Other" },
};

type Filter = "all" | "early" | "blocking" | "third" | "Image" | "Script";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All files" },
  { id: "early", label: "Before main content" },
  { id: "blocking", label: "Render-blocking" },
  { id: "third", label: "Third parties" },
  { id: "Image", label: "Images" },
  { id: "Script", label: "Scripts" },
];

function niceStep(max: number) {
  const raw = max / 6;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
}

export function WaterfallSection({ wf }: { wf: W }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [focus, setFocus] = useState<{ id: string; rows: Set<number> } | null>(null);
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [hover, setHover] = useState<{ r: WaterfallRow; y: number; below: boolean } | null>(null);

  const lcp = wf.marks.lcp ?? Infinity;
  const rows = useMemo(
    () =>
      wf.rows.filter((r) => {
        if (focus) return focus.rows.has(r.id);
        switch (filter) {
          case "early":
            return r.sent < lcp;
          case "blocking":
            return r.blocking;
          case "third":
            return r.thirdParty;
          case "Image":
          case "Script":
            return r.type === filter;
          default:
            return true;
        }
      }),
    [wf.rows, filter, focus, lcp],
  );
  const shown = all ? rows : rows.slice(0, 60);
  const span = Math.max(...wf.rows.map((r) => r.end), wf.marks.load ?? 0, wf.marks.lcp ?? 0, 1) * 1.02;
  const step = niceStep(span);
  const ticks = Array.from({ length: Math.floor(span / step) + 1 }, (_, i) => i * step);
  const pct = (v: number) => `${(v / span) * 100}%`;
  const marks = [
    { k: "FCP", v: wf.marks.fcp, cls: "border-serp", text: "text-serp", tip: "First content appeared" },
    { k: "LCP", v: wf.marks.lcp, cls: "border-fail", text: "text-fail", tip: "Main content appeared" },
    { k: "Load", v: wf.marks.load, cls: "border-ink-soft", text: "text-ink-soft", tip: "Load event" },
  ].filter((m) => typeof m.v === "number") as { k: string; v: number; cls: string; text: string; tip: string }[];

  return (
    <div className="space-y-6">
      {/* The reading */}
      <div>
        <p className="mb-3 text-sm font-medium">What the waterfall shows</p>
        <ul className="grid gap-3 lg:grid-cols-2">
          {wf.insights.map((i) => {
            const active = focus?.id === i.id;
            return (
              <li key={i.id} className={`flex min-w-0 gap-3 rounded-xl border bg-white p-4 [overflow-wrap:anywhere] ${active ? "border-serp ring-1 ring-serp" : "border-rule"}`}>
                <ToneIcon tone={i.tone} className="mt-0.5 h-4 w-4" />
                <div className="min-w-0">
                  <p className="font-semibold leading-snug">{i.title}</p>
                  <p className="mt-1 text-[0.9rem] leading-relaxed text-ink-soft">{i.text}</p>
                  {i.action && (
                    <p className="mt-1.5 text-[0.9rem] leading-relaxed">
                      <span className="font-medium">Fix: </span>
                      {i.action}
                    </p>
                  )}
                  {i.rows.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setFocus(active ? null : { id: i.id, rows: new Set(i.rows) });
                        setAll(true);
                        if (!active) requestAnimationFrame(() => document.getElementById(`wf-${i.id}-anchor`)?.scrollIntoView({ block: "start" }));
                      }}
                      className="mt-2 text-sm font-medium text-serp hover:underline"
                    >
                      {active ? "Show all files again" : `Show ${i.rows.length > 1 ? `these ${i.rows.length} files` : "this file"} in the waterfall`}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* The chart */}
      <div className="scroll-mt-24 rounded-xl border border-rule bg-white" id={focus ? `wf-${focus.id}-anchor` : undefined}>
        <div className="flex flex-wrap items-center gap-2 border-b border-rule px-4 py-3">
          {focus ? (
            <>
              <span className="text-sm font-medium">Showing {rows.length} file{rows.length > 1 ? "s" : ""} from: {wf.insights.find((i) => i.id === focus.id)?.title}</span>
              <button type="button" onClick={() => setFocus(null)} className="rounded-md border border-rule px-2.5 py-1 text-sm font-medium hover:border-ink-soft">
                Show all
              </button>
            </>
          ) : (
            FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${filter === f.id ? "bg-ink text-paper" : "border border-rule text-ink-soft hover:text-ink"}`}
              >
                {f.label}
              </button>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 text-xs text-ink-soft">
          {Object.entries(TYPE).map(([k, t]) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: t.color }} />
              {t.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-5 rounded-sm bg-ink/15" />
            Waiting in queue
          </span>
          {marks.map((m) => (
            <span key={m.k} className="flex items-center gap-1.5">
              <span className={`h-3 border-l-2 border-dashed ${m.cls}`} />
              {m.tip} ({m.k})
            </span>
          ))}
        </div>

        <div className="overflow-x-auto">
          <div className="relative min-w-[44rem]" onPointerLeave={() => setHover(null)}>
            {/* Axis */}
            <div className="grid grid-cols-[minmax(12rem,34%)_1fr] border-y border-rule bg-mist/40 text-[0.7rem] text-ink-soft">
              <div className="flex items-end px-4 pb-1">File</div>
              <div className="relative mr-4 h-10">
                {ticks.map((t) => (
                  <span key={t} className="absolute top-1 -translate-x-1/2 whitespace-nowrap" style={{ left: pct(t) }}>
                    {formatMs(t)}
                  </span>
                ))}
                {marks.map((m) => (
                  <span key={m.k} className={`absolute bottom-0.5 -translate-x-1/2 whitespace-nowrap text-[0.65rem] font-semibold ${m.text}`} style={{ left: pct(m.v) }}>
                    {m.k}
                  </span>
                ))}
              </div>
            </div>

            <ol>
              {shown.map((r) => {
                const t = TYPE[r.type];
                const isOpen = open === r.id;
                return (
                  <li key={r.id} className="border-b border-rule/60 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : r.id)}
                      onPointerEnter={(e) => {
                        const el = e.currentTarget as HTMLElement;
                        const li = el.parentElement as HTMLElement;
                        setHover({ r, y: li.offsetTop, below: li.offsetTop + 130 < (li.parentElement?.offsetHeight ?? 0) });
                      }}
                      aria-expanded={isOpen}
                      className={`grid w-full grid-cols-[minmax(12rem,34%)_1fr] text-left hover:bg-mist/50 ${r.lcp ? "bg-fail/[0.05]" : ""}`}
                    >
                      <span className="flex min-w-0 items-center gap-2 px-4 py-1.5 text-[0.8rem]">
                        <span className="w-10 shrink-0 text-[0.68rem] font-medium text-ink-soft">{t.label}</span>
                        <span className="min-w-0 flex-1 truncate font-mono text-[0.76rem]" title={r.url}>
                          {r.label}
                        </span>
                        {r.lcp && <span className="shrink-0 rounded bg-fail/10 px-1 text-[0.65rem] font-semibold text-fail">LCP</span>}
                        {r.blocking && <span className="shrink-0 rounded bg-warn/10 px-1 text-[0.65rem] font-semibold text-warn">Blocks</span>}
                        {r.status >= 300 && <span className="shrink-0 rounded bg-fail/10 px-1 text-[0.65rem] font-semibold text-fail">{r.status}</span>}
                      </span>
                      <span className="relative mr-4 block h-full min-h-7">
                        {marks.map((m) => (
                          <span key={m.k} className={`absolute inset-y-0 border-l border-dashed ${m.cls} opacity-50`} style={{ left: pct(m.v) }} aria-hidden="true" />
                        ))}
                        {r.sent > r.found && <span className="absolute top-1/2 h-2 -translate-y-1/2 rounded-l-sm bg-ink/15" style={{ left: pct(r.found), width: pct(r.sent - r.found) }} aria-hidden="true" />}
                        <span
                          className={`absolute top-1/2 h-3 -translate-y-1/2 rounded-[4px] ${r.chain ? "ring-2 ring-ink/50 ring-offset-1" : ""}`}
                          style={{ left: pct(r.sent), width: `max(3px, ${pct(r.end - r.sent)})`, background: t.color }}
                          aria-hidden="true"
                        />
                        <span
                          className={`absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[0.68rem] text-ink-soft ${r.end / span > 0.85 ? "-translate-x-full pr-1.5" : "pl-1.5"}`}
                          style={{ left: pct(r.end > span * 0.85 ? r.found : r.end) }}
                        >
                          {formatMs(r.end - r.sent)}
                        </span>
                      </span>
                    </button>
                    {isOpen && <RowDetail r={r} />}
                  </li>
                );
              })}
            </ol>

            {hover && open === null && (
              <div
                className="pointer-events-none absolute z-10 w-72 rounded-lg border border-rule bg-white p-3 text-xs shadow-lg"
                style={{ ...(hover.below ? { top: hover.y + 40 + 34 } : { top: hover.y + 40 - 100 }), ...(hover.r.sent / span > 0.45 ? { left: 16 } : { right: 16 }) }}
              >
                <p className="break-all font-mono text-[0.72rem]">{hover.r.label}</p>
                <p className="mt-1.5 text-sm font-semibold">{formatMs(hover.r.end - hover.r.sent)} download, {formatBytes(hover.r.bytes)}</p>
                <p className="text-ink-soft">
                  Found {formatMs(hover.r.found)}, sent {formatMs(hover.r.sent)}, done {formatMs(hover.r.end)}
                </p>
                <p className="text-ink-soft">
                  {hover.r.priority} priority, {hover.r.protocol || "unknown protocol"}
                  {hover.r.thirdParty ? `, third party${hover.r.entity ? ` (${hover.r.entity})` : ""}` : ""}
                </p>
              </div>
            )}
          </div>
        </div>
        {rows.length > shown.length && (
          <div className="border-t border-rule px-4 py-3">
            <button type="button" onClick={() => setAll(true)} className="text-sm font-medium text-serp hover:underline">
              Show all {rows.length} files
            </button>
          </div>
        )}
        {!rows.length && <p className="px-4 py-5 text-sm text-ink-soft">No files match this filter.</p>}
      </div>
      <p className="text-sm leading-relaxed text-ink-soft">
        How to read it: each row is one file, in the order the browser found it. The light part of a bar is time spent waiting in a queue; the coloured part is the download. Everything that starts left of the red LCP line competed with your main content. These times come from the real load on Google&apos;s test machine before the slow-phone simulation, so they&apos;re shorter than the lab metrics above. The order and the overlaps are what matter.
      </p>
    </div>
  );
}

function RowDetail({ r }: { r: WaterfallRow }) {
  const facts: [string, string][] = [
    ["Type", TYPE[r.type].label],
    ["Size", formatBytes(r.bytes)],
    ["Found by the browser", formatMs(r.found)],
    ["Request sent", `${formatMs(r.sent)}${r.sent - r.found > 50 ? ` (queued ${formatMs(r.sent - r.found)})` : ""}`],
    ["Finished", `${formatMs(r.end)} (${formatMs(r.end - r.sent)} download)`],
    ["Priority", r.priority || "–"],
    ["Protocol", r.protocol || "–"],
    ["Status", String(r.status || "–")],
    ["Third party", r.thirdParty ? r.entity || "Yes" : "No"],
  ];
  return (
    <div className="border-t border-rule/60 bg-paper px-4 py-3">
      <p className="break-all font-mono text-[0.75rem]">{r.url}</p>
      <dl className="mt-2 grid gap-x-6 gap-y-1 text-[0.8rem] sm:grid-cols-3">
        {facts.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 sm:block">
            <dt className="text-ink-soft">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
