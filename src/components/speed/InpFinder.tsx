"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { analyseInp, inpRating, parseInp, type InpAnalysis } from "@/lib/speed/inp";
import type { SpeedRun } from "@/lib/speed/types";
import { Code, CopyButton, ToneIcon } from "./ui";

const RATING_TEXT = { good: "text-pass", ni: "text-warn", poor: "text-fail" };
const RATING_WORD = { good: "good", ni: "needs improvement", poor: "poor" };
const PHASE = {
  wait: { label: "Waiting to start", color: "#B86E00" },
  code: { label: "Running the code", color: "#1A3FD6" },
  draw: { label: "Drawing the result", color: "#0B8A57" },
};

function Breakdown({ wait, code, draw }: { wait: number; code: number; draw: number }) {
  const total = Math.max(1, wait + code + draw);
  const parts = [
    ["wait", wait],
    ["code", code],
    ["draw", draw],
  ] as const;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-mist" aria-hidden>
        {parts.map(([k, v]) => (
          <span key={k} style={{ width: `${(v / total) * 100}%`, background: PHASE[k].color }} className="h-full border-r-2 border-white last:border-0" />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {parts.map(([k, v]) => (
          <li key={k} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PHASE[k].color }} aria-hidden />
            {PHASE[k].label} <span className="font-semibold">{v} ms</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function short(url: string) {
  try {
    const u = new URL(url);
    const tail = u.pathname.split("/").filter(Boolean).slice(-2).join("/");
    return `${u.host}/…/${tail}`;
  } catch {
    return url;
  }
}

/** Finds the slow tap, click or key press behind a poor INP, using a script the visitor runs on their own page. */
export function InpFinder({ run }: { run?: SpeedRun }) {
  const [script, setScript] = useState("");
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<InpAnalysis | null>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    let alive = true;
    fetch("/inp-finder.js")
      .then((r) => r.text())
      .then((t) => {
        if (!alive) return;
        setScript(t);
        // React won't render javascript: links, so the bookmarklet's address is set directly.
        linkRef.current?.setAttribute("href", `javascript:${encodeURIComponent(t)}`);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const field = run?.field?.metrics.INP ?? run?.originField?.metrics.INP;
  const tbt = run?.lab.TBT;
  const read = () => {
    try {
      setAnalysis(analyseInp(parseInp(pasted)));
      setError("");
    } catch (e) {
      setAnalysis(null);
      setError(e instanceof Error ? e.message : "Couldn't read that.");
    }
  };
  const a = analysis;
  const worst = a?.worst;
  const others = useMemo(() => (a ? [...a.results.interactions].sort((x, y) => y.duration - x.duration).slice(0, 12) : []), [a]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-rule bg-white p-5 sm:p-6">
        {field ? (
          <p className="flex items-start gap-2.5 text-lg font-semibold leading-snug tracking-tight">
            <ToneIcon tone={field.rating} className="mt-1 h-5 w-5" />
            Real visitors wait {field.display} for this page to respond to a tap or click ({RATING_WORD[field.rating]}; good is 200 ms or less).
          </p>
        ) : (
          <p className="text-lg font-semibold leading-snug tracking-tight">Google has no real-visitor INP for this page yet, but you can still find slow interactions yourself.</p>
        )}
        <p className="mt-2 leading-relaxed text-ink-soft">
          Google&apos;s lab test can&apos;t click or type, so it can&apos;t measure INP{tbt ? ` (its Total Blocking Time of ${tbt.display} is only a hint)` : ""}. The INP finder runs on your own page in Chrome, records every tap, click and key press, and shows which one is slow, which element it was, and which script caused it. Nothing is sent anywhere.
        </p>
      </div>

      <ol className="grid gap-4 lg:grid-cols-3">
        <li className="rounded-xl border border-rule bg-white p-5">
          <p className="font-semibold">1. Start the INP finder on your page</p>
          <p className="mt-2 text-[0.93rem] leading-relaxed text-ink-soft">Drag this button to your bookmarks bar, open your page in Chrome on a computer, and click the bookmark.</p>
          <a
            ref={linkRef}
            href="#inp-finder"
            onClick={(e) => e.preventDefault()}
            draggable
            className="mt-3 inline-flex cursor-grab items-center gap-2 rounded-lg bg-ink px-4 py-2.5 font-medium text-paper active:cursor-grabbing"
            title="Drag me to your bookmarks bar"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
              <path d="M5 3h10v14l-5-3.5L5 17z" fill="currentColor" />
            </svg>
            INP finder
          </a>
          <p className="mt-3 text-[0.93rem] leading-relaxed text-ink-soft">
            Or copy the script, open DevTools (F12) on your page, go to Console, paste it and press Enter. If Chrome asks, type <span className="font-mono text-[0.85rem]">allow pasting</span> first.
          </p>
          <div className="mt-2">{script && <CopyButton text={script} label="Copy the script" className="px-3 py-1.5 text-sm text-ink" />}</div>
        </li>
        <li className="rounded-xl border border-rule bg-white p-5">
          <p className="font-semibold">2. Use the page like a visitor</p>
          <p className="mt-2 text-[0.93rem] leading-relaxed text-ink-soft">Open the menu, use filters, add to cart, type in search, open a product gallery. A panel in the corner lists each interaction with its time.</p>
          <p className="mt-2 text-[0.93rem] leading-relaxed text-ink-soft">Clicking a link opens a new page, which closes the panel. Click the bookmark again on the new page: results from earlier pages in the same tab are kept.</p>
          <p className="mt-2 text-[0.93rem] leading-relaxed text-ink-soft">To feel what a mid-range phone feels, open DevTools, Performance, and set CPU to 4x slowdown before you start.</p>
        </li>
        <li className="rounded-xl border border-rule bg-white p-5">
          <p className="font-semibold">3. Paste the results here</p>
          <p className="mt-2 text-[0.93rem] leading-relaxed text-ink-soft">Click Copy results in the panel, then paste below. You&apos;ll get the cause and the fix in plain words.</p>
          <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={3} spellCheck={false} placeholder='{"tool":"neetshah-inp-finder", …}' className="mt-3 w-full rounded-lg border border-rule bg-paper px-3 py-2 font-mono text-[0.8rem] outline-none focus:border-serp focus:bg-white" aria-label="INP finder results" />
          <button type="button" onClick={read} disabled={!pasted.trim()} className="mt-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-serp disabled:opacity-50">
            Explain the results
          </button>
        </li>
      </ol>

      {error && (
        <p role="alert" className="flex gap-2 rounded-lg bg-fail/10 px-4 py-3 text-fail">
          <ToneIcon tone="poor" className="mt-0.5 h-4 w-4" />
          {error}
        </p>
      )}

      {a && (
        <section className="space-y-5">
          <div className="rounded-2xl border border-rule bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-ink-soft">
                  INP finder results for <span className="[overflow-wrap:anywhere]">{a.results.url}</span>
                </p>
                <p className="mt-1 text-2xl font-semibold leading-snug tracking-tight">
                  {worst ? (
                    worst.duration > 200 ? (
                      <>
                        The slowest interaction was {worst.type} on {worst.text ? `“${worst.text}”` : worst.target}: {worst.duration} ms.
                      </>
                    ) : (
                      <>Every interaction you tried was under 200 ms. The slowest took {worst.duration} ms.</>
                    )
                  ) : (
                    "No interactions were recorded. Use the page after starting the INP finder, then copy the results again."
                  )}
                </p>
              </div>
              <div className="sm:text-right">
                <p className="text-sm text-ink-soft">Estimated INP for this visit</p>
                <p className={`text-4xl font-semibold tracking-tight ${RATING_TEXT[a.rating]}`}>{a.results.inp} ms</p>
              </div>
            </div>
            {worst && (
              <div className="mt-5">
                <Breakdown wait={worst.inputDelay} code={worst.processing} draw={worst.presentation} />
              </div>
            )}
            {a.mobileNote && a.rating === "good" && field && field.rating !== "good" && (
              <p className="mt-4 rounded-lg bg-mist/70 px-4 py-3 text-[0.95rem] leading-relaxed">
                Your test was on a computer, which is much faster than most visitors&apos; phones. Set CPU to 4x slowdown in DevTools (Performance tab) and try again: the slow interactions real visitors hit usually show up then.
              </p>
            )}
          </div>

          {a.advice && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="rounded-xl border border-rule bg-white p-5">
                <p className="flex items-start gap-2.5 font-semibold leading-snug">
                  <ToneIcon tone={inpRating(worst!.duration)} className="mt-0.5 h-4 w-4" />
                  {a.advice.title}
                </p>
                <p className="mt-2 leading-relaxed text-ink-soft">{a.advice.why}</p>
                <p className="mt-4 font-medium">What to do</p>
                <ol className="mt-2 space-y-2 text-[0.95rem] leading-relaxed">
                  {a.advice.steps.map((s, i) => (
                    <li key={s} className="flex gap-2.5">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mist text-xs font-semibold">{i + 1}</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="min-w-0 space-y-4">
                {a.advice.code && <Code block={a.advice.code} />}
                {a.scripts.length > 0 && (
                  <div className="rounded-xl border border-rule bg-white">
                    <p className="border-b border-rule px-4 py-2.5 font-medium">Scripts running during the slow interactions</p>
                    <ul className="divide-y divide-rule text-sm">
                      {a.scripts.map((s) => (
                        <li key={s.url + s.fn} className="flex items-start justify-between gap-3 px-4 py-2.5">
                          <span className="min-w-0">
                            <span className="block font-mono text-[0.8rem] [overflow-wrap:anywhere]" title={s.url}>
                              {short(s.url)}
                              {s.fn ? ` ${s.fn}()` : ""}
                            </span>
                            <span className={`text-xs ${s.thirdParty ? "font-medium text-warn" : "text-ink-soft"}`}>{s.owner}</span>
                          </span>
                          <span className="shrink-0 font-semibold">{s.ms} ms</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {others.length > 1 && (
            <div className="overflow-x-auto rounded-xl border border-rule bg-white">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-rule bg-mist/50 text-left text-ink-soft">
                    <th className="px-4 py-2.5 font-medium">Interaction</th>
                    <th className="px-3 py-2.5 font-medium">Total</th>
                    <th className="px-3 py-2.5 font-medium">Waiting</th>
                    <th className="px-3 py-2.5 font-medium">Code</th>
                    <th className="px-3 py-2.5 font-medium">Drawing</th>
                    <th className="px-3 py-2.5 font-medium">Slowest script</th>
                  </tr>
                </thead>
                <tbody>
                  {others.map((it, i) => (
                    <tr key={i} className="border-b border-rule/70 last:border-0">
                      <td className="max-w-[16rem] px-4 py-2.5">
                        <span className="block truncate font-mono text-[0.8rem]" title={it.target}>
                          {it.type} on {it.target}
                        </span>
                        {(it.text || it.page) && (
                          <span className="block truncate text-xs text-ink-soft">
                            {it.text ? `“${it.text}”` : ""}
                            {it.page && it.page !== "/" ? `${it.text ? ", " : ""}on ${it.page}` : ""}
                          </span>
                        )}
                      </td>
                      <td className={`px-3 py-2.5 font-semibold ${RATING_TEXT[inpRating(it.duration)]}`}>{it.duration} ms</td>
                      <td className="px-3 py-2.5">{it.inputDelay} ms</td>
                      <td className="px-3 py-2.5">{it.processing} ms</td>
                      <td className="px-3 py-2.5">{it.presentation} ms</td>
                      <td className="max-w-[14rem] truncate px-3 py-2.5 font-mono text-[0.78rem] text-ink-soft" title={it.scripts?.[0]?.url}>
                        {it.scripts?.[0] ? `${it.scripts[0].url.split("/").pop()}${it.scripts[0].fn ? ` ${it.scripts[0].fn}()` : ""}` : "–"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
