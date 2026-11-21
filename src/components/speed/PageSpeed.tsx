"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { devReport, findingText } from "@/lib/speed/devreport";
import { formatBytes, formatMs, formatThreshold, METRICS, RATING_LABEL, thresholds, type MetricKey, type Rating } from "@/lib/speed/metrics";
import type { CodeBlock, Diagnosis, FieldData, Finding, MetricValue, NodeRef, SpeedRun, Strategy } from "@/lib/speed/types";
import { ReplaySection } from "./Replay";
import { ScoreCalculator } from "./ScoreCalculator";
import { TrendSection } from "./Trend";
import { WaterfallSection } from "./Waterfall";

// ---------- small pieces ----------

/** Same-site URLs as paths, others in full. */
function shortUrl(url: string, page: string) {
  try {
    const u = new URL(url);
    const p = new URL(page);
    return u.origin === p.origin ? u.pathname + u.search : u.host + u.pathname + u.search;
  } catch {
    return url;
  }
}

const TONE: Record<Rating, { text: string; bg: string; dot: string; bar: string }> = {
  good: { text: "text-pass", bg: "bg-pass/10", dot: "bg-pass", bar: "bg-pass" },
  ni: { text: "text-warn", bg: "bg-warn/10", dot: "bg-warn", bar: "bg-warn" },
  poor: { text: "text-fail", bg: "bg-fail/10", dot: "bg-fail", bar: "bg-fail" },
};

function RatingIcon({ r, className = "h-4 w-4" }: { r: Rating; className?: string }) {
  if (r === "good")
    return (
      <svg viewBox="0 0 20 20" className={`${className} shrink-0 text-pass`} aria-label="Good">
        <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.15" />
        <path d="M6 10.4l2.6 2.6L14 7.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (r === "ni")
    return (
      <svg viewBox="0 0 20 20" className={`${className} shrink-0 text-warn`} aria-label="Needs improvement">
        <rect x="2" y="2" width="16" height="16" rx="3" fill="currentColor" opacity="0.15" />
        <path d="M10 5.8v5.2M10 14h.01" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg viewBox="0 0 20 20" className={`${className} shrink-0 text-fail`} aria-label="Poor">
      <path d="M10 2l8.5 15h-17z" fill="currentColor" opacity="0.15" />
      <path d="M10 7.5v4M10 14.4h.01" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function CopyButton({ text, label = "Copy", className = "" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          /* clipboard blocked */
        }
      }}
      className={`rounded-md border border-rule bg-white px-2.5 py-1 text-xs font-medium text-ink-soft transition-colors hover:border-ink-soft hover:text-ink ${className}`}
    >
      {done ? "Copied" : label}
    </button>
  );
}

function Code({ block }: { block: CodeBlock }) {
  return (
    <figure className="min-w-0 overflow-hidden rounded-lg border border-rule">
      <figcaption className="flex items-center justify-between gap-3 border-b border-rule bg-mist/60 px-3 py-1.5 text-xs font-medium text-ink-soft">
        <span>{block.label}</span>
        <CopyButton text={block.code} />
      </figcaption>
      <pre className="overflow-x-auto bg-white px-3 py-2.5 font-mono text-[0.8rem] leading-relaxed text-ink">{block.code}</pre>
    </figure>
  );
}

/** Splits a tag into attribute tokens so changes can be highlighted. */
function tokens(snippet: string): string[] {
  return snippet.match(/<[^\s>]+|\s+[^\s=>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?|\s*\/?>|[^]/g) ?? [snippet];
}

function DiffSnippet({ current, fixed }: { current: string; fixed: string }) {
  const a = tokens(current).map((t) => t.trim());
  const b = tokens(fixed).map((t) => t.trim());
  const show = (list: string[], other: string[], mode: "del" | "ins") =>
    list.map((t, i) => {
      const changed = !other.includes(t) && /^[^<>]/.test(t);
      const space = i > 0 && !/^\/?>$/.test(t) ? " " : "";
      return (
        <span key={i}>
          {space}
          {changed ? <mark className={mode === "del" ? "rounded-sm bg-fail/15 text-fail line-through decoration-fail/50" : "rounded-sm bg-pass/15 text-pass"}>{t}</mark> : t}
        </span>
      );
    });
  return (
    <div className="grid min-w-0 gap-2">
      <div className="min-w-0 overflow-hidden rounded-lg border border-rule">
        <p className="border-b border-rule bg-fail/[0.06] px-3 py-1.5 text-xs font-medium text-fail">Current code</p>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all bg-white px-3 py-2.5 font-mono text-[0.8rem] leading-relaxed">{show(a, b, "del")}</pre>
      </div>
      <div className="min-w-0 overflow-hidden rounded-lg border border-rule">
        <p className="flex items-center justify-between gap-3 border-b border-rule bg-pass/[0.07] px-3 py-1.5 text-xs font-medium text-pass">
          <span>Fixed code</span>
          <CopyButton text={fixed} />
        </p>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all bg-white px-3 py-2.5 font-mono text-[0.8rem] leading-relaxed">{show(b, a, "ins")}</pre>
      </div>
    </div>
  );
}

/** A crop of the full-page screenshot around one element, with the element outlined. Scales down to fit its container. */
function Snapshot({ run, node, maxW = 340, maxH = 230 }: { run: SpeedRun; node: NodeRef; maxW?: number; maxH?: number }) {
  const fp = run.fullPage;
  const r = node.rect;
  if (!fp || !r || r.top >= fp.height || r.left >= fp.width) return null;
  const pad = 14;
  const left = Math.max(0, r.left - pad);
  const top = Math.max(0, r.top - pad);
  const bw = Math.min(fp.width, r.left + r.width + pad) - left;
  const bh = Math.min(Math.min(fp.height, r.top + r.height + pad) - top, 900);
  const scale = Math.min(maxW / bw, maxH / bh, 1.6);
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <figure className="w-full max-w-full shrink-0" style={{ maxWidth: bw * scale }}>
      <div className="relative w-full overflow-hidden rounded-lg border border-rule bg-mist" style={{ aspectRatio: `${bw} / ${bh}` }} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fp.data} alt="" className="absolute max-w-none" style={{ width: pct(fp.width, bw), left: pct(-left, bw), top: pct(-top, bh) }} />
        <div className="absolute rounded-[3px] outline outline-2 outline-offset-1 outline-fail" style={{ left: pct(r.left - left, bw), top: pct(r.top - top, bh), width: pct(r.width, bw), height: pct(Math.min(r.height, bh), bh) }} />
      </div>
      <figcaption className="mt-1.5 text-xs text-ink-soft">Snapshot from Google&apos;s test, element outlined</figcaption>
    </figure>
  );
}

