"use client";

import { useMemo, useState } from "react";
import { CURVES, perfScore, SCORE_METRICS, scoreAdvice, WEIGHTS, type Device, type ScoreMetric } from "@/lib/speed/lhscore";
import { formatMs } from "@/lib/speed/metrics";

// Categorical slots 1 to 5 of the validated palette, in fixed order. Every metric is also labelled in text.
const COLOR: Record<ScoreMetric, string> = { FCP: "#2a78d6", SI: "#eb6834", LCP: "#1baf7a", TBT: "#eda100", CLS: "#e87ba4" };
const NAME: Record<ScoreMetric, string> = {
  FCP: "First Contentful Paint",
  SI: "Speed Index",
  LCP: "Largest Contentful Paint",
  TBT: "Total Blocking Time",
  CLS: "Cumulative Layout Shift",
};
const RANGE: Record<Device, Record<ScoreMetric, number>> = {
  mobile: { FCP: 8000, SI: 15000, LCP: 15000, TBT: 3000, CLS: 1 },
  desktop: { FCP: 5000, SI: 8000, LCP: 8000, TBT: 1500, CLS: 1 },
};
const DEFAULTS: Record<Device, Record<ScoreMetric, number>> = {
  mobile: { FCP: 2400, SI: 4800, LCP: 4200, TBT: 450, CLS: 0.12 },
  desktop: { FCP: 900, SI: 1600, LCP: 1800, TBT: 180, CLS: 0.05 },
};

const fmt = (m: ScoreMetric, v: number) => (m === "CLS" ? v.toFixed(2) : formatMs(v, v >= 10000 ? 1 : 2).replace(/\.?0+ s$/, " s"));
const band = (s: number) => (s >= 0.9 ? "good" : s >= 0.5 ? "ni" : "poor");
const TEXT = { good: "text-pass", ni: "text-warn", poor: "text-fail" } as const;
const LABEL = { good: "Good", ni: "Needs improvement", poor: "Poor" } as const;

