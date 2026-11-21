// Real-visitor history (CrUX) fetched once per page and device, and kept for the visit.
import type { Strategy, Trend } from "./types";

export type TrendState = { loading: boolean; trend?: Trend | null; error?: string };

// The trend is fetched in the background as soon as a test finishes, and kept
// for the rest of the visit, so opening the tab shows it straight away.
export const trendCache = new Map<string, { done?: TrendState; promise: Promise<TrendState> }>();

export function prefetchTrend(url: string, strategy: Strategy): Promise<TrendState> {
  const key = `${strategy}|${url}`;
  const hit = trendCache.get(key);
  if (hit) return hit.promise;
  const entry: { done?: TrendState; promise: Promise<TrendState> } = { promise: Promise.resolve({ loading: true }) };
  entry.promise = fetch("/api/page-speed/trend", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, strategy }) })
    .then(async (r) => {
      const d = await r.json().catch(() => ({}));
      return r.ok ? { loading: false, trend: d.trend ?? null } : { loading: false, error: d.error ?? "Couldn't load the history." };
    })
    .catch(() => ({ loading: false, error: "Couldn't load the history." }))
    .then((st: TrendState) => {
      if (st.error) trendCache.delete(key);
      else entry.done = st;
      return st;
    });
  trendCache.set(key, entry);
  return entry.promise;
}