function ElementBlock({ run, node, current, fixed, note, change }: { run: SpeedRun; node: NodeRef; current?: string; fixed?: string; note?: string; change?: { label: string; code: string } }) {
  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-xl border border-rule bg-paper/60 p-4 @lg:flex-row">
      <Snapshot run={run} node={node} />
      <div className="min-w-0 flex-1 space-y-2.5">
        <p className="break-all font-mono text-[0.8rem] text-ink-soft">{node.selector}</p>
        {note && <p className="text-[0.93rem] leading-relaxed">{note}</p>}
        {current && fixed ? (
          <DiffSnippet current={current} fixed={fixed} />
        ) : (
          (current ?? node.snippet) && <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-rule bg-white px-3 py-2.5 font-mono text-[0.8rem] leading-relaxed">{current ?? node.snippet}</pre>
        )}
        {change && (
          <div className="min-w-0 overflow-hidden rounded-lg border border-rule">
            <p className="flex items-center justify-between gap-3 border-b border-rule bg-pass/[0.07] px-3 py-1.5 text-xs font-medium text-pass">
              <span>{change.label}</span>
              <CopyButton text={change.code} />
            </p>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all bg-white px-3 py-2.5 font-mono text-[0.8rem] leading-relaxed">{change.code}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- metrics ----------

function ThresholdBar({ k, value, strategy }: { k: MetricKey; value: number; strategy: Strategy }) {
  const t = thresholds(k, strategy);
  const max = t.poor * 1.6;
  const pos = Math.min(value / max, 1) * 100;
  const g = (t.good / max) * 100;
  const p = (t.poor / max) * 100;
  return (
    <div className="mt-3">
      <div className="relative h-2">
        <div className="absolute inset-0 flex overflow-hidden rounded-full">
          <span className="bg-pass/70" style={{ width: `${g}%` }} />
          <span className="bg-warn/70" style={{ width: `${p - g}%` }} />
          <span className="flex-1 bg-fail/70" />
        </div>
        <span className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-2 ring-white" style={{ left: `${pos}%` }} />
      </div>
      <div className="relative mt-1 h-4 text-[0.7rem] text-ink-soft">
        <span className="absolute -translate-x-1/2" style={{ left: `${g}%` }}>{formatThreshold(k, t.good)}</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${p}%` }}>{formatThreshold(k, t.poor)}</span>
      </div>
    </div>
  );
}

function Distribution({ d }: { d: [number, number, number] }) {
  return (
    <div className="mt-3">
      <div className="flex h-1.5 overflow-hidden rounded-full" aria-hidden="true">
        <span className="bg-pass" style={{ width: `${d[0] * 100}%` }} />
        <span className="bg-warn" style={{ width: `${d[1] * 100}%` }} />
        <span className="bg-fail" style={{ width: `${d[2] * 100}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-ink-soft">
        {Math.round(d[0] * 100)}% good, {Math.round(d[1] * 100)}% need improvement, {Math.round(d[2] * 100)}% poor
      </p>
    </div>
  );
}

function MetricCard({ m, strategy, distribution, onWhy }: { m: MetricValue; strategy: Strategy; distribution?: [number, number, number]; onWhy?: () => void }) {
  const def = METRICS[m.key];
  const tone = TONE[m.rating];
  return (
    <li className="flex flex-col rounded-xl border border-rule bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">
          {def.name} <span className="text-ink-soft">({def.short})</span>
        </p>
        {def.core && <span className="shrink-0 rounded bg-mist px-1.5 py-0.5 text-[0.7rem] font-medium text-ink-soft">Core Web Vital</span>}
      </div>
      <p className={`mt-2 flex items-center gap-2 text-3xl font-semibold tracking-tight ${tone.text}`}>
        <RatingIcon r={m.rating} className="h-5 w-5" />
        {m.display}
      </p>
      <p className={`mt-1 text-sm font-medium ${tone.text}`}>{RATING_LABEL[m.rating]}</p>
      <ThresholdBar k={m.key} value={m.value} strategy={strategy} />
      {distribution && <Distribution d={distribution} />}
      <p className="mt-3 text-[0.88rem] leading-snug text-ink-soft">{def.plain}</p>
      {onWhy && m.rating !== "good" && (
        <button type="button" onClick={onWhy} className="mt-3 self-start text-sm font-medium text-serp hover:underline">
          See what&apos;s causing it
        </button>
      )}
    </li>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r: Rating = score >= 90 ? "good" : score >= 50 ? "ni" : "poor";
  const c = 2 * Math.PI * 34;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="40" cy="40" r="34" fill="none" stroke="#EEF2F7" strokeWidth="7" />
        <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} className={TONE[r].text} />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-2xl font-semibold ${TONE[r].text}`}>{score}</span>
    </div>
  );
}

// ---------- sections ----------

function FieldSection({ field, origin, strategy, onWhy }: { field: FieldData | null; origin: FieldData | null; strategy: Strategy; onWhy: (k: MetricKey) => void }) {
  const [useOrigin, setUseOrigin] = useState(false);
  const data = useOrigin && origin ? origin : field ?? origin;
  if (!data)
    return (
      <div className="rounded-xl border border-dashed border-rule bg-white p-5 text-[0.95rem] leading-relaxed text-ink-soft">
        <p className="font-medium text-ink">Not enough real-user data yet</p>
        <p className="mt-1">Google only publishes real-visitor data (the Chrome UX Report) for pages and sites with enough Chrome traffic. The lab test below still shows exactly what to fix.</p>
      </div>
    );
  const keys = (["LCP", "INP", "CLS", "FCP", "TTFB"] as MetricKey[]).filter((k) => data.metrics[k]);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          75th percentile of real Chrome visits over the last 28 days, for {data.scope === "url" ? "this URL" : "the whole site (this URL doesn't have enough visits of its own)"}.
        </p>
        {field && origin && (
          <div role="tablist" aria-label="Field data scope" className="inline-flex rounded-lg bg-mist p-1 text-sm">
            {[false, true].map((o) => (
              <button key={String(o)} role="tab" aria-selected={useOrigin === o} onClick={() => setUseOrigin(o)} className={`rounded-md px-3 py-1 font-medium transition-colors ${useOrigin === o ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}>
                {o ? "Whole site" : "This URL"}
              </button>
            ))}
          </div>
        )}
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {keys.map((k) => (
          <MetricCard key={k} m={data.metrics[k]!} distribution={data.metrics[k]!.distribution} strategy={strategy} onWhy={() => onWhy(k === "INP" ? "INP" : k)} />
        ))}
      </ul>
    </div>
  );
}

