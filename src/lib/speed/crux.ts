// Chrome UX Report History API: about six months of weekly real-visitor data, read for trends.
import { FetchError } from "@/lib/safe-fetch";
import { formatMetric, rate, RATING_LABEL, type MetricKey } from "./metrics";
import type { Strategy, Tone, Trend, TrendMetric } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const ENDPOINT = "https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord";
const NAMES: Record<TrendMetric["key"], string> = {
  LCP: "largest_contentful_paint",
  INP: "interaction_to_next_paint",
  CLS: "cumulative_layout_shift",
  FCP: "first_contentful_paint",
  TTFB: "experimental_time_to_first_byte",
};
/** The smallest week-to-week change worth pointing out. */
const STEP: Record<TrendMetric["key"], number> = { LCP: 250, INP: 40, CLS: 0.03, FCP: 250, TTFB: 150 };
const PERIODS = 25;

async function query(body: object, key: string) {
  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

export async function fetchTrend(url: string, strategy: Strategy): Promise<Trend | null> {
  const key = process.env.PSI_API_KEY;
  if (!key) throw new FetchError("The trend needs a Google API key on the server.", 503);
  const formFactor = strategy === "mobile" ? "PHONE" : "DESKTOP";
  const metrics = Object.values(NAMES);
  let scope: Trend["scope"] = "url";
  let r = await query({ url, formFactor, metrics, collectionPeriodCount: PERIODS }, key);
  if (r.status === 404) {
    scope = "origin";
    r = await query({ origin: new URL(url).origin, formFactor, metrics, collectionPeriodCount: PERIODS }, key);
  }
  if (r.status === 404) return null;
  if (r.status === 403) throw new FetchError("The Chrome UX Report API isn't enabled for this site's Google API key yet.", 503);
  if (r.status === 429) throw new FetchError("Google's data service is busy. Try again in a minute.", 429);
  if (r.status !== 200 || !r.json?.record) throw new FetchError("Couldn't load the real-visitor history.", 502);
  return analyseTrend(r.json.record, scope, formFactor, strategy);
}

const num = (v: any): number | null => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

export function fmtDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function analyseTrend(record: any, scope: Trend["scope"], formFactor: Trend["formFactor"], strategy: Strategy): Trend {
  const ends: string[] = (record.collectionPeriods ?? []).map((p: any) => {
    const d = p.lastDate;
    return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
  });
  const n = ends.length;
  const metrics: TrendMetric[] = [];
  for (const [k, name] of Object.entries(NAMES) as [TrendMetric["key"], string][]) {
    const m = record.metrics?.[name];
    if (!m) continue;
    const p75: (number | null)[] = (m.percentilesTimeseries?.p75s ?? []).map(num);
    const good: (number | null)[] = (m.histogramTimeseries?.[0]?.densities ?? []).map(num);
    while (p75.length < n) p75.unshift(null);
    while (good.length < n) good.unshift(null);
    if (p75.every((v) => v === null)) continue;
    metrics.push({ key: k, p75, good, insights: readMetric(k, p75, ends, strategy) });
  }

  const get = (k: MetricKey) => metrics.find((m) => m.key === k)?.p75 ?? [];
  const lcp = get("LCP");
  const cls = get("CLS");
  const inp = get("INP");
  const cwv: (boolean | null)[] = ends.map((_, i) => {
    if (lcp[i] == null || cls[i] == null) return null;
    return rate("LCP", lcp[i]!) === "good" && rate("CLS", cls[i]!) === "good" && (inp[i] == null || rate("INP", inp[i]!) === "good");
  });

  return { scope, formFactor, ends, metrics, cwv, headline: headline(metrics, cwv, strategy), notes: notes(scope) };
}

function readMetric(k: TrendMetric["key"], p75: (number | null)[], ends: string[], strategy: Strategy): { tone: Tone; text: string }[] {
  const pts = p75.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (pts.length < 2) return [];
  const out: { tone: Tone; text: string }[] = [];
  const first = pts[0];
  const last = pts[pts.length - 1];
  const f = (v: number) => formatMetric(k, v, strategy);
  const nowRating = rate(k, last.v, strategy);
  const change = last.v - first.v;
  const rel = first.v ? change / first.v : 0;

  // Overall direction.
  if (Math.abs(change) < STEP[k] / 2) out.push({ tone: nowRating === "good" ? "good" : "ni", text: `Steady at about ${f(last.v)} since ${fmtDate(ends[first.i])}.` });
  else
    out.push({
      tone: change < 0 ? "good" : "poor",
      text: `${change < 0 ? "Improved" : "Got worse"} from ${f(first.v)} to ${f(last.v)} (${change < 0 ? "−" : "+"}${Math.abs(Math.round(rel * 100))}%) since ${fmtDate(ends[first.i])}.`,
    });

  // When it last changed band.
  let since = pts.length - 1;
  while (since > 0 && rate(k, pts[since - 1].v, strategy) === nowRating) since--;
  if (since > 0) {
    const prev = rate(k, pts[since - 1].v, strategy);
    out.push({
      tone: nowRating === "good" ? "good" : nowRating === "poor" || (prev === "good" && nowRating === "ni") ? "poor" : "ni",
      text: `Moved from ${RATING_LABEL[prev].toLowerCase()} to ${RATING_LABEL[nowRating].toLowerCase()} in the window ending ${fmtDate(ends[pts[since].i])}, and has stayed there for ${pts.length - since} week${pts.length - since > 1 ? "s" : ""}.`,
    });
  } else out.push({ tone: nowRating === "good" ? "good" : nowRating === "ni" ? "ni" : "poor", text: `${RATING_LABEL[nowRating]} for the whole period.` });

  // Biggest single-week jump: usually a release, plugin or tag.
  let jump = { d: 0, at: -1 };
  for (let j = 1; j < pts.length; j++) {
    const d = pts[j].v - pts[j - 1].v;
    if (Math.abs(d) > Math.abs(jump.d)) jump = { d, at: j };
  }
  if (jump.at > 0 && Math.abs(jump.d) >= STEP[k]) {
    const end = ends[pts[jump.at].i];
    const start = new Date(new Date(`${end}T00:00:00Z`).getTime() - 34 * 86400000).toISOString().slice(0, 10);
    out.push({
      tone: jump.d > 0 ? "poor" : "good",
      text: `Biggest single change: ${jump.d > 0 ? "+" : "−"}${f(Math.abs(jump.d))} in the window ending ${fmtDate(end)}. Something changed between about ${fmtDate(start)} and ${fmtDate(end)}: check releases, plugin updates, new tags or campaigns from then.`,
    });
  }

  // Run of consecutive worsening or improving weeks.
  let run = 0;
  for (let j = pts.length - 1; j > 0 && pts[j].v > pts[j - 1].v; j--) run++;
  if (run >= 4 && last.v - pts[pts.length - 1 - run].v >= STEP[k] / 2) out.push({ tone: "poor", text: `Has got worse ${run} weeks in a row. A slow, steady rise usually means the page is gradually getting heavier: more products, images, scripts or tags.` });
  run = 0;
  for (let j = pts.length - 1; j > 0 && pts[j].v < pts[j - 1].v; j--) run++;
  if (run >= 4 && pts[pts.length - 1 - run].v - last.v >= STEP[k] / 2) out.push({ tone: "good", text: `Has improved ${run} weeks in a row.` });

  // Close to a threshold.
  const good = k === "CLS" ? 0.1 : ({ LCP: 2500, INP: 200, FCP: 1800, TTFB: 800 } as const)[k];
  if (nowRating === "ni" && last.v - good <= good * 0.12)
    out.push({ tone: "ni", text: `Only ${f(last.v - good)} above the good threshold (${k === "CLS" ? good : f(good)}). A small fix could tip it into good.` });
  if (nowRating === "good" && good - last.v <= good * 0.08)
    out.push({ tone: "ni", text: `Good, but only ${f(good - last.v)} inside the threshold. A small regression would push it out.` });
  return out;
}

function headline(metrics: TrendMetric[], cwv: (boolean | null)[], strategy: Strategy): { tone: Tone; text: string } {
  const known = cwv.filter((v) => v !== null);
  const passes = known.filter(Boolean).length;
  const latest = [...cwv].reverse().find((v) => v !== null);
  const worse: string[] = [];
  const better: string[] = [];
  for (const m of metrics.filter((x) => ["LCP", "INP", "CLS"].includes(x.key))) {
    const v = m.p75.filter((x): x is number => x !== null);
    if (v.length < 4) continue;
    const recent = v.slice(-4).reduce((a, b) => a + b, 0) / 4;
    const earlier = v.slice(0, 4).reduce((a, b) => a + b, 0) / 4;
    if (recent > earlier * 1.08 && recent - earlier >= STEP[m.key] / 2) worse.push(m.key);
    else if (recent < earlier * 0.92 && earlier - recent >= STEP[m.key] / 2) better.push(m.key);
  }
  void strategy;
  const parts: string[] = [];
  if (known.length) parts.push(`Passed Core Web Vitals in ${passes} of the last ${known.length} weeks${latest === false ? ", and is failing now" : latest ? ", and is passing now" : ""}.`);
  if (worse.length) parts.push(`${worse.join(" and ")} ${worse.length > 1 ? "are" : "is"} getting worse.`);
  if (better.length) parts.push(`${better.join(" and ")} ${better.length > 1 ? "have" : "has"} improved.`);
  if (!worse.length && !better.length) parts.push("The Core Web Vitals have been broadly stable.");
  const tone: Tone = latest === false ? "poor" : worse.length ? "ni" : "good";
  return { tone, text: parts.join(" ") };
}

function notes(scope: Trend["scope"]): string[] {
  return [
    "Each point is the 75th percentile of real Chrome visits in the 28 days ending that date, updated weekly. A change you ship today appears gradually and shows in full about 4 weeks later.",
    ...(scope === "origin" ? ["This URL doesn't have enough visits for its own history, so this is the whole site."] : []),
  ];
}
