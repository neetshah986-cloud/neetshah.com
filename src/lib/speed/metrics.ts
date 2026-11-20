// Metric definitions and Google's thresholds (web.dev/articles/vitals, Lighthouse scoring).
export type MetricKey = "LCP" | "INP" | "CLS" | "FCP" | "TTFB" | "TBT" | "SI";
export type Rating = "good" | "ni" | "poor";

export type MetricDef = {
  key: MetricKey;
  name: string;
  short: string;
  unit: "ms" | "score";
  good: number;
  poor: number;
  /** One line a beginner can understand. */
  plain: string;
  core: boolean;
};

export const METRICS: Record<MetricKey, MetricDef> = {
  LCP: {
    key: "LCP",
    name: "Largest Contentful Paint",
    short: "LCP",
    unit: "ms",
    good: 2500,
    poor: 4000,
    plain: "How long until the biggest thing on screen, usually the main image or headline, appears.",
    core: true,
  },
  INP: {
    key: "INP",
    name: "Interaction to Next Paint",
    short: "INP",
    unit: "ms",
    good: 200,
    poor: 500,
    plain: "How quickly the page reacts when someone taps, clicks or types.",
    core: true,
  },
  CLS: {
    key: "CLS",
    name: "Cumulative Layout Shift",
    short: "CLS",
    unit: "score",
    good: 0.1,
    poor: 0.25,
    plain: "How much the layout jumps around while the page loads.",
    core: true,
  },
  FCP: {
    key: "FCP",
    name: "First Contentful Paint",
    short: "FCP",
    unit: "ms",
    good: 1800,
    poor: 3000,
    plain: "How long until anything at all appears on the screen.",
    core: false,
  },
  TTFB: {
    key: "TTFB",
    name: "Time to First Byte",
    short: "TTFB",
    unit: "ms",
    good: 800,
    poor: 1800,
    plain: "How long the server takes to start sending the page.",
    core: false,
  },
  TBT: {
    key: "TBT",
    name: "Total Blocking Time",
    short: "TBT",
    unit: "ms",
    good: 200,
    poor: 600,
    plain: "How long JavaScript keeps the page too busy to respond. The lab stand-in for INP.",
    core: false,
  },
  SI: {
    key: "SI",
    name: "Speed Index",
    short: "SI",
    unit: "ms",
    good: 3400,
    poor: 5800,
    plain: "How quickly the visible part of the page fills in.",
    core: false,
  },
};

/** Speed Index thresholds are stricter on desktop in Lighthouse's scoring. */
export function thresholds(key: MetricKey, strategy: "mobile" | "desktop" = "mobile") {
  const d = METRICS[key];
  if (key === "SI" && strategy === "desktop") return { good: 1300, poor: 2300 };
  if (key === "TBT" && strategy === "desktop") return { good: 150, poor: 350 };
  if (key === "FCP" && strategy === "desktop") return { good: 1800, poor: 3000 };
  return { good: d.good, poor: d.poor };
}

export function rate(key: MetricKey, value: number, strategy: "mobile" | "desktop" = "mobile"): Rating {
  const t = thresholds(key, strategy);
  if (value <= t.good) return "good";
  if (value <= t.poor) return "ni";
  return "poor";
}

export const RATING_LABEL: Record<Rating, string> = { good: "Good", ni: "Needs improvement", poor: "Poor" };

export function formatMs(ms: number, decimals = 1): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(decimals)} s`;
}

/** Formats a metric so the shown number never seems to contradict its rating (2,512 ms shows as 2.51 s, not 2.5 s). */
export function formatMetric(key: MetricKey, value: number, strategy: "mobile" | "desktop" = "mobile"): string {
  const t = thresholds(key, strategy);
  const r = rate(key, value, strategy);
  if (METRICS[key].unit === "score") {
    let s = value.toFixed(2);
    if (rate(key, Number(s), strategy) !== r) s = value.toFixed(3);
    return s;
  }
  let s = formatMs(value);
  const back = (v: string) => (v.endsWith(" ms") ? parseFloat(v) : parseFloat(v) * 1000);
  if (rate(key, back(s), strategy) !== r) s = formatMs(value, 2);
  void t;
  return s;
}

export function formatThreshold(key: MetricKey, v: number): string {
  if (METRICS[key].unit === "score") return String(v);
  return v < 1000 ? `${v} ms` : `${v / 1000} s`;
}

export function formatBytes(b: number): string {
  if (b < 1024) return `${Math.round(b)} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024).toLocaleString("en-US")} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