function Filmstrip({ run }: { run: SpeedRun }) {
  if (!run.filmstrip.length) return null;
  const fcp = run.lab.FCP?.value ?? 0;
  const lcp = run.lab.LCP?.value ?? 0;
  return (
    <div className="-mx-1 overflow-x-auto pb-2">
      <ol className="flex gap-2 px-1">
        {run.filmstrip.map((f, i) => {
          const tag = f.ms >= lcp && (i === 0 || run.filmstrip[i - 1].ms < lcp) ? "LCP" : f.ms >= fcp && (i === 0 || run.filmstrip[i - 1].ms < fcp) ? "FCP" : "";
          return (
            <li key={i} className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.data} alt={`Page at ${formatMs(f.ms)}`} className={`h-32 w-auto rounded-md border ${tag ? "border-serp" : "border-rule"} bg-white`} />
              <p className="mt-1 text-center text-xs text-ink-soft">
                {formatMs(f.ms)} {tag && <span className="font-semibold text-serp">{tag}</span>}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function DiagnosisCard({ d, run, findings, onOpen }: { d: Diagnosis; run: SpeedRun; findings: Finding[]; onOpen: (id: string) => void }) {
  const tone = TONE[d.rating];
  const linked = d.findingIds.map((id) => findings.find((f) => f.auditId === id)).filter(Boolean) as Finding[];
  return (
    <li id={`cause-${run.strategy}-${d.metric}`} className="min-w-0 scroll-mt-24 rounded-xl border border-rule bg-white p-5 [overflow-wrap:anywhere] @container">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-md px-2 py-0.5 text-sm font-semibold ${tone.bg} ${tone.text}`}>
          {d.metric} {d.value}
        </span>
        <span className={`text-sm font-medium ${tone.text}`}>{RATING_LABEL[d.rating]}</span>
      </div>
      <p className="mt-3 text-lg font-semibold leading-snug tracking-tight">{d.headline}</p>
      {d.detail && <p className="mt-1.5 text-[0.95rem] leading-relaxed text-ink-soft">{d.detail}</p>}

      {d.phases && d.rating !== "good" && (
        <div className="mt-4">
          <p className="text-sm font-medium">Where the LCP time goes</p>
          <div className="mt-2 flex h-3 overflow-hidden rounded-full" aria-hidden="true">
            {d.phases.map((p, i) => (
              <span key={i} className={p.main ? "bg-fail" : ["bg-ink/25", "bg-ink/40", "bg-ink/15", "bg-ink/30"][i % 4]} style={{ width: `${Math.max(p.share * 100, 1.5)}%` }} />
            ))}
          </div>
          <ul className="mt-3 grid gap-2 @md:grid-cols-2">
            {d.phases.map((p, i) => (
              <li key={i} className={`rounded-lg px-3 py-2 text-sm ${p.main ? "bg-fail/[0.07]" : "bg-mist/60"}`}>
                <span className={`font-semibold ${p.main ? "text-fail" : ""}`}>
                  {Math.round(p.share * 100)}% {p.label}
                  {p.main && " (main cause)"}
                </span>
                <span className="mt-0.5 block text-ink-soft">{p.tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {d.node && d.rating !== "good" && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium">{d.metric === "CLS" ? "The element that moves the most" : "The element Google measured"}</p>
          <ElementBlock run={run} node={d.node} current={d.node.snippet} />
        </div>
      )}

      {d.causes && d.rating !== "good" && d.causes.length > 1 && (
        <ul className="mt-4 divide-y divide-rule rounded-lg border border-rule">
          {d.causes.map((c, i) => (
            <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 break-all font-mono text-[0.8rem]">{c.node?.selector ?? "Element"}</span>
              <span className="text-ink-soft">
                {c.text}
                {typeof c.score === "number" && <span className="ml-2 font-medium text-ink">{c.score.toFixed(3)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {d.scripts && d.rating !== "good" && d.scripts.length > 0 && (
        <ul className="mt-4 divide-y divide-rule rounded-lg border border-rule">
          {d.scripts.map((s, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 break-all font-mono text-[0.8rem]">
                {s.url}
                {s.thirdParty && <span className="ml-2 rounded bg-mist px-1.5 py-0.5 font-sans text-[0.7rem] text-ink-soft">third party</span>}
              </span>
              <span className="shrink-0 font-medium">{formatMs(s.ms)}</span>
            </li>
          ))}
        </ul>
      )}

      {linked.length > 0 && d.rating !== "good" && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-soft">Fix it:</span>
          {linked.map((f) => (
            <button key={f.id} type="button" onClick={() => onOpen(f.id)} className="rounded-md border border-rule px-2.5 py-1 font-medium text-serp hover:border-serp">
              {f.title}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

const IMPACT: Record<Finding["impact"], { label: string; cls: string }> = {
  high: { label: "High impact", cls: "bg-fail/10 text-fail" },
  medium: { label: "Medium impact", cls: "bg-warn/10 text-warn" },
  low: { label: "Low impact", cls: "bg-mist text-ink-soft" },
};

function FindingCard({ f, run, open, onToggle, n }: { f: Finding; run: SpeedRun; open: boolean; onToggle: (o: boolean) => void; n: number }) {
  const saves = [f.savingsMs ? `saves about ${formatMs(f.savingsMs)}` : "", f.savingsBytes ? `${formatBytes(f.savingsBytes)} lighter` : ""].filter(Boolean).join(", ");
  return (
    <li id={`fix-${run.strategy}-${f.id}`} className="min-w-0 scroll-mt-24 overflow-hidden rounded-xl border border-rule bg-white [overflow-wrap:anywhere] @container">
      <details open={open} onToggle={(e) => onToggle((e.target as HTMLDetailsElement).open)}>
        <summary className="flex cursor-pointer list-none items-start gap-4 px-5 py-4 hover:bg-mist/40 [&::-webkit-details-marker]:hidden">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mist text-sm font-semibold">{n}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[1.05rem] font-semibold leading-snug tracking-tight">{f.title}</span>
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
              <span className={`rounded-md px-2 py-0.5 font-medium ${IMPACT[f.impact].cls}`}>{IMPACT[f.impact].label}</span>
              {f.metrics.map((m) => (
                <span key={m} className="rounded-md border border-rule px-1.5 py-0.5 font-medium text-ink-soft">
                  {m}
                </span>
              ))}
              {saves && <span className="text-ink-soft">{saves}</span>}
            </span>
          </span>
          <svg viewBox="0 0 20 20" className={`mt-1 h-5 w-5 shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">
            <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        {open && (
          <div className="space-y-5 border-t border-rule px-5 py-5">
            <div className="grid gap-4 @2xl:grid-cols-2">
              <div>
                <p className="text-sm font-semibold">What&apos;s wrong</p>
                <p className="mt-1 text-[0.95rem] leading-relaxed">{f.summary}</p>
              </div>
              <div>
                <p className="text-sm font-semibold">Why it matters</p>
                <p className="mt-1 text-[0.95rem] leading-relaxed text-ink-soft">{f.why}</p>
              </div>
            </div>

            {f.elements.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold">{f.elements.length > 1 ? `The ${f.elements.length} elements to change` : "The element to change"}</p>
                <div className="space-y-3">
                  {f.elements.map((e, i) => (
                    <ElementBlock key={i} run={run} node={e.node} current={e.current} fixed={e.fixed} note={e.note} change={e.change} />
                  ))}
                </div>
              </div>
            )}

            {f.resources.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold">Files involved</p>
                <ul className="divide-y divide-rule overflow-hidden rounded-lg border border-rule text-sm">
                  {f.resources.slice(0, 12).map((r, i) => (
                    <li key={i} className="grid gap-1 px-3 py-2 @lg:grid-cols-[minmax(0,1fr)_auto] @lg:gap-4">
                      <span className="min-w-0">
                        <span className="block break-all font-mono text-[0.8rem]">{shortUrl(r.url, run.finalUrl)}</span>
                        {r.note && <span className="mt-0.5 block text-ink-soft">{r.note}</span>}
                      </span>
                      <span className="flex flex-wrap items-baseline gap-x-3 text-ink-soft @lg:justify-end">
                        {r.thirdParty && <span className="rounded bg-mist px-1.5 py-0.5 text-[0.7rem]">third party</span>}
                        {typeof r.bytes === "number" && <span>{formatBytes(r.bytes)}</span>}
                        {typeof r.wastedBytes === "number" && r.wastedBytes > 0 && <span className="text-fail">−{formatBytes(r.wastedBytes)}</span>}
                        {typeof r.ms === "number" && <span className="font-medium text-ink">{formatMs(r.ms)}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                {f.resources.length > 12 && <p className="mt-1.5 text-xs text-ink-soft">And {f.resources.length - 12} more in the developer report.</p>}
              </div>
            )}

            {f.platformSteps && (
              <div className="rounded-xl border border-serp/30 bg-serp/[0.04] p-4">
                <p className="text-sm font-semibold text-serp">{f.platformSteps.title}</p>
                <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[0.95rem] leading-relaxed marker:text-ink-soft">
                  {f.platformSteps.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </div>
            )}

            {f.steps.length > 0 && (
              <div>
                <p className="text-sm font-semibold">{f.platformSteps ? "Steps for a developer" : "How to fix it"}</p>
                <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[0.95rem] leading-relaxed marker:text-ink-soft">
                  {f.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </div>
            )}

            {f.code.length > 0 && (
              <div className="grid gap-3 @2xl:grid-cols-2">
                {f.code.map((c, i) => (
                  <Code key={i} block={c} />
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-rule pt-4 text-sm text-ink-soft">
              <span>{f.owner ? `Usually fixed by: ${f.owner}` : ""}</span>
              <CopyButton text={findingText(f)} label="Copy this fix for a developer" className="text-sm" />
            </div>
          </div>
        )}
      </details>
    </li>
  );
}

function CrawlerPanel({ run }: { run: SpeedRun }) {
  const c = run.crawler;
  const rows: { ok: boolean | null; title: string; text: string }[] = [];
  if (typeof c.ttfbMs === "number")
    rows.push({
      ok: c.ttfbMs <= 800,
      title: `Server response: ${formatMs(c.ttfbMs)}`,
      text: c.ttfbMs <= 800 ? "Crawlers get the HTML quickly." : "Crawlers wait for the HTML before they can read anything. Under 800 ms is Google's target.",
    });
  if (typeof c.rawWords === "number")
    rows.push({
      ok: !c.appShell && c.rawWords >= 60,
      title: `${c.rawWords.toLocaleString("en-US")} words in the raw HTML`,
      text: c.appShell
        ? "The HTML is almost empty and the content is built by JavaScript. Most AI crawlers don't run JavaScript, so they may see a blank page."
        : c.rawWords < 60
          ? "Very little text is in the HTML the server sends. Check the main content isn't loaded by JavaScript."
          : "The content is in the HTML the server sends, so crawlers that don't run JavaScript can read it.",
    });
  else if (c.rawError) rows.push({ ok: null, title: "Raw HTML not checked", text: c.rawError });
  if (typeof c.rawHasH1 === "boolean") rows.push({ ok: c.rawHasH1, title: c.rawHasH1 ? "Main heading is in the HTML" : "No <h1> in the raw HTML", text: c.rawHasH1 ? "The page's main topic is clear without JavaScript." : "Without JavaScript there's no main heading, which makes the topic less clear to crawlers." });
  if (typeof c.htmlBytes === "number")
    rows.push({
      ok: c.htmlBytes < 1024 * 1024 && c.compressed !== false,
      title: `HTML size: ${formatBytes(c.htmlBytes)}${c.htmlTransferBytes ? ` (${formatBytes(c.htmlTransferBytes)} sent)` : ""}`,
      text: c.compressed === false ? "The HTML isn't compressed, so it takes longer to download." : c.htmlBytes >= 1024 * 1024 ? "Very large HTML is slow to download and some crawlers stop reading after a size limit." : "A reasonable size, compressed in transit.",
    });
  rows.push({ ok: c.redirects === 0, title: c.redirects ? `${c.redirects} redirect${c.redirects > 1 ? "s" : ""} before the page` : "No redirects", text: c.redirects ? "Each redirect is a wasted round trip for visitors and crawlers." : "Crawlers reach the page directly." });
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {rows.map((r, i) => (
        <li key={i} className="flex gap-3 rounded-xl border border-rule bg-white p-4">
          <RatingIcon r={r.ok === null ? "ni" : r.ok ? "good" : "poor"} className="mt-0.5 h-4 w-4" />
          <span>
            <span className="block font-medium">{r.title}</span>
            <span className="mt-0.5 block text-[0.92rem] leading-relaxed text-ink-soft">{r.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function WeightPanel({ run }: { run: SpeedRun }) {
  const total = run.weight.reduce((s, w) => s + w.bytes, 0) || 1;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-rule bg-white p-5">
        <p className="font-medium">
          Page weight: {formatBytes(total)} in {run.weight.reduce((s, w) => s + w.requests, 0)} requests
        </p>
        <ul className="mt-4 space-y-2.5">
          {run.weight.map((w) => (
            <li key={w.type} className="grid grid-cols-[6.5rem_minmax(0,1fr)_5rem] items-center gap-3 text-sm">
              <span>{w.label}</span>
              <span className="h-2 overflow-hidden rounded-full bg-mist">
                <span className="block h-full rounded-full bg-serp" style={{ width: `${(w.bytes / total) * 100}%` }} />
              </span>
              <span className="text-right text-ink-soft">{formatBytes(w.bytes)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-rule bg-white p-5">
        <p className="font-medium">Third parties</p>
        {run.thirdParties.length ? (
          <ul className="mt-3 divide-y divide-rule text-sm">
            {run.thirdParties.slice(0, 8).map((t) => (
              <li key={t.name} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0 truncate">{t.name}</span>
                <span className="shrink-0 text-ink-soft">
                  {formatBytes(t.bytes)}, <span className={t.mainThreadMs > 250 ? "font-medium text-fail" : ""}>{formatMs(t.mainThreadMs)}</span> main thread
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[0.95rem] text-ink-soft">No third-party code was found on this page.</p>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-xl font-semibold tracking-tight">{children}</h3>
      {sub && <p className="mt-1 max-w-3xl text-[0.95rem] text-ink-soft">{sub}</p>}
    </div>
  );
}

export type ResultTab = "overview" | "causes" | "fixes" | "waterfall" | "video" | "trend" | "calculator" | "crawlers" | "weight";

function RunView({ run, other, view, setView }: { run: SpeedRun; other?: SpeedRun; view: ResultTab; setView: (t: ResultTab) => void }) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(run.findings.slice(0, 2).map((f) => f.id)));
  const barRef = useRef<HTMLDivElement>(null);
  // Keep the active tab visible in the bar on narrow screens.
  useEffect(() => {
    const btn = document.getElementById(`rt-${run.strategy}-${view}`);
    const list = btn?.parentElement;
    if (btn && list) list.scrollTo({ left: btn.offsetLeft - list.clientWidth / 2 + btn.clientWidth / 2 });
  }, [view, run.strategy]);
  // Switch tab, then scroll to an element inside it once it has rendered.
  const show = (t: ResultTab, anchor?: string) => {
    setView(t);
    setTimeout(() => {
      const el = anchor ? document.getElementById(anchor) : null;
      if (el) el.scrollIntoView({ block: "start" });
      else if (barRef.current && barRef.current.getBoundingClientRect().top < 64) window.scrollTo(0, barRef.current.offsetTop - 64);
    }, 30);
  };
  const openFix = (id: string) => {
    setOpenIds((s) => new Set(s).add(id));
    show("fixes", `fix-${run.strategy}-${id}`);
  };
  const toCause = (k: MetricKey) => {
    const target = run.diagnoses.find((d) => d.metric === k) ?? run.diagnoses.find((d) => d.metric === (k === "INP" ? "TBT" : k === "SI" ? "FCP" : k));
    show("causes", target ? `cause-${run.strategy}-${target.metric}` : undefined);
  };
  const cwv = run.field?.passed ?? run.originField?.passed ?? null;
  const problems = run.diagnoses.filter((d) => d.rating !== "good");
  const labKeys = (["LCP", "TBT", "CLS", "FCP", "SI", "TTFB"] as MetricKey[]).filter((k) => run.lab[k]);
  const calcValues = useMemo(
    () => (run.lab.FCP && run.lab.SI && run.lab.LCP && run.lab.TBT && run.lab.CLS ? { FCP: run.lab.FCP.value, SI: run.lab.SI.value, LCP: run.lab.LCP.value, TBT: run.lab.TBT.value, CLS: run.lab.CLS.value } : null),
    [run],
  );
  const c = run.crawler;
  const crawlerIssues = [typeof c.ttfbMs === "number" && c.ttfbMs > 800, !!c.appShell || (typeof c.rawWords === "number" && c.rawWords < 60), c.rawHasH1 === false, c.compressed === false, c.redirects > 0].filter(Boolean).length;
  const wfBad = run.waterfall?.insights.filter((i) => i.tone !== "good").length ?? 0;
  const highFixes = run.findings.filter((f) => f.impact === "high").length;
  type Badge = { text: string; tone: "good" | "ni" | "poor" | "plain" } | null;
  const tabs: { id: ResultTab; label: string; badge: Badge }[] = [
    { id: "overview", label: "Overview", badge: cwv === null ? null : { text: cwv ? "CWV passed" : "CWV failed", tone: cwv ? "good" : "poor" } },
    { id: "causes", label: "Root causes", badge: problems.length ? { text: String(problems.length), tone: problems.some((d) => d.rating === "poor") ? "poor" : "ni" } : { text: "0", tone: "good" } },
    { id: "fixes", label: "Fixes", badge: run.findings.length ? { text: String(run.findings.length), tone: highFixes ? "poor" : "ni" } : { text: "0", tone: "good" } },
    { id: "waterfall", label: "Waterfall", badge: run.waterfall?.rows.length ? { text: `${run.waterfall.rows.length} files`, tone: "plain" } : null },
    { id: "video", label: "Video", badge: run.filmstrip.length ? { text: "Replay", tone: "plain" } : null },
    { id: "trend", label: "Trend", badge: null },
    { id: "calculator", label: "Score calculator", badge: null },
    { id: "crawlers", label: "AI & crawlers", badge: { text: crawlerIssues ? String(crawlerIssues) : "OK", tone: crawlerIssues ? "ni" : "good" } },
    { id: "weight", label: "Page weight", badge: { text: formatBytes(run.weight.reduce((a, w) => a + w.bytes, 0)), tone: "plain" } },
  ];
  void wfBad;

  return (
    <div className="space-y-8">
      {/* Verdict */}
      <div className="flex flex-col gap-6 rounded-2xl border border-rule bg-white p-5 sm:flex-row sm:items-center sm:p-6">
        <ScoreRing score={run.score} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-soft">
            {run.strategy === "mobile" ? "Mobile" : "Desktop"} performance score (lab). <span className="break-all">{run.finalUrl}</span>
          </p>
          {run.platform && (
            <p className="mt-2 inline-flex flex-wrap items-center gap-1.5 rounded-md bg-mist px-2.5 py-1 text-sm">
              <span className="text-ink-soft">Built with</span>
              <span className="font-medium">{run.platform.name}</span>
              {run.platform.extras.length > 0 && <span className="text-ink-soft">+ {run.platform.extras.join(", ")}</span>}
              {run.platform.cloudflare && <span className="text-ink-soft">behind Cloudflare</span>}
            </p>
          )}
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            {cwv === null ? "Core Web Vitals: not enough real-user data" : cwv ? "Core Web Vitals assessment: passed" : "Core Web Vitals assessment: failed"}
          </p>
          <p className="mt-1 text-[0.95rem] text-ink-soft">
            {problems.length
              ? `${problems.length} metric${problems.length > 1 ? "s need" : " needs"} work. ${run.findings.filter((f) => f.impact === "high").length} high-impact fix${run.findings.filter((f) => f.impact === "high").length === 1 ? "" : "es"} below, each with the element and the code to change.`
              : "Every metric is in Google's good range."}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
          <CopyButton text={devReport(run)} label="Copy report for a developer" className="px-3.5 py-2 text-sm text-ink" />
          <button
            type="button"
            onClick={() => {
              const blob = new Blob([JSON.stringify(run, null, 2)], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `page-speed-${run.strategy}.json`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}
            className="rounded-md border border-rule bg-white px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-ink-soft"
          >
            Download JSON
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div ref={barRef} className="sticky top-16 z-30 -mx-4 border-b border-rule bg-paper/95 px-4 backdrop-blur-md sm:mx-0 sm:px-0">
        <div
          role="tablist"
          aria-label="Result sections"
          className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onKeyDown={(e) => {
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
            const ids = tabs.map((t) => t.id);
            const next = ids[(ids.indexOf(view) + (e.key === "ArrowRight" ? 1 : ids.length - 1)) % ids.length];
            setView(next);
            requestAnimationFrame(() => document.getElementById(`rt-${run.strategy}-${next}`)?.focus());
          }}
        >
          {tabs.map((t) => {
            const active = view === t.id;
            return (
              <button
                key={t.id}
                id={`rt-${run.strategy}-${t.id}`}
                role="tab"
                aria-selected={active}
                aria-controls={`rp-${run.strategy}`}
                tabIndex={active ? 0 : -1}
                onClick={() => show(t.id)}
                className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-[0.93rem] font-medium transition-colors ${active ? "border-ink text-ink" : "border-transparent text-ink-soft hover:border-rule hover:text-ink"}`}
              >
                {t.label}
                {t.badge && (
                  <span className={`rounded-full px-1.5 py-px text-[0.7rem] font-semibold ${t.badge.tone === "poor" ? "bg-fail/10 text-fail" : t.badge.tone === "ni" ? "bg-warn/10 text-warn" : t.badge.tone === "good" ? "bg-pass/10 text-pass" : "bg-mist text-ink-soft"}`}>
                    {t.badge.text}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div id={`rp-${run.strategy}`} role="tabpanel" aria-labelledby={`rt-${run.strategy}-${view}`} className="space-y-14">
        {view === "overview" && (
          <>
            <section>
              <SectionTitle sub="What real Chrome visitors experienced. This is the data Google uses for Core Web Vitals in Search.">Real visitors (field data)</SectionTitle>
              <FieldSection field={run.field} origin={run.originField} strategy={run.strategy} onWhy={toCause} />
            </section>
            <section>
              <SectionTitle sub={`One load in Google's lab on a ${run.strategy === "mobile" ? "mid-range phone with a slow 4G connection" : "desktop with a fast connection"}. Use it to find causes; numbers vary a little from run to run.`}>Lab test (this run)</SectionTitle>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {labKeys.map((k) => (
                  <MetricCard key={k} m={run.lab[k]!} strategy={run.strategy} onWhy={() => toCause(k)} />
                ))}
              </ul>
              <div className="mt-6">
                <p className="mb-2 text-sm font-medium">How the page loaded</p>
                <Filmstrip run={run} />
              </div>
            </section>
            {run.findings.length > 0 && (
              <section>
                <SectionTitle sub="The fixes that will move your scores most. Each one has the element, the code and the steps.">Start here</SectionTitle>
                <ol className="grid gap-2">
                  {run.findings.slice(0, 3).map((f, i) => (
                    <li key={f.id}>
                      <button type="button" onClick={() => openFix(f.id)} className="flex w-full items-center gap-4 rounded-xl border border-rule bg-white px-4 py-3 text-left transition-colors hover:border-ink-soft">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mist text-sm font-semibold">{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold leading-snug">{f.title}</span>
                          <span className="mt-0.5 block text-sm text-ink-soft">{f.summary}</span>
                        </span>
                        <span className={`hidden shrink-0 rounded-md px-2 py-0.5 text-xs font-medium sm:inline ${IMPACT[f.impact].cls}`}>{IMPACT[f.impact].label}</span>
                      </button>
                    </li>
                  ))}
                </ol>
                {run.findings.length > 3 && (
                  <button type="button" onClick={() => show("fixes")} className="mt-3 text-sm font-medium text-serp hover:underline">
                    See all {run.findings.length} fixes
                  </button>
                )}
              </section>
            )}
          </>
        )}

        {view === "causes" && (
          <section>
            <SectionTitle sub="The main cause behind each metric, worked out from Google's trace of the page load.">Root causes</SectionTitle>
            <ul className="grid gap-4">
              {run.diagnoses.map((d) => (
                <DiagnosisCard key={d.metric} d={d} run={run} findings={run.findings} onOpen={openFix} />
              ))}
            </ul>
          </section>
        )}

        {view === "fixes" && (
          <>
            <section>
              <SectionTitle sub="Ordered by how much each fix improves your Core Web Vitals. Open one to see the element, the current code and the fixed code.">
                {run.findings.length ? `${run.findings.length} fixes, biggest impact first` : "No fixes needed"}
              </SectionTitle>
              {run.findings.length ? (
                <ol className="grid gap-3">
                  {run.findings.map((f, i) => (
                    <FindingCard
                      key={f.id}
                      f={f}
                      n={i + 1}
                      run={run}
                      open={openIds.has(f.id)}
                      onToggle={(o) =>
                        setOpenIds((s) => {
                          const n = new Set(s);
                          if (o) n.add(f.id);
                          else n.delete(f.id);
                          return n;
                        })
                      }
                    />
                  ))}
                </ol>
              ) : (
                <p className="text-ink-soft">Lighthouse found nothing worth fixing on this page.</p>
              )}
            </section>
            {run.passed.length > 0 && (
              <details className="rounded-xl border border-rule bg-white">
                <summary className="cursor-pointer px-5 py-3.5 font-medium">{run.passed.length} checks passed</summary>
                <ul className="grid gap-x-6 gap-y-1.5 border-t border-rule px-5 py-4 text-sm sm:grid-cols-2">
                  {run.passed.map((p) => (
                    <li key={p} className="flex gap-2">
                      <RatingIcon r="good" className="mt-0.5 h-3.5 w-3.5" />
                      {p}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}

        {view === "waterfall" && (
          <section>
            <SectionTitle sub="Every file the page loaded, in order, and what the pattern says about why the page is slow.">Request waterfall</SectionTitle>
            {run.waterfall?.rows.length ? <WaterfallSection wf={run.waterfall} /> : <p className="text-ink-soft">Google didn&apos;t return the list of requests for this test.</p>}
          </section>
        )}

        {view === "video" && (
          <section>
            <SectionTitle sub="Watch the page load step by step, with what's happening at each moment. Download it as a video or GIF to share.">Page load replay</SectionTitle>
            {run.filmstrip.length ? <ReplaySection run={run} other={other} /> : <p className="text-ink-soft">Google didn&apos;t return snapshots for this test, so there&apos;s nothing to replay.</p>}
          </section>
        )}

        {view === "trend" && (
          <section>
            <SectionTitle sub="Six months of weekly real-visitor data from the Chrome UX Report, with what changed and when.">Real-visitor trend</SectionTitle>
            <TrendSection url={run.finalUrl} strategy={run.strategy} />
          </section>
        )}

        {view === "calculator" && (
          <section>
            <SectionTitle sub="Your lab numbers, loaded into Lighthouse's own scoring formula. Move a slider to see what fixing that metric would do to the score.">What&apos;s each fix worth?</SectionTitle>
            {calcValues ? <ScoreCalculator compact device={run.strategy} initial={calcValues} /> : <p className="text-ink-soft">This test didn&apos;t return all five lab metrics, so the score can&apos;t be recalculated.</p>}
          </section>
        )}

        {view === "crawlers" && (
          <section>
            <SectionTitle sub="Most AI crawlers, including the ones behind ChatGPT, Claude and Perplexity, read the raw HTML without running JavaScript. These checks show what they get.">Search and AI crawler view</SectionTitle>
            <CrawlerPanel run={run} />
          </section>
        )}

        {view === "weight" && (
          <section>
            <SectionTitle sub="Every file type the page downloads, and the third parties it loads code from.">What the page is made of</SectionTitle>
            <WeightPanel run={run} />
          </section>
        )}
      </div>

      <p className="text-sm text-ink-soft">
        Tested {new Date(run.fetchedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} with Lighthouse {run.lighthouseVersion} on Google&apos;s PageSpeed Insights servers.
        {run.warnings.length > 0 && ` Lighthouse noted: ${run.warnings.join(" ")}`}
      </p>
    </div>
  );
}

// ---------- the tool ----------

const STEPS = ["Sending the page to Google's Lighthouse", "Loading it on a throttled phone and a desktop", "Measuring LCP, CLS and blocking time", "Reading real-user data from Chrome", "Working out the root causes"];

type State = { run?: SpeedRun; error?: string; loading: boolean };

export function PageSpeed() {
  const [url, setUrl] = useState("");
  const [tab, setTab] = useState<Strategy>("mobile");
  const [view, setView] = useState<ResultTab>("overview");
  const [state, setState] = useState<Record<Strategy, State>>({ mobile: { loading: false }, desktop: { loading: false } });
  const [started, setStarted] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);
  const loading = state.mobile.loading || state.desktop.loading;

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [loading]);

  async function runOne(strategy: Strategy, target: string, fresh: boolean) {
    setState((s) => ({ ...s, [strategy]: { loading: true } }));
    const post = async (fresh: boolean) => {
      const res = await fetch("/api/page-speed", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: target, strategy, fresh }) });
      const data = await res.json().catch(() => null);
      if (!data) throw new Error("The server didn't answer. Check your connection and try again.");
      if (!res.ok) throw new Error(data.error ?? "The test failed. Try again.");
      return data as { run?: SpeedRun; job?: string };
    };
    try {
      let data = await post(fresh);
      const deadline = Date.now() + 210_000;
      let restarted = false;
      // Google can take over a minute on heavy pages, so the test runs as a job and we check on it.
      while (!data.run && data.job) {
        if (Date.now() > deadline) throw new Error("Google is taking unusually long to test this page. Try again in a few minutes.");
        await new Promise((r) => setTimeout(r, 3000));
        const res = await fetch(`/api/page-speed?job=${encodeURIComponent(data.job)}`, { cache: "no-store" });
        const poll = await res.json().catch(() => null);
        if (!poll) continue; // a hiccup on one check: try the next one
        if (res.status === 404 && !restarted) {
          // The server restarted mid-test (for example during a deploy): start again once.
          restarted = true;
          data = await post(false);
          continue;
        }
        if (!res.ok) throw new Error(poll.error === "lost" ? "The test was interrupted. Try again." : (poll.error ?? "The test failed. Try again."));
        if (poll.run) data = { run: poll.run };
      }
      if (!data.run) throw new Error("The test didn't return a result. Try again.");
      setState((s) => ({ ...s, [strategy]: { loading: false, run: data.run } }));
    } catch (e) {
      setState((s) => ({ ...s, [strategy]: { loading: false, error: e instanceof Error ? e.message : "The test failed. Try again." } }));
    }
  }

  function run(target = url, fresh = false) {
    if (!target.trim()) return;
    const t = Date.now();
    setView("overview");
    setStarted(t);
    setNow(t);
    const u = new URL(window.location.href);
    u.searchParams.set("url", target.trim());
    window.history.replaceState(null, "", u);
    runOne("mobile", target.trim(), fresh);
    runOne("desktop", target.trim(), fresh);
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ block: "start" }));
  }

  // Shared links: /tools/page-speed-test?url=https://example.com runs straight away.
  useEffect(() => {
    const shared = new URLSearchParams(window.location.search).get("url");
    if (!shared) return;
    const t = setTimeout(() => {
      setUrl(shared);
      run(shared);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const elapsed = started ? Math.max(0, Math.round((now - started) / 1000)) : 0;
  const step = Math.min(STEPS.length - 1, Math.floor(elapsed / 7));
  const current = state[tab];
  const any = state.mobile.run || state.desktop.run || state.mobile.error || state.desktop.error || loading;

  return (
    <div>
      <div className="rounded-2xl border border-rule bg-white p-4 shadow-[0_1px_0_#D9E0EA,0_24px_48px_-32px_rgba(14,26,43,0.3)] sm:p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <label htmlFor="ps-url" className="sr-only">Page URL</label>
          <input
            id="ps-url"
            type="text"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            placeholder="https://example.com/page"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-rule bg-paper px-4 py-3 font-mono text-[0.95rem] outline-none transition-colors placeholder:text-ink-soft/60 focus:border-serp focus:bg-white"
          />
          <button type="submit" disabled={loading || !url.trim()} className="rounded-lg bg-ink px-6 py-3 font-medium text-paper transition-colors hover:bg-serp disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? "Testing…" : "Test page speed"}
          </button>
        </form>
        <p className="mt-3 text-sm text-ink-soft">Tests mobile and desktop at the same time on Google&apos;s servers. It usually takes 20 to 40 seconds, and up to two minutes for heavy pages.</p>
      </div>

      <div ref={resultsRef} className="scroll-mt-24">
        {any && (
          <div className="mt-8">
            <div role="tablist" aria-label="Device" className="inline-flex rounded-lg bg-mist p-1 text-sm">
              {(["mobile", "desktop"] as Strategy[]).map((s) => {
                const r = state[s].run;
                return (
                  <button key={s} role="tab" aria-selected={tab === s} onClick={() => setTab(s)} className={`flex items-center gap-2 rounded-md px-4 py-1.5 font-medium transition-colors ${tab === s ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}>
                    {s === "mobile" ? "Mobile" : "Desktop"}
                    {state[s].loading && <span className="h-3 w-3 animate-spin rounded-full border-2 border-ink-soft/30 border-t-serp motion-reduce:animate-none" aria-label="Testing" />}
                    {r && <span className={`text-xs font-semibold ${TONE[r.score >= 90 ? "good" : r.score >= 50 ? "ni" : "poor"].text}`}>{r.score}</span>}
                    {state[s].error && <span className="h-2 w-2 rounded-full bg-fail" aria-label="Failed" />}
                  </button>
                );
              })}
            </div>
            {current.run && !loading && (
              <button type="button" onClick={() => run(current.run!.requestedUrl, true)} className="ml-3 text-sm font-medium text-serp hover:underline">
                Run again
              </button>
            )}

            <div className="mt-6">
              {current.loading && (
                <div className="rounded-2xl border border-rule bg-white p-6" aria-live="polite">
                  <p className="text-lg font-semibold tracking-tight">Testing the {tab} page… {elapsed}s</p>
                  <ol className="mt-4 space-y-2">
                    {STEPS.map((s, i) => (
                      <li key={s} className={`flex items-center gap-2.5 text-[0.95rem] ${i < step ? "text-ink" : i === step ? "font-medium text-ink" : "text-ink-soft/60"}`}>
                        {i < step ? (
                          <RatingIcon r="good" className="h-4 w-4" />
                        ) : i === step ? (
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-soft/30 border-t-serp motion-reduce:animate-none" />
                        ) : (
                          <span className="h-4 w-4 rounded-full border-2 border-rule" />
                        )}
                        {s}
                      </li>
                    ))}
                  </ol>
                  {elapsed > 45 && <p className="mt-4 text-sm text-ink-soft">This page is slow to test. Heavy pages can take Google up to two minutes, so keep this tab open.</p>}
                </div>
              )}
              {current.error && !current.loading && (
                <p role="alert" className="flex gap-2 rounded-lg bg-fail/10 px-4 py-3 text-fail">
                  <RatingIcon r="poor" className="mt-0.5 h-4 w-4" />
                  {current.error}
                </p>
              )}
              {current.run && !current.loading && <RunView key={current.run.fetchedAt + tab} run={current.run} other={state[tab === "mobile" ? "desktop" : "mobile"].run} view={view} setView={setView} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
