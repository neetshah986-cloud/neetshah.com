"use client";

import { useEffect, useRef, useState } from "react";
import { formatMetric, formatThreshold, METRICS, rate, RATING_LABEL, thresholds } from "@/lib/speed/metrics";
import type { Strategy, Trend, TrendMetric } from "@/lib/speed/types";
import { ToneIcon } from "./ui";

const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const longDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const BAND = { good: "#0B8A57", ni: "#B86E00", poor: "#C42B1C" };
const LINE = "#1A3FD6";

function TrendChart({ m, ends, strategy }: { m: TrendMetric; ends: string[]; strategy: Strategy }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 190;
  const pad = { l: 8, r: 8, t: 12, b: 26 };
  const t = thresholds(m.key, strategy);
  const vals = m.p75.filter((v): v is number => v !== null);
  const top = Math.max(...vals, t.poor) * 1.15;
  const W = Math.max(width, 200);
  const x = (i: number) => pad.l + (ends.length > 1 ? (i / (ends.length - 1)) * (W - pad.l - pad.r) : 0);
  const y = (v: number) => pad.t + (1 - Math.min(v, top) / top) * (H - pad.t - pad.b);

  // Line segments, broken where a week has no data.
  const segs: string[] = [];
  let cur = "";
  m.p75.forEach((v, i) => {
    if (v === null) {
      if (cur) segs.push(cur);
      cur = "";
    } else cur += `${cur ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  if (cur) segs.push(cur);

  const lastI = m.p75.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0).pop() ?? 0;
  const last = m.p75[lastI]!;
  const lastRating = rate(m.key, last, strategy);
  const hv = hover !== null ? m.p75[hover] : null;
  const ticks = [0, Math.floor((ends.length - 1) / 2), ends.length - 1];

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const rel = (e.clientX - r.left) / r.width;
    setHover(Math.max(0, Math.min(ends.length - 1, Math.round(rel * (ends.length - 1)))));
  }

  return (
    <figure className="min-w-0 overflow-hidden rounded-xl border border-rule bg-white p-4">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">
          {METRICS[m.key].name} <span className="text-ink-soft">({m.key})</span>
        </span>
        <span className="flex items-center gap-1.5 text-sm">
          <ToneIcon tone={lastRating} className="h-3.5 w-3.5" />
          <b className="font-semibold">{formatMetric(m.key, last, strategy)}</b>
          <span className="text-ink-soft">now</span>
        </span>
      </figcaption>
      <div ref={ref} className="relative mt-3">
        {width > 0 && (
          <svg width={W} height={H} className="block" role="img" aria-label={`${METRICS[m.key].name} over the last ${ends.length} weeks, now ${formatMetric(m.key, last, strategy)}, ${RATING_LABEL[lastRating]}`}>
            {/* Google's bands */}
            <rect x={pad.l} y={y(t.good)} width={W - pad.l - pad.r} height={y(0) - y(t.good)} fill={BAND.good} opacity="0.07" />
            <rect x={pad.l} y={y(t.poor)} width={W - pad.l - pad.r} height={y(t.good) - y(t.poor)} fill={BAND.ni} opacity="0.08" />
            <rect x={pad.l} y={pad.t} width={W - pad.l - pad.r} height={Math.max(0, y(t.poor) - pad.t)} fill={BAND.poor} opacity="0.07" />
            {[t.good, t.poor].map((v) => (
              <g key={v}>
                <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#4A5A70" strokeOpacity="0.35" strokeDasharray="3 3" />
                <text x={pad.l + 4} y={y(v) - 4} fontSize="10.5" fill="#4A5A70">
                  {formatThreshold(m.key, v)}
                </text>
              </g>
            ))}
            {segs.map((d, i) => (
              <path key={i} d={d} fill="none" stroke={LINE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            ))}
            <circle cx={x(lastI)} cy={y(last)} r="4.5" fill={LINE} stroke="#fff" strokeWidth="2" />
            {ticks.map((i) => (
              <text key={i} x={x(i)} y={H - 8} fontSize="10.5" fill="#4A5A70" textAnchor={i === 0 ? "start" : i === ends.length - 1 ? "end" : "middle"}>
                {shortDate(ends[i])}
              </text>
            ))}
            {hover !== null && (
              <>
                <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="#0E1A2B" strokeOpacity="0.4" />
                {hv !== null && <circle cx={x(hover)} cy={y(hv)} r="4" fill="#fff" stroke={LINE} strokeWidth="2" />}
              </>
            )}
            <rect x={0} y={0} width={W} height={H - pad.b} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
          </svg>
        )}
        {hover !== null && width > 0 && (
          <div
            className="pointer-events-none absolute top-0 z-10 w-max max-w-[14rem] rounded-lg border border-rule bg-white px-3 py-2 text-xs shadow-lg"
            style={x(hover) > W / 2 ? { right: Math.max(W - x(hover) + 10, 0) } : { left: x(hover) + 10 }}
          >
            <p className="text-ink-soft">28 days to {longDate(ends[hover])}</p>
            {hv !== null ? (
              <>
                <p className="mt-0.5 text-sm font-semibold">{formatMetric(m.key, hv, strategy)}</p>
                <p className="text-ink-soft">
                  {RATING_LABEL[rate(m.key, hv, strategy)]}
                  {m.good[hover] !== null && `, ${Math.round(m.good[hover]! * 100)}% of visits good`}
                </p>
              </>
            ) : (
              <p className="mt-0.5">No data that week</p>
            )}
          </div>
        )}
      </div>
      {m.insights.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-rule pt-3">
          {m.insights.map((s, i) => (
            <li key={i} className="flex gap-2 text-[0.88rem] leading-snug">
              <ToneIcon tone={s.tone} className="mt-0.5 h-3.5 w-3.5" />
              <span>{s.text}</span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

export function TrendSection({ url, strategy }: { url: string; strategy: Strategy }) {
  const [state, setState] = useState<{ loading: boolean; trend?: Trend | null; error?: string }>({ loading: true });
  const [more, setMore] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/page-speed/trend", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, strategy }) })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok) setState({ loading: false, error: d.error ?? "Couldn't load the history." });
        else setState({ loading: false, trend: d.trend ?? null });
      })
      .catch(() => alive && setState({ loading: false, error: "Couldn't load the history." }));
    return () => {
      alive = false;
    };
  }, [url, strategy]);

  if (state.loading) return <p className="rounded-xl border border-rule bg-white p-5 text-ink-soft">Loading six months of real-visitor data…</p>;
  if (state.error) return <p className="rounded-xl border border-dashed border-rule bg-white p-5 text-ink-soft">{state.error}</p>;
  const t = state.trend;
  if (!t || !t.metrics.length)
    return (
      <p className="rounded-xl border border-dashed border-rule bg-white p-5 leading-relaxed text-ink-soft">
        Google doesn&apos;t have enough Chrome visits to this page or site to show a history. The trend appears once a site has steady traffic from Chrome users.
      </p>
    );
  const core = t.metrics.filter((m) => ["LCP", "INP", "CLS"].includes(m.key));
  const extra = t.metrics.filter((m) => !["LCP", "INP", "CLS"].includes(m.key));
  const passed = t.cwv.filter((v) => v === true).length;
  const known = t.cwv.filter((v) => v !== null).length;

  return (
    <div className="space-y-5">
      <div className="flex gap-3 rounded-xl border border-rule bg-white p-5">
        <ToneIcon tone={t.headline.tone} className="mt-1 h-5 w-5" />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold leading-snug tracking-tight">{t.headline.text}</p>
          <div className="mt-3">
            <p className="text-xs text-ink-soft">Core Web Vitals, week by week ({t.formFactor === "PHONE" ? "mobile" : "desktop"}, {t.scope === "url" ? "this URL" : "whole site"})</p>
            <ol className="mt-1.5 flex flex-wrap gap-[3px]" aria-label={`Passed ${passed} of ${known} weeks`}>
              {t.cwv.map((v, i) => (
                <li
                  key={i}
                  title={`28 days to ${longDate(t.ends[i])}: ${v === null ? "no data" : v ? "passed" : "failed"}`}
                  className={`flex h-5 w-5 items-center justify-center rounded-[4px] text-[0.65rem] font-bold text-white ${v === null ? "bg-rule" : v ? "bg-pass" : "bg-fail"}`}
                >
                  {v === null ? "" : v ? "✓" : "✕"}
                </li>
              ))}
            </ol>
            <p className="mt-1.5 text-xs text-ink-soft">
              ✓ passed, ✕ failed. {shortDate(t.ends[0])} to {shortDate(t.ends[t.ends.length - 1])}.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {core.map((m) => (
          <TrendChart key={m.key} m={m} ends={t.ends} strategy={strategy} />
        ))}
      </div>
      {extra.length > 0 && (
        <>
          <button type="button" onClick={() => setMore((v) => !v)} className="text-sm font-medium text-serp hover:underline">
            {more ? "Hide" : "Show"} FCP and TTFB history
          </button>
          {more && (
            <div className="grid gap-4 lg:grid-cols-3">
              {extra.map((m) => (
                <TrendChart key={m.key} m={m} ends={t.ends} strategy={strategy} />
              ))}
            </div>
          )}
        </>
      )}

      <details className="rounded-xl border border-rule bg-white text-sm">
        <summary className="cursor-pointer px-4 py-3 font-medium">Show the data as a table</summary>
        <div className="overflow-x-auto border-t border-rule">
          <table className="w-full min-w-[32rem] text-left">
            <thead className="bg-mist/60">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">28 days to</th>
                {t.metrics.map((m) => (
                  <th key={m.key} scope="col" className="px-3 py-2 font-medium">{m.key}</th>
                ))}
                <th scope="col" className="px-3 py-2 font-medium">Core Web Vitals</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {t.ends.map((d, i) => (
                <tr key={d}>
                  <td className="px-3 py-1.5">{longDate(d)}</td>
                  {t.metrics.map((m) => (
                    <td key={m.key} className="px-3 py-1.5">{m.p75[i] === null ? "–" : formatMetric(m.key, m.p75[i]!, strategy)}</td>
                  ))}
                  <td className="px-3 py-1.5">{t.cwv[i] === null ? "–" : t.cwv[i] ? "Passed" : "Failed"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {t.notes.map((n) => (
        <p key={n} className="text-sm text-ink-soft">{n}</p>
      ))}
    </div>
  );
}
