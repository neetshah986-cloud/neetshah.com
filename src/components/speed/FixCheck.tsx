"use client";

import { checkFix, type Change, type Snapshot } from "@/lib/speed/history";
import type { SpeedRun } from "@/lib/speed/types";
import { ToneIcon } from "./ui";

const TONE: Record<Change, "good" | "poor" | "ni"> = { better: "good", worse: "poor", same: "ni" };
const CHIP: Record<Change, string> = { better: "bg-pass/10 text-pass", worse: "bg-fail/10 text-fail", same: "bg-mist text-ink-soft" };
const WORD: Record<Change, string> = { better: "Better", worse: "Worse", same: "Same" };

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function ScoreLine({ scores }: { scores: { at: string; score: number }[] }) {
  if (scores.length < 3) return null;
  const w = 220;
  const h = 56;
  const x = (i: number) => 8 + (i / (scores.length - 1)) * (w - 16);
  const y = (s: number) => 8 + (1 - s / 100) * (h - 16);
  return (
    <figure className="shrink-0">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-14 w-[220px]" role="img" aria-label={`Score over the last ${scores.length} tests: ${scores.map((s) => s.score).join(", ")}`}>
        <line x1="8" x2={w - 8} y1={y(90)} y2={y(90)} stroke="#0B8A57" strokeOpacity="0.35" strokeDasharray="3 3" />
        <polyline points={scores.map((s, i) => `${x(i)},${y(s.score)}`).join(" ")} fill="none" stroke="#1A3FD6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {scores.map((s, i) => (
          <circle key={s.at} cx={x(i)} cy={y(s.score)} r={i === scores.length - 1 ? 4.5 : 3} fill={i === scores.length - 1 ? "#1A3FD6" : "#fff"} stroke="#1A3FD6" strokeWidth="2">
            <title>
              {when(s.at)}: {s.score}
            </title>
          </circle>
        ))}
      </svg>
      <figcaption className="text-right text-xs text-ink-soft">Last {scores.length} tests (dashed line: 90)</figcaption>
    </figure>
  );
}

export function FixCheckCard({ run, earlier, onRetest, onForget }: { run: SpeedRun; earlier: Snapshot[]; onRetest: () => void; onForget: () => void }) {
  if (!earlier.length)
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-dashed border-rule bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[0.95rem] leading-relaxed text-ink-soft">
          <span className="font-medium text-ink">Did a fix work?</span> After your developer changes something, click Test again. This report will show what improved, what got worse and which issues are now fixed. Results are saved only in this browser.
        </p>
        <button type="button" onClick={onRetest} className="shrink-0 rounded-md border border-ink bg-white px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-ink hover:text-paper">
          Test again
        </button>
      </div>
    );

  const c = checkFix(earlier[0], run, earlier.slice(0, 7));
  const border = c.verdict === "better" ? "border-pass/40" : c.verdict === "worse" ? "border-fail/40" : "border-rule";
  return (
    <section aria-label="Did my fix work?" className={`rounded-2xl border-2 ${border} bg-white p-5 sm:p-6`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <ToneIcon tone={TONE[c.verdict]} className="mt-1 h-6 w-6" />
          <div className="min-w-0">
            <p className="text-sm text-ink-soft">Did my fix work? Compared with your test on {when(c.since)}</p>
            <p className="mt-1 text-xl font-semibold leading-snug tracking-tight">{c.headline}</p>
          </div>
        </div>
        <ScoreLine scores={c.scores} />
      </div>

      <ul className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <li className="flex items-center justify-between gap-3 rounded-lg bg-mist/60 px-3.5 py-2.5">
          <span className="font-medium">Score</span>
          <span className="flex items-center gap-2 whitespace-nowrap text-sm">
            <span className="text-ink-soft">{c.scoreBefore}</span>
            <span aria-hidden className="text-ink-soft">→</span>
            <span className="font-semibold">{c.scoreAfter}</span>
            <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${CHIP[c.scoreChange]}`}>{c.scoreChange === "same" ? WORD.same : `${c.scoreAfter - c.scoreBefore > 0 ? "+" : "−"}${Math.abs(c.scoreAfter - c.scoreBefore)}`}</span>
          </span>
        </li>
        {c.metrics.map((m) => (
          <li key={m.key} className="flex items-center justify-between gap-3 rounded-lg bg-mist/60 px-3.5 py-2.5">
            <span className="font-medium">{m.label}</span>
            <span className="flex items-center gap-2 whitespace-nowrap text-sm">
              <span className="text-ink-soft">{m.before}</span>
              <span aria-hidden className="text-ink-soft">→</span>
              <span className="font-semibold">{m.after}</span>
              <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${CHIP[m.change]}`}>{m.change === "same" ? WORD.same : m.delta}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div>
          <p className="flex items-center gap-2 font-medium">
            <ToneIcon tone="good" /> Fixed since then ({c.resolved.length})
          </p>
          <ul className="mt-2 space-y-1 text-[0.93rem] text-ink-soft">
            {c.resolved.length ? c.resolved.slice(0, 6).map((f) => <li key={f.auditId}>{f.title}</li>) : <li>None of the earlier issues are gone yet.</li>}
          </ul>
        </div>
        <div>
          <p className="flex items-center gap-2 font-medium">
            <ToneIcon tone="ni" /> Still to fix ({c.open.length})
          </p>
          <ul className="mt-2 space-y-1 text-[0.93rem] text-ink-soft">
            {c.open.length ? c.open.slice(0, 6).map((f) => <li key={f.auditId}>{f.title}</li>) : <li>Nothing left from last time.</li>}
            {c.open.length > 6 && <li>and {c.open.length - 6} more in Fixes</li>}
          </ul>
        </div>
        <div>
          <p className="flex items-center gap-2 font-medium">
            <ToneIcon tone="poor" /> New since then ({c.added.length})
          </p>
          <ul className="mt-2 space-y-1 text-[0.93rem] text-ink-soft">
            {c.added.length ? c.added.slice(0, 6).map((f) => <li key={f.auditId}>{f.title}</li>) : <li>No new issues.</li>}
          </ul>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule pt-4 text-sm text-ink-soft">
        <span className="flex-1">Lab results move a little between runs, so score changes under 5 points and small metric changes count as about the same. Real-visitor data takes up to 28 days to reflect a fix.</span>
        <button type="button" onClick={onRetest} className="font-medium text-serp hover:underline">
          Test again
        </button>
        <button type="button" onClick={onForget} className="hover:text-ink hover:underline">
          Clear saved tests
        </button>
      </div>
    </section>
  );
}
