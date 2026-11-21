// Lighthouse's performance score, reproduced from Lighthouse's own source (shared/statistics.js,
// core/audits/metrics/*.js, core/config/default-config.js). Valid for Lighthouse 10 to 13.

export type ScoreMetric = "FCP" | "SI" | "LCP" | "TBT" | "CLS";
export type Device = "mobile" | "desktop";

export const SCORE_METRICS: ScoreMetric[] = ["FCP", "SI", "LCP", "TBT", "CLS"];

export const WEIGHTS: Record<ScoreMetric, number> = { FCP: 0.1, SI: 0.1, LCP: 0.25, TBT: 0.3, CLS: 0.25 };

/** Lighthouse's control points: the value that scores 0.9 (p10) and the one that scores 0.5 (median). */
export const CURVES: Record<Device, Record<ScoreMetric, { p10: number; median: number }>> = {
  mobile: {
    FCP: { p10: 1800, median: 3000 },
    SI: { p10: 3387, median: 5800 },
    LCP: { p10: 2500, median: 4000 },
    TBT: { p10: 200, median: 600 },
    CLS: { p10: 0.1, median: 0.25 },
  },
  desktop: {
    FCP: { p10: 934, median: 1600 },
    SI: { p10: 1311, median: 2300 },
    LCP: { p10: 1200, median: 2400 },
    TBT: { p10: 150, median: 350 },
    CLS: { p10: 0.1, median: 0.25 },
  },
};

function erf(x: number) {
  const sign = Math.sign(x);
  x = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))));
  return sign * (1 - y * Math.exp(-x * x));
}

/** Score 0 to 1 for one metric value, exactly as Lighthouse computes it. */
export function metricScore(device: Device, m: ScoreMetric, value: number): number {
  const { p10, median } = CURVES[device][m];
  if (value <= 0) return 1;
  const xLogRatio = Math.log(Math.max(Number.MIN_VALUE, value / median));
  const p10LogRatio = -Math.log(Math.max(Number.MIN_VALUE, p10 / median));
  const standardized = (xLogRatio * 0.9061938024368232) / p10LogRatio;
  const cp = (1 - erf(standardized)) / 2;
  let s: number;
  if (value <= p10) s = Math.max(0.9, Math.min(1, cp));
  else if (value <= median) s = Math.max(0.5, Math.min(0.8999999999999999, cp));
  else s = Math.max(0, Math.min(0.49999999999999994, cp));
  // Lighthouse's shared/util.js: a small boost above 0.9, then floor to two decimals.
  if (s > 0.9) s += 0.05 * (s - 0.9);
  return Math.floor(s * 100) / 100;
}

export function perfScore(device: Device, values: Record<ScoreMetric, number>) {
  const scores = Object.fromEntries(SCORE_METRICS.map((m) => [m, metricScore(device, m, values[m])])) as Record<ScoreMetric, number>;
  const total = SCORE_METRICS.reduce((s, m) => s + scores[m] * WEIGHTS[m], 0);
  return { scores, total: Math.round(total * 100) };
}

/** The metric value that gives a target score (for "what do I need to reach 90?"). Found by bisection on the curve. */
export function valueForScore(device: Device, m: ScoreMetric, target: number): number {
  const max = m === "CLS" ? 2 : 60000;
  let lo = 0;
  let hi = max;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (metricScore(device, m, mid) >= target) lo = mid;
    else hi = mid;
  }
  return lo;
}

export type ScorePlanStep = { metric: ScoreMetric; from: number; to: number; gain: number };

export type ScoreAdvice = {
  /** Points each metric could still add if it scored 100, biggest first. */
  headroom: { metric: ScoreMetric; points: number; score: number }[];
  /** Smallest set of changes (greedy, metric by metric) that reaches the target. */
  plan: ScorePlanStep[];
  reachable: boolean;
  target: number;
  total: number;
};

/** Works out where the points are and the shortest route to a target score. */
export function scoreAdvice(device: Device, values: Record<ScoreMetric, number>, target = 90): ScoreAdvice {
  const { scores, total } = perfScore(device, values);
  const headroom = SCORE_METRICS.map((m) => ({ metric: m, points: Math.round((1 - scores[m]) * WEIGHTS[m] * 1000) / 10, score: scores[m] })).sort((a, b) => b.points - a.points);
  const plan: ScorePlanStep[] = [];
  if (total >= target) return { headroom, plan, reachable: true, target, total };

  const cur = { ...values };
  // Improve the metric with the most headroom up to its "good" point (score 0.9), one at a time,
  // then trim the last step to the smallest change that still reaches the target.
  const order = [...headroom].filter((h) => h.score < 0.9).map((h) => h.metric);
  for (const m of order) {
    const before = perfScore(device, cur).total;
    const goodValue = valueForScore(device, m, 0.9);
    const trial = { ...cur, [m]: goodValue };
    if (perfScore(device, trial).total >= target) {
      // Find the largest value of m (smallest change) that still reaches the target.
      let lo = goodValue;
      let hi = cur[m];
      for (let k = 0; k < 50; k++) {
        const mid = (lo + hi) / 2;
        if (perfScore(device, { ...cur, [m]: mid }).total >= target) lo = mid;
        else hi = mid;
      }
      const to = m === "CLS" ? Math.floor(lo * 100) / 100 : Math.floor(lo / 10) * 10;
      cur[m] = to;
      plan.push({ metric: m, from: values[m], to, gain: perfScore(device, cur).total - before });
      return { headroom, plan, reachable: true, target, total };
    }
    cur[m] = m === "CLS" ? Math.floor(goodValue * 100) / 100 : Math.floor(goodValue / 10) * 10;
    plan.push({ metric: m, from: values[m], to: cur[m], gain: perfScore(device, cur).total - before });
  }
  // Still short: everything is at "good" already. Push the biggest remaining weights further.
  for (const m of [...SCORE_METRICS].sort((a, b) => WEIGHTS[b] - WEIGHTS[a])) {
    const before = perfScore(device, cur).total;
    const best = valueForScore(device, m, 1);
    const to = m === "CLS" ? Math.floor(best * 100) / 100 : Math.floor(best / 10) * 10;
    if (to >= cur[m]) continue;
    cur[m] = to;
    const existing = plan.find((p) => p.metric === m);
    if (existing) {
      existing.to = to;
      existing.gain += perfScore(device, cur).total - before;
    } else plan.push({ metric: m, from: values[m], to, gain: perfScore(device, cur).total - before });
    if (perfScore(device, cur).total >= target) return { headroom, plan, reachable: true, target, total };
  }
  return { headroom, plan, reachable: perfScore(device, cur).total >= target, target, total };
}
