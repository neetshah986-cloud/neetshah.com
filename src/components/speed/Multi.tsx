"use client";

// Pieces shared by the multi-page modes (leaderboard, page types, Search Console).
import { useEffect, useRef, useState } from "react";
import { hostOf } from "@/lib/speed/compare";
import type { Rating } from "@/lib/speed/metrics";
import type { SpeedRun, Strategy } from "@/lib/speed/types";
import { RunView, type ResultTab } from "./Report";
import { ToneIcon } from "./ui";

export const scoreText = (s: number) => (s >= 90 ? "text-pass" : s >= 50 ? "text-warn" : "text-fail");
export const ratingText: Record<Rating, string> = { good: "text-pass", ni: "text-warn", poor: "text-fail" };
export const ratingTone: Record<Rating, "good" | "ni" | "poor"> = { good: "good", ni: "ni", poor: "poor" };

/** A short label for a page: host plus a shortened path. */
export function pageLabel(url: string, max = 48) {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : decodeURIComponent(u.pathname).replace(/\/$/, "");
    const s = hostOf(url) + path;
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  } catch {
    return url;
  }
}

export function DeviceToggle({ value, onChange, disabled }: { value: Strategy; onChange: (s: Strategy) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Device" className="inline-flex rounded-lg bg-mist p-1 text-sm">
      {(["mobile", "desktop"] as Strategy[]).map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          disabled={disabled}
          onClick={() => onChange(s)}
          className={`rounded-md px-3.5 py-1.5 font-medium transition-colors ${value === s ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}
        >
          {s === "mobile" ? "Mobile" : "Desktop"}
        </button>
      ))}
    </div>
  );
}

export function useTicker(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export type Job = { url: string; label?: string; run?: SpeedRun; error?: string; loading?: boolean; started?: number };

/** Live list of the pages being tested. */
export function Progress({ jobs, now }: { jobs: Job[]; now: number }) {
  const done = jobs.filter((j) => j.run || j.error).length;
  if (done === jobs.length) return null;
  return (
    <div className="rounded-xl border border-rule bg-white p-4 sm:p-5" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">
          Testing {jobs.length} page{jobs.length === 1 ? "" : "s"} on Google&apos;s servers: {done} done
        </p>
        <span className="text-sm text-ink-soft">Usually 20 to 60 seconds each, several at a time</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-mist">
        <div className="h-full rounded-full bg-serp transition-[width]" style={{ width: `${(done / jobs.length) * 100}%` }} />
      </div>
      <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
        {jobs.map((j, i) => (
          <li key={j.url + i} className="flex min-w-0 items-center gap-2">
            {j.run ? (
              <ToneIcon tone="good" className="h-4 w-4" />
            ) : j.error ? (
              <ToneIcon tone="poor" className="h-4 w-4" />
            ) : j.loading ? (
              <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-ink-soft/30 border-t-serp motion-reduce:animate-none" aria-label="Testing" />
            ) : (
              <span className="h-4 w-4 shrink-0 rounded-full border-2 border-rule" aria-label="Waiting" />
            )}
            <span className="min-w-0 truncate">{j.label ?? pageLabel(j.url)}</span>
            {j.loading && j.started && <span className="shrink-0 text-ink-soft">{Math.round((now - j.started) / 1000)}s</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A full single-page report opened from a multi-page result. */
export function RunDetail({ run, title, onClose }: { run: SpeedRun; title?: string; onClose: () => void }) {
  const [view, setView] = useState<ResultTab>("overview");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "start" });
  }, [run]);
  return (
    <section ref={ref} className="scroll-mt-20 rounded-2xl border-2 border-ink/80 bg-paper p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-lg font-semibold tracking-tight">{title ?? `Full report: ${pageLabel(run.finalUrl, 70)}`}</p>
        <button type="button" onClick={onClose} className="shrink-0 rounded-md border border-rule bg-white px-3 py-1.5 text-sm font-medium hover:border-ink-soft">
          Close report
        </button>
      </div>
      <RunView key={run.fetchedAt + run.finalUrl} run={run} view={view} setView={setView} />
    </section>
  );
}

export function downloadText(name: string, text: string, type = "text/csv") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