function Gauge({ scores, total }: { scores: Record<ScoreMetric, number>; total: number }) {
  const r = 78;
  const c = 2 * Math.PI * r;
  const gap = 6;
  const starts = SCORE_METRICS.map((_, k) => SCORE_METRICS.slice(0, k).reduce((sum, m) => sum + WEIGHTS[m] * c, 0));
  const b = band(total / 100);
  return (
    <div className="relative mx-auto h-52 w-52 shrink-0">
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90" role="img" aria-label={`Performance score ${total} out of 100`}>
        {SCORE_METRICS.map((m, k) => {
          const len = WEIGHTS[m] * c - gap;
          const start = starts[k];
          return (
            <g key={m}>
              <circle cx="100" cy="100" r={r} fill="none" stroke={COLOR[m]} strokeOpacity="0.16" strokeWidth="12" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-start} />
              <circle cx="100" cy="100" r={r} fill="none" stroke={COLOR[m]} strokeWidth="12" strokeLinecap="butt" strokeDasharray={`${Math.max(0, len * scores[m])} ${c}`} strokeDashoffset={-start} />
            </g>
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-5xl font-semibold tracking-tight ${TEXT[b]}`}>{total}</span>
        <span className={`mt-1 max-w-[6.5rem] text-center text-xs font-medium leading-tight ${TEXT[b]}`}>{LABEL[b]}</span>
      </div>
    </div>
  );
}

export function ScoreCalculator({ initial, device: initialDevice = "mobile", compact = false }: { initial?: Partial<Record<ScoreMetric, number>>; device?: Device; compact?: boolean }) {
  const [device, setDevice] = useState<Device>(initialDevice);
  const start = useMemo(() => {
    const merged = { ...DEFAULTS[initialDevice], ...initial } as Record<ScoreMetric, number>;
    return Object.fromEntries(SCORE_METRICS.map((m) => [m, m === "CLS" ? Math.round(merged[m] * 1000) / 1000 : Math.round(merged[m])])) as Record<ScoreMetric, number>;
  }, [initial, initialDevice]);
  const [values, setValues] = useState<Record<ScoreMetric, number>>(start);
  const { scores, total } = perfScore(device, values);
  const advice = scoreAdvice(device, values, 90);
  const baseline = initial ? perfScore(initialDevice, start).total : null;

  function set(m: ScoreMetric, v: number) {
    if (!Number.isFinite(v) || v < 0) return;
    setValues((s) => ({ ...s, [m]: m === "CLS" ? Math.round(v * 1000) / 1000 : Math.round(v) }));
  }

  return (
    <div className="rounded-2xl border border-rule bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Device" className="inline-flex rounded-lg bg-mist p-1 text-sm">
          {(["mobile", "desktop"] as Device[]).map((d) => (
            <button
              key={d}
              role="tab"
              aria-selected={device === d}
              onClick={() => {
                setDevice(d);
                if (!initial) setValues(DEFAULTS[d]);
              }}
              className={`rounded-md px-4 py-1.5 font-medium transition-colors ${device === d ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}
            >
              {d === "mobile" ? "Mobile" : "Desktop"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm">
          {baseline !== null && <span className="text-ink-soft">Your test: {baseline}</span>}
          <button type="button" onClick={() => setValues(initial ? start : DEFAULTS[device])} className="font-medium text-serp hover:underline">
            {initial ? "Back to my results" : "Reset"}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
        <div className="min-w-0">
          <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_5.5rem_4.5rem] gap-4 border-b border-rule pb-2 text-xs font-medium text-ink-soft sm:grid">
            <span>Metric</span>
            <span>Value</span>
            <span className="text-right">Score</span>
            <span className="text-right">Weight</span>
          </div>
          <ul className="divide-y divide-rule">
            {SCORE_METRICS.map((m) => {
              const s = scores[m];
              const max = Math.max(RANGE[device][m], values[m]);
              const { p10, median } = CURVES[device][m];
              const pts = Math.round(s * WEIGHTS[m] * 1000) / 10;
              const id = `calc-${device}-${m}`;
              return (
                <li key={m} className="grid gap-x-4 gap-y-2 py-4 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_5.5rem_4.5rem] sm:items-center">
                  <label htmlFor={id} className="flex min-w-0 items-start gap-2.5">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COLOR[m] }} />
                    <span className="min-w-0">
                      <span className="block font-medium leading-snug">
                        {NAME[m]} <span className="text-ink-soft">({m})</span>
                      </span>
                      <span className="block text-xs text-ink-soft">
                        90+ at {fmt(m, p10)} or less, 50 at {fmt(m, median)}
                      </span>
                    </span>
                  </label>
                  <div className="flex min-w-0 items-center gap-3">
                    <input
                      id={id}
                      type="range"
                      min={0}
                      max={max}
                      step={m === "CLS" ? 0.005 : 10}
                      value={values[m]}
                      onChange={(e) => set(m, parseFloat(e.target.value))}
                      className="min-w-0 flex-1 accent-ink"
                      style={{ accentColor: COLOR[m] }}
                    />
                    <span className="flex shrink-0 items-center gap-1">
                      <input
                        type="number"
                        aria-label={`${NAME[m]} value`}
                        min={0}
                        step={m === "CLS" ? 0.01 : 50}
                        value={values[m]}
                        onChange={(e) => set(m, parseFloat(e.target.value))}
                        className="w-[5.2rem] rounded-md border border-rule bg-paper px-2 py-1 text-right font-mono text-sm focus:border-serp focus:bg-white focus:outline-none"
                      />
                      <span className="w-6 text-xs text-ink-soft">{m === "CLS" ? "" : "ms"}</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 sm:block sm:text-right">
                    <span className="text-xs text-ink-soft sm:hidden">Score</span>
                    <span>
                      <span className={`text-lg font-semibold ${TEXT[band(s)]}`}>{Math.round(s * 100)}</span>
                      <span className="ml-2 text-xs text-ink-soft sm:ml-0 sm:block">{pts} pts</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 sm:block sm:text-right">
                    <span className="text-xs text-ink-soft sm:hidden">Weight</span>
                    <span className="font-medium">{WEIGHTS[m] * 100}%</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-4">
          <Gauge scores={scores} total={total} />
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-soft">
            {SCORE_METRICS.map((m) => (
              <li key={m} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm" style={{ background: COLOR[m] }} />
                {m} <span className="ml-auto font-medium text-ink">{Math.round(scores[m] * WEIGHTS[m] * 1000) / 10}</span>
                <span>/ {WEIGHTS[m] * 100}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-soft">Each coloured segment is one metric&apos;s share of the score; the filled part is what it currently earns.</p>
        </div>
      </div>

      {/* The answer */}
      <div className="mt-6 rounded-xl border border-serp/30 bg-serp/[0.04] p-5">
        {total >= 90 ? (
          <p className="font-semibold">
            {total} is in Google&apos;s green band.{" "}
            {advice.headroom[0].points >= 1 ? `The last points are in ${NAME[advice.headroom[0].metric]} (${advice.headroom[0].points} points left).` : "There are hardly any points left to win."}
          </p>
        ) : (
          <>
            <p className="font-semibold">
              The quickest route from {total} to 90{advice.plan.length > 1 ? `, in ${advice.plan.length} steps` : ""}:
            </p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[0.95rem] leading-relaxed">
              {advice.plan.map((p) => (
                <li key={p.metric}>
                  Get <b className="font-semibold">{p.metric}</b> from {fmt(p.metric, p.from)} to <b className="font-semibold">{fmt(p.metric, p.to)}</b> <span className="text-ink-soft">(+{p.gain} points)</span>
                </li>
              ))}
            </ol>
          </>
        )}
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Where the points are: {advice.headroom.filter((h) => h.points >= 0.5).map((h) => `${h.metric} ${h.points}`).join(", ") || "none left"}. TBT (30%) and LCP and CLS (25% each) carry 80% of the score, so a 1-point gain there is worth far more than in FCP or Speed Index.
        </p>
      </div>
      {!compact && (
        <p className="mt-4 text-xs leading-relaxed text-ink-soft">
          Uses Lighthouse&apos;s own scoring curves and weights (Lighthouse 10 to 13, the versions PageSpeed Insights runs), and matches the scores in real Lighthouse reports. This is the lab score only: Google ranks pages on real-visitor Core Web Vitals (LCP, INP and CLS), and INP isn&apos;t part of the Lighthouse score.
        </p>
      )}
    </div>
  );
}
