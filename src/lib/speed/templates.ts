// Sums up several test runs of pages that share a template (or a Search Console URL group).
import { formatMetric, rate, type MetricKey, type Rating } from "./metrics";
import type { Finding, SpeedRun } from "./types";

export type CommonFix = { auditId: string; title: string; impact: Finding["impact"]; weight: number; seenIn: number; example: Finding };

export type TemplateSummary = {
  runs: SpeedRun[];
  score: number;
  lab: Partial<Record<MetricKey, { value: number; display: string; rating: Rating }>>;
  /** Real-visitor Core Web Vitals across the samples: true only if every sample with data passed. */
  cwv: boolean | null;
  fieldScope: "url" | "origin" | null;
  worst?: { key: MetricKey; display: string; rating: Rating; cause?: string };
  common: CommonFix[];
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const ORDER: MetricKey[] = ["LCP", "TBT", "CLS", "FCP", "SI", "TTFB"];

export function summarise(runs: SpeedRun[]): TemplateSummary | null {
  if (!runs.length) return null;
  const strategy = runs[0].strategy;
  const lab: TemplateSummary["lab"] = {};
  for (const k of ORDER) {
    const vals = runs.map((r) => r.lab[k]?.value).filter((v): v is number => typeof v === "number");
    if (!vals.length) continue;
    const v = median(vals);
    lab[k] = { value: v, display: formatMetric(k, v, strategy), rating: rate(k, v, strategy) };
  }
  const fields = runs.map((r) => r.field ?? r.originField).filter(Boolean);
  const verdicts = fields.map((f) => f!.passed).filter((p): p is boolean => p !== null);
  const cwv = verdicts.length ? verdicts.every(Boolean) : null;
  const fieldScope = runs.some((r) => r.field?.scope === "url") ? "url" : fields.length ? "origin" : null;

  // The worst lab metric (poor before needs improvement), with the cause from a sample.
  const rank = (r: Rating) => (r === "poor" ? 2 : r === "ni" ? 1 : 0);
  let worst: TemplateSummary["worst"];
  for (const k of ["LCP", "TBT", "CLS", "FCP", "TTFB"] as MetricKey[]) {
    const m = lab[k];
    if (!m || m.rating === "good") continue;
    if (!worst || rank(m.rating) > rank(worst.rating)) {
      const cause = runs.map((r) => r.diagnoses.find((d) => d.metric === k)?.headline).find(Boolean);
      worst = { key: k, display: m.display, rating: m.rating, cause };
    }
  }

  // Fixes found on most samples: those are template problems, fixed once for every page of this type.
  const need = runs.length <= 2 ? runs.length : Math.ceil(runs.length * 0.6);
  const byAudit = new Map<string, Finding[]>();
  const runsWith = new Map<string, number>();
  for (const r of runs) {
    for (const f of r.findings) byAudit.set(f.auditId, [...(byAudit.get(f.auditId) ?? []), f]);
    for (const id of new Set(r.findings.map((f) => f.auditId))) runsWith.set(id, (runsWith.get(id) ?? 0) + 1);
  }
  const common: CommonFix[] = [...byAudit.entries()]
    .filter(([id]) => (runsWith.get(id) ?? 0) >= need)
    .map(([auditId, fs]) => {
      const best = fs.reduce((a, b) => (b.weight > a.weight ? b : a));
      return { auditId, title: best.title, impact: best.impact, weight: Math.max(...fs.map((f) => f.weight)), seenIn: runsWith.get(auditId) ?? 0, example: best };
    })
    .sort((a, b) => b.weight - a.weight);

  return { runs, score: Math.round(median(runs.map((r) => r.score))), lab, cwv, fieldScope, worst, common };
}
