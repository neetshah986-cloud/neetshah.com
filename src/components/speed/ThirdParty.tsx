"use client";

import { useState } from "react";
import { formatBytes, formatMs } from "@/lib/speed/metrics";
import { DELAY_LOADER, type ThirdParty } from "@/lib/speed/thirdparty";
import type { SpeedRun } from "@/lib/speed/types";
import { Code, ToneIcon } from "./ui";

const COST = {
  high: { label: "High cost", tone: "poor" as const, text: "text-fail", bg: "bg-fail/10" },
  medium: { label: "Medium cost", tone: "ni" as const, text: "text-warn", bg: "bg-warn/10" },
  low: { label: "Low cost", tone: "good" as const, text: "text-pass", bg: "bg-pass/10" },
};

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function host(url: string) {
  try {
    const u = new URL(url);
    return u.host + u.pathname;
  } catch {
    return url;
  }
}

function Row({ t, max, open, onToggle }: { t: ThirdParty; max: number; open: boolean; onToggle: () => void }) {
  const c = COST[t.cost];
  const blockW = max ? (t.blockingMs / max) * 100 : 0;
  const runW = max ? (Math.max(t.mainThreadMs, t.blockingMs) / max) * 100 : 0;
  return (
    <li className="border-b border-rule last:border-0">
      <button type="button" onClick={onToggle} aria-expanded={open} className="grid w-full grid-cols-1 items-center gap-x-5 gap-y-2 px-4 py-4 text-left transition-colors hover:bg-mist/50 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto] sm:px-5">
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate font-semibold">{t.name}</span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded bg-mist px-1.5 py-0.5 text-ink-soft">{t.categoryLabel}</span>
            {t.essential ? (
              <span className="rounded bg-mist px-1.5 py-0.5 text-ink-soft">Usually needed</span>
            ) : (
              <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium ${c.bg} ${c.text}`}>
                <ToneIcon tone={c.tone} className="h-3.5 w-3.5" />
                {c.label}
              </span>
            )}
          </span>
        </span>
        <span className="min-w-0">
          {/* Bar: dark part is blocking time, light part is the rest of its main-thread work. */}
          <span className="relative block h-3 overflow-hidden rounded-full bg-mist" aria-hidden>
            <span className="absolute inset-y-0 left-0 rounded-full bg-serp/25" style={{ width: `${runW}%` }} />
            <span className="absolute inset-y-0 left-0 rounded-full bg-serp" style={{ width: `${blockW}%` }} />
          </span>
          <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[0.82rem] text-ink-soft">
            <span>
              <span className="font-medium text-ink">{formatMs(t.blockingMs)}</span> blocking
            </span>
            <span>
              <span className="font-medium text-ink">{formatMs(t.mainThreadMs)}</span> of work
            </span>
            <span>
              <span className="font-medium text-ink">{formatBytes(t.bytes)}</span> in {t.requests} file{t.requests === 1 ? "" : "s"}
            </span>
            {t.renderBlocking && <span className="font-medium text-fail">Blocks the first paint</span>}
            {t.beforeLcp && !t.essential && <span>Starts before your main content</span>}
          </span>
        </span>
        <span className="flex items-center gap-3 sm:justify-end">
          {t.scoreGain > 0 && (
            <span className="rounded-md bg-pass/10 px-2 py-1 text-sm font-semibold text-pass" title="Estimated gain if it loaded after the page">
              +{t.scoreGain} {t.scoreGain === 1 ? "pt" : "pts"}
            </span>
          )}
          <svg viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
            <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="grid gap-5 px-4 pb-5 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <p className="text-sm font-medium">What to do</p>
            <ul className="mt-2 space-y-2 text-[0.93rem] leading-relaxed">
              {t.advice.map((a) => (
                <li key={a} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-serp" aria-hidden />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
            {t.scoreGain > 0 && (
              <p className="mt-3 rounded-md bg-mist px-3 py-2 text-sm text-ink-soft">
                If {t.name} loaded after the page, Total Blocking Time would drop by about {formatMs(t.blockingMs)} and the score could rise by about {t.scoreGain} point{t.scoreGain === 1 ? "" : "s"}.
              </p>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">Files</p>
            <ul className="mt-2 divide-y divide-rule rounded-lg border border-rule text-[0.82rem]">
              {t.files.slice(0, 8).map((f) => (
                <li key={f.url} className="flex items-baseline justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 font-mono [overflow-wrap:anywhere]">{host(f.url)}</span>
                  <span className="shrink-0 text-ink-soft">
                    {formatBytes(f.bytes)}
                    {f.mainThreadMs >= 1 ? `, ${formatMs(f.mainThreadMs)}` : ""}
                  </span>
                </li>
              ))}
              {t.files.length > 8 && <li className="px-3 py-2 text-ink-soft">and {t.files.length - 8} more</li>}
            </ul>
          </div>
        </div>
      )}
    </li>
  );
}

export function ThirdPartySection({ run }: { run: SpeedRun }) {
  const tp = run.thirdParty;
  const [open, setOpen] = useState<Set<string>>(() => new Set(tp?.list[0] && !tp.list[0].essential ? [tp.list[0].name] : []));
  if (!tp || !tp.list.length)
    return (
      <p className="rounded-xl border border-dashed border-rule bg-white p-5 leading-relaxed text-ink-soft">
        No outside companies&apos; code ran on this page. Everything came from the site itself, which is good for speed.
      </p>
    );
  const max = Math.max(...tp.list.map((t) => Math.max(t.blockingMs, t.mainThreadMs)), 1);
  const optional = tp.list.filter((t) => !t.essential);
  const worst = optional[0];
  const gain = tp.scoreIfDelayed !== null && tp.score !== null ? tp.scoreIfDelayed - tp.score : 0;
  const share = tp.mainThreadShare;
  const tone = share >= 0.4 || tp.blockingMs >= 300 ? "poor" : share >= 0.2 || tp.blockingMs >= 100 ? "ni" : "good";

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-rule bg-white p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <ToneIcon tone={tone} className="mt-1 h-5 w-5" />
            <div>
              <p className="text-xl font-semibold leading-snug tracking-tight">
                {tp.list.length} outside {tp.list.length === 1 ? "company runs" : "companies run"} {formatMs(tp.mainThreadMs)} of code on this page and add {formatBytes(tp.bytes)}.
              </p>
              <p className="mt-2 leading-relaxed text-ink-soft">
                That&apos;s {pct(share)} of all the work the browser does and {pct(tp.byteShare)} of everything it downloads.
                {worst && worst.blockingMs > 0 ? ` ${worst.name} costs the most: it blocks the page for about ${formatMs(worst.blockingMs)}.` : ""}
              </p>
            </div>
          </div>
          {/* Share of main-thread work: third parties vs the site's own code. */}
          <div className="mt-5">
            <div className="flex h-3 overflow-hidden rounded-full bg-mist" aria-hidden>
              <span className="h-full bg-serp" style={{ width: pct(share) }} />
            </div>
            <div className="mt-1.5 flex justify-between text-xs text-ink-soft">
              <span>Outside code {pct(share)}</span>
              <span>Your own code and the browser {pct(1 - share)}</span>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-rule bg-white p-5 sm:p-6">
          <p className="text-sm text-ink-soft">If the optional ones loaded after the page</p>
          {tp.score !== null && tp.scoreIfDelayed !== null && gain > 0 ? (
            <>
              <p className="mt-2 flex items-baseline gap-3">
                <span className="text-4xl font-semibold tracking-tight text-ink-soft">{tp.score}</span>
                <svg viewBox="0 0 24 12" className="h-3 w-6 text-ink-soft" aria-hidden>
                  <path d="M1 6h20M16 1l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-4xl font-semibold tracking-tight text-pass">{tp.scoreIfDelayed}</span>
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Estimated {run.strategy} score with {optional.length} optional {optional.length === 1 ? "script" : "scripts"} delayed until after load. Together they gain more than the sum of each one, because the score curve isn&apos;t a straight line.
              </p>
            </>
          ) : (
            <p className="mt-2 leading-relaxed">Delaying them wouldn&apos;t change the score much. They don&apos;t block the page for long.</p>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-rule bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-mist/40 px-4 py-2.5 text-xs text-ink-soft sm:px-5">
          <span>Sorted by how long each company blocks the page. Click a row for what to do.</span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full bg-serp" aria-hidden /> Blocking
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full bg-serp/25" aria-hidden /> Other work
            </span>
          </span>
        </div>
        <ul>
          {tp.list.map((t) => (
            <Row
              key={t.name}
              t={t}
              max={max}
              open={open.has(t.name)}
              onToggle={() =>
                setOpen((s) => {
                  const n = new Set(s);
                  if (n.has(t.name)) n.delete(t.name);
                  else n.add(t.name);
                  return n;
                })
              }
            />
          ))}
        </ul>
      </div>

      {optional.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div className="rounded-xl border border-rule bg-white p-5">
            <p className="font-medium">Load optional scripts after the visitor interacts</p>
            <p className="mt-2 text-[0.93rem] leading-relaxed text-ink-soft">
              Chat widgets, session recorders and marketing pixels don&apos;t need to run before the page is usable. This small script loads them after the first scroll, click or key press, or 5 seconds after the page loads. Replace the two example URLs with the scripts you remove from the page.
            </p>
            <p className="mt-3 text-[0.93rem] leading-relaxed text-ink-soft">On WordPress, WP Rocket (&quot;Delay JavaScript execution&quot;) and LiteSpeed Cache (&quot;Load JS Deferred: Delayed&quot;) do the same without code. With Google Tag Manager, use the &quot;Window Loaded&quot; trigger.</p>
          </div>
          <Code block={{ label: "Delay loader (paste before </body>)", lang: "html", code: DELAY_LOADER }} />
        </div>
      )}

      <p className="text-sm leading-relaxed text-ink-soft">
        How this is worked out: Google&apos;s test names the company behind each file. Blocking time is each company&apos;s share of the long tasks in this run, scaled to the page&apos;s Total Blocking Time. Score gains use Lighthouse&apos;s own scoring curves, so they&apos;re estimates for this run.
      </p>
    </div>
  );
}
