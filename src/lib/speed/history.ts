// "Did my fix work?": earlier results are kept in the visitor's own browser (never on the server)
// and compared with the new test.
import { formatMetric, type MetricKey } from "./metrics";
import type { Impact, SpeedRun, Strategy } from "./types";

export type Snapshot = {
  at: string;
  url: string;
  strategy: Strategy;
  score: number;
  lab: Partial<Record<MetricKey, number>>;
  cwv: boolean | null;
  findings: { auditId: string; title: string; impact: Impact }[];
  thirdPartyMs?: number;
  bytes?: number;
};

const KEY = "ns-speed-history-v1";
const PER_PAGE = 8;
const PAGES = 40;

function norm(url: string) {
  try {
    const u = new URL(url);
    u.hash = "";
    return (u.host.replace(/^www\./, "") + u.pathname.replace(/\/$/, "") + u.search).toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

const keyOf = (url: string, strategy: Strategy) => `${strategy}|${norm(url)}`;

function readAll(): Record<string, Snapshot[]> {
  try {
    const raw = window.localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function snapshotOf(run: SpeedRun): Snapshot {
  return {
    at: run.fetchedAt,
    url: run.finalUrl,
    strategy: run.strategy,
    score: run.score,
    lab: Object.fromEntries(Object.entries(run.lab).map(([k, v]) => [k, v!.value])),
    cwv: run.field?.passed ?? run.originField?.passed ?? null,
    findings: run.findings.map((f) => ({ auditId: f.auditId, title: f.title, impact: f.impact })),
    thirdPartyMs: run.thirdParty?.blockingMs,
    bytes: run.facts?.bytes.total,
  };
}

/** Earlier tests of this page on this device, newest first (not including this run). */
export function history(run: SpeedRun): Snapshot[] {
  const all = readAll();
  const list = all[keyOf(run.finalUrl, run.strategy)] ?? all[keyOf(run.requestedUrl, run.strategy)] ?? [];
  return list.filter((s) => s.at !== run.fetchedAt).sort((a, b) => b.at.localeCompare(a.at));
}

/** Stores this run. Returns the earlier tests, so the caller can compare before the list changes. */
export function remember(run: SpeedRun): Snapshot[] {
  const before = history(run);
  try {
    const all = readAll();
    const k = keyOf(run.finalUrl, run.strategy);
    const list = (all[k] ?? []).filter((s) => s.at !== run.fetchedAt);
    list.push(snapshotOf(run));
    list.sort((a, b) => b.at.localeCompare(a.at));
    all[k] = list.slice(0, PER_PAGE);
    // Keep the most recently tested pages only.
    const keys = Object.keys(all).sort((a, b) => (all[b][0]?.at ?? "").localeCompare(all[a][0]?.at ?? ""));
    for (const old of keys.slice(PAGES)) delete all[old];
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage full or blocked: the check simply isn't available */
  }
  return before;
}

export function forget(run: SpeedRun) {
  try {
    const all = readAll();
    delete all[keyOf(run.finalUrl, run.strategy)];
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export type Change = "better" | "worse" | "same";

export type MetricChange = { key: MetricKey; label: string; before: string; after: string; change: Change; delta: string };

export type FixCheck = {
  since: string;
  scoreBefore: number;
  scoreAfter: number;
  scoreChange: Change;
  verdict: Change;
  headline: string;
  metrics: MetricChange[];
  resolved: Snapshot["findings"];
  added: Snapshot["findings"];
  open: Snapshot["findings"];
  scores: { at: string; score: number }[];
};

// Lab results vary between runs. Smaller changes than these are treated as noise.
const NOISE: Partial<Record<MetricKey, { abs: number; rel: number }>> = {
  LCP: { abs: 250, rel: 0.1 },
  FCP: { abs: 200, rel: 0.1 },
  SI: { abs: 300, rel: 0.1 },
  TBT: { abs: 60, rel: 0.15 },
  CLS: { abs: 0.02, rel: 0.15 },
  TTFB: { abs: 120, rel: 0.15 },
};
const LABELS: Partial<Record<MetricKey, string>> = { LCP: "LCP", FCP: "FCP", TBT: "TBT", CLS: "CLS", SI: "Speed Index", TTFB: "TTFB" };

export function checkFix(prev: Snapshot, run: SpeedRun, earlier: Snapshot[]): FixCheck {
  const metrics: MetricChange[] = [];
  for (const k of ["LCP", "TBT", "CLS", "FCP", "SI", "TTFB"] as MetricKey[]) {
    const a = prev.lab[k];
    const b = run.lab[k]?.value;
    if (a === undefined || b === undefined) continue;
    const n = NOISE[k]!;
    const d = b - a;
    const change: Change = Math.abs(d) < Math.max(n.abs, Math.abs(a) * n.rel) ? "same" : d < 0 ? "better" : "worse";
    const fmt = (v: number) => formatMetric(k, v, run.strategy);
    metrics.push({ key: k, label: LABELS[k] ?? k, before: fmt(a), after: fmt(b), change, delta: k === "CLS" ? `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(2)}` : `${d > 0 ? "+" : "−"}${fmt(Math.abs(d))}` });
  }
  const now = run.findings.map((f) => ({ auditId: f.auditId, title: f.title, impact: f.impact }));
  const nowIds = new Set(now.map((f) => f.auditId));
  const prevIds = new Set(prev.findings.map((f) => f.auditId));
  const resolved = prev.findings.filter((f) => !nowIds.has(f.auditId));
  const added = now.filter((f) => !prevIds.has(f.auditId));
  const open = now.filter((f) => prevIds.has(f.auditId));
  const ds = run.score - prev.score;
  const scoreChange: Change = Math.abs(ds) < 5 ? "same" : ds > 0 ? "better" : "worse";
  const better = metrics.filter((m) => m.change === "better").length;
  const worse = metrics.filter((m) => m.change === "worse").length;
  const verdict: Change = scoreChange !== "same" ? scoreChange : better > worse ? "better" : worse > better ? "worse" : "same";
  const improved = metrics.filter((m) => m.change === "better").map((m) => m.label);
  const regressed = metrics.filter((m) => m.change === "worse").map((m) => m.label);
  const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0]);
  let headline: string;
  if (verdict === "better") headline = `It worked: the score went from ${prev.score} to ${run.score}${improved.length ? `, and ${list(improved)} improved` : ""}.`;
  else if (verdict === "worse") headline = `It got worse: the score went from ${prev.score} to ${run.score}${regressed.length ? `, and ${list(regressed)} slowed down` : ""}.`;
  else headline = `No clear change yet: ${prev.score} before, ${run.score} now. Differences this small are normal between runs.`;
  if (resolved.length && verdict !== "worse") headline += ` ${resolved.length} issue${resolved.length > 1 ? "s are" : " is"} now fixed.`;
  return {
    since: prev.at,
    scoreBefore: prev.score,
    scoreAfter: run.score,
    scoreChange,
    verdict,
    headline,
    metrics,
    resolved,
    added,
    open,
    scores: [...earlier].reverse().map((s) => ({ at: s.at, score: s.score })).concat({ at: run.fetchedAt, score: run.score }),
  };
}
