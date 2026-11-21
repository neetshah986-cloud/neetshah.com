// Ranks several pages (yours and competitors') by speed, the way Google judges it.
import { compareRuns, hostOf, type Reason } from "./compare";
import type { MetricKey } from "./metrics";
import type { SpeedRun } from "./types";

export type Entrant = { url: string; you: boolean; run?: SpeedRun; error?: string; loading?: boolean };

export type Ranked = Entrant & { run: SpeedRun; rank: number; cwv: boolean | null; weakness?: { metric: MetricKey; value: string; text: string } };

export type Board = {
  ranked: Ranked[];
  you?: Ranked;
  leader?: Ranked;
  headline: string;
  /** Why you're behind the leader (or ahead of the runner-up when you lead). */
  reasons: Reason[];
  against?: Ranked;
};

const cwvOf = (r: SpeedRun) => r.field?.passed ?? r.originField?.passed ?? null;

/** The metric holding the page back most, with its root cause. */
export function weakness(r: SpeedRun): Ranked["weakness"] {
  const order: MetricKey[] = ["LCP", "INP", "CLS", "TBT", "FCP", "TTFB"];
  const pick = (rating: "poor" | "ni") => order.map((k) => r.diagnoses.find((d) => d.metric === k && d.rating === rating)).find(Boolean);
  const d = pick("poor") ?? pick("ni");
  if (!d) return undefined;
  return { metric: d.metric, value: d.value, text: d.headline };
}

// Google uses real-visitor Core Web Vitals in Search, so pages that pass come first; the lab score breaks ties.
const cwvRank = (v: boolean | null) => (v === true ? 0 : v === null ? 1 : 2);

export function rankBoard(entrants: Entrant[]): Board {
  const done = entrants.filter((e): e is Entrant & { run: SpeedRun } => !!e.run);
  const ranked: Ranked[] = done
    .map((e) => ({ ...e, cwv: cwvOf(e.run), rank: 0, weakness: weakness(e.run) }))
    .sort((a, b) => cwvRank(a.cwv) - cwvRank(b.cwv) || b.run.score - a.run.score || (a.run.lab.LCP?.value ?? 1e9) - (b.run.lab.LCP?.value ?? 1e9));
  ranked.forEach((r, i) => (r.rank = i + 1));
  const you = ranked.find((r) => r.you);
  const leader = ranked[0];
  let headline = "";
  let reasons: Reason[] = [];
  let against: Ranked | undefined;
  if (you && leader && ranked.length > 1) {
    if (you === leader) {
      against = ranked[1];
      headline = `Your page is the fastest of ${ranked.length}. The closest is ${hostOf(against.run.finalUrl)} (score ${against.run.score} against your ${you.run.score}).`;
      reasons = compareRuns(you.run, against.run).ahead.slice(0, 3);
    } else {
      against = leader;
      const lcp = you.run.lab.LCP && leader.run.lab.LCP && you.run.lab.LCP.display !== leader.run.lab.LCP.display ? `, main content at ${leader.run.lab.LCP.display} against your ${you.run.lab.LCP.display}` : "";
      const why = leader.cwv === true && you.cwv !== true ? ` and passes Core Web Vitals with real visitors${you.cwv === false ? ", which your page fails" : ""}` : `, with a score of ${leader.run.score} against your ${you.run.score}${lcp}`;
      headline = `Your page ranks ${you.rank} of ${ranked.length} for speed. ${hostOf(leader.run.finalUrl)} leads${why}.`;
      reasons = compareRuns(you.run, leader.run).behind.slice(0, 4);
    }
  } else if (leader) headline = `${hostOf(leader.run.finalUrl)} is the fastest so far.`;
  return { ranked, you, leader, headline, reasons, against };
}

/** The leaderboard as CSV, for spreadsheets and client reports. */
export function boardCsv(board: Board, keyword: string) {
  const esc = (s: string | number | undefined) => {
    const t = s === undefined ? "" : String(s);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const head = ["Rank", "Page", "Yours", "Core Web Vitals (real visitors)", "LCP real", "INP real", "CLS real", "Score", "LCP lab", "TBT lab", "CLS lab", "Page weight (bytes)", "Third-party blocking (ms)", "Main weakness"];
  const rows = board.ranked.map((r) => {
    const f = r.run.field ?? r.run.originField;
    return [
      r.rank,
      r.run.finalUrl,
      r.you ? "yes" : "",
      r.cwv === null ? "no data" : r.cwv ? "passed" : "failed",
      f?.metrics.LCP?.display,
      f?.metrics.INP?.display,
      f?.metrics.CLS?.display,
      r.run.score,
      r.run.lab.LCP?.display,
      r.run.lab.TBT?.display,
      r.run.lab.CLS?.display,
      r.run.facts?.bytes.total,
      r.run.thirdParty?.blockingMs,
      r.weakness ? `${r.weakness.metric} ${r.weakness.value}: ${r.weakness.text}` : "",
    ];
  });
  const title = keyword ? [`Speed leaderboard for "${keyword}" (${board.ranked[0]?.run.strategy ?? ""}), neetshah.com Page Speed Test`] : [];
  return [...(title.length ? [title] : []), head, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}
