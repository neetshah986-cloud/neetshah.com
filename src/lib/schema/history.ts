// "Did my fix work?" for structured data: earlier checks of a page are kept in the visitor's browser.
import type { Report, RichResultStatus } from "./types";

export type SchemaSnapshot = {
  at: string;
  url: string;
  errors: number;
  warnings: number;
  items: number;
  issues: { key: string; severity: string; message: string }[];
  rich: Record<string, RichResultStatus>;
};

const KEY = "ns-schema-history-v1";

const norm = (u: string) => {
  try {
    const x = new URL(u);
    return (x.host.replace(/^www\./, "") + x.pathname.replace(/\/$/, "") + x.search).toLowerCase();
  } catch {
    return u.toLowerCase();
  }
};

const BEST: Record<RichResultStatus, number> = { eligible: 4, warnings: 3, invalid: 2, limited: 1, retired: 0 };

export function snapshot(r: Report): SchemaSnapshot {
  const rich: Record<string, RichResultStatus> = {};
  for (const x of r.richResults) if (!rich[x.feature] || BEST[x.status] > BEST[rich[x.feature]]) rich[x.feature] = x.status;
  return {
    at: new Date().toISOString(),
    url: r.source.finalUrl ?? r.source.url ?? "",
    errors: r.counts.errors,
    warnings: r.counts.warnings,
    items: r.counts.items,
    issues: r.issues.filter((i) => i.severity !== "info").map((i) => ({ key: `${i.code}|${i.prop ?? ""}|${i.message}`, severity: i.severity, message: i.message })),
    rich,
  };
}

function read(): Record<string, SchemaSnapshot[]> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

/** Saves this check and returns the previous one for the same page, if any. */
export function rememberSchema(r: Report): SchemaSnapshot | null {
  const url = r.source.finalUrl ?? r.source.url;
  if (!url) return null;
  const all = read();
  const k = norm(url);
  const list = all[k] ?? [];
  const prev = list[0] ?? null;
  all[k] = [snapshot(r), ...list].slice(0, 6);
  const keys = Object.keys(all).sort((a, b) => (all[b][0]?.at ?? "").localeCompare(all[a][0]?.at ?? ""));
  for (const old of keys.slice(40)) delete all[old];
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage full or blocked */
  }
  return prev;
}

export function forgetSchema(url: string) {
  const all = read();
  delete all[norm(url)];
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export type SchemaChange = {
  since: string;
  fixed: SchemaSnapshot["issues"];
  added: SchemaSnapshot["issues"];
  rich: { feature: string; before?: RichResultStatus; after?: RichResultStatus; better: boolean }[];
  errors: [number, number];
  warnings: [number, number];
  verdict: "better" | "worse" | "same";
};

export function compareSnapshots(prev: SchemaSnapshot, now: SchemaSnapshot): SchemaChange {
  const nowKeys = new Set(now.issues.map((i) => i.key));
  const prevKeys = new Set(prev.issues.map((i) => i.key));
  const fixed = prev.issues.filter((i) => !nowKeys.has(i.key));
  const added = now.issues.filter((i) => !prevKeys.has(i.key));
  const features = new Set([...Object.keys(prev.rich), ...Object.keys(now.rich)]);
  const rich = [...features]
    .filter((f) => prev.rich[f] !== now.rich[f])
    .map((f) => ({ feature: f, before: prev.rich[f], after: now.rich[f], better: (now.rich[f] ? BEST[now.rich[f]] : -1) > (prev.rich[f] ? BEST[prev.rich[f]] : -1) }));
  const score = (s: SchemaSnapshot) => s.errors * 10 + s.warnings;
  const up = rich.filter((r) => r.better).length;
  const down = rich.length - up;
  const delta = score(now) - score(prev);
  const verdict: SchemaChange["verdict"] = delta < 0 || (delta === 0 && up > down) ? "better" : delta > 0 || (delta === 0 && down > up) ? "worse" : "same";
  return { since: prev.at, fixed, added, rich, errors: [prev.errors, now.errors], warnings: [prev.warnings, now.warnings], verdict };
}
