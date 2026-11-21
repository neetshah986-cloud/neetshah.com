"use client";

import { Fragment, useMemo } from "react";
import { compareRuns, hostOf, type Reason, type Side } from "@/lib/speed/compare";
import type { SpeedRun } from "@/lib/speed/types";
import { ReplaySection } from "./Replay";
import { ToneIcon } from "./ui";

function scoreTone(s: number) {
  return s >= 90 ? "text-pass" : s >= 50 ? "text-warn" : "text-fail";
}

function Contender({ run, who, win }: { run: SpeedRun; who: string; win: boolean }) {
  const cwv = run.field?.passed ?? run.originField?.passed ?? null;
  return (
    <div className={`relative min-w-0 rounded-xl border bg-white p-5 ${win ? "border-pass/50 ring-1 ring-pass/30" : "border-rule"}`}>
      {win && <span className="absolute -top-3 left-5 rounded-full bg-pass px-2.5 py-0.5 text-xs font-semibold text-white">Faster</span>}
      <p className="text-sm text-ink-soft">{who}</p>
      <p className="mt-0.5 truncate text-lg font-semibold" title={run.finalUrl}>
        {hostOf(run.finalUrl)}
      </p>
      <div className="mt-3 flex items-end gap-4">
        <span className={`text-5xl font-semibold leading-none tracking-tight ${scoreTone(run.score)}`}>{run.score}</span>
        <span className="pb-1 text-sm leading-snug text-ink-soft">
          {run.strategy === "mobile" ? "Mobile" : "Desktop"} score
          <br />
          {cwv === null ? "No real-visitor data" : cwv ? "Core Web Vitals passed" : "Core Web Vitals failed"}
        </span>
      </div>
      {run.platform && <p className="mt-3 text-sm text-ink-soft">Built with {run.platform.name}</p>}
    </div>
  );
}

function ReasonList({ items, tone, empty, onFix }: { items: Reason[]; tone: "good" | "poor"; empty: string; onFix?: (auditId: string) => void }) {
  if (!items.length) return <p className="text-[0.95rem] text-ink-soft">{empty}</p>;
  return (
    <ol className="space-y-3">
      {items.map((r) => (
        <li key={r.title} className="rounded-lg border border-rule bg-white p-4">
          <p className="flex gap-2.5 font-medium leading-snug">
            <ToneIcon tone={tone} className="mt-0.5 h-4 w-4" />
            {r.title}
          </p>
          <p className="mt-1.5 pl-[1.6rem] text-[0.93rem] leading-relaxed text-ink-soft">{r.detail}</p>
          {r.fix && (
            <p className="mt-2 pl-[1.6rem] text-[0.93rem] leading-relaxed">
              <span className="font-medium">What to do: </span>
              {r.fix}
            </p>
          )}
          {onFix && r.auditIds[0] && (
            <button type="button" onClick={() => onFix(r.auditIds[0])} className="mt-2 ml-[1.6rem] text-sm font-medium text-serp hover:underline">
              See the fix in your report
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}

function Cell({ value, win }: { value: string; win: boolean }) {
  return (
    <td className={`whitespace-nowrap px-3 py-2.5 text-right ${win ? "font-semibold text-ink" : "text-ink-soft"}`}>
      <span className="inline-flex items-center gap-1.5">
        {win && (
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 text-pass" aria-label="Better">
            <path d="M5 10.4l3 3L15 6.6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {value}
      </span>
    </td>
  );
}

const WIN_TEXT: Record<Side, string> = { you: "You", them: "Them", tie: "Even" };

export function VersusSection({ you, them, onFix }: { you: SpeedRun; them: SpeedRun; onFix: (auditId: string) => void }) {
  const v = useMemo(() => compareRuns(you, them), [you, them]);
  const other = hostOf(them.finalUrl);
  const groups = [...new Set(v.rows.map((r) => r.group))];
  const youWins = v.rows.filter((r) => r.winner === "you").length;
  const themWins = v.rows.filter((r) => r.winner === "them").length;

  return (
    <div className="space-y-12">
      <section>
        <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <Contender run={you} who="Your page" win={v.winner === "you"} />
          <span className="text-center text-sm font-semibold text-ink-soft">vs</span>
          <Contender run={them} who="Competitor" win={v.winner === "them"} />
        </div>
        <p className="mt-6 text-2xl font-semibold leading-snug tracking-tight">{v.headline}</p>
        <p className="mt-1 text-[0.95rem] text-ink-soft">
          You win {youWins} of {v.rows.length} checks, {other} wins {themWins}, and {v.rows.length - youWins - themWins} are even.
        </p>
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div>
          <h3 className="text-xl font-semibold tracking-tight">Where you&apos;re behind, and why</h3>
          <p className="mt-1 mb-4 text-[0.95rem] text-ink-soft">The biggest gaps first, each with what to change.</p>
          <ReasonList items={v.behind} tone="poor" empty={`Nothing that stands out: ${other} isn't ahead on any of the main causes.`} onFix={onFix} />
        </div>
        <div>
          <h3 className="text-xl font-semibold tracking-tight">Where you&apos;re ahead</h3>
          <p className="mt-1 mb-4 text-[0.95rem] text-ink-soft">Keep these when you make changes.</p>
          <ReasonList items={v.ahead} tone="good" empty={`${other} isn't behind you on any of the main causes yet.`} />
        </div>
      </section>

      <section>
        <h3 className="text-xl font-semibold tracking-tight">Head to head</h3>
        <p className="mt-1 mb-4 text-[0.95rem] text-ink-soft">Small differences count as even, because lab results vary a little from run to run.</p>
        <div className="overflow-x-auto rounded-xl border border-rule bg-white">
          <table className="w-full min-w-[560px] text-[0.93rem]">
            <thead>
              <tr className="border-b border-rule bg-mist/50 text-left text-sm text-ink-soft">
                <th className="px-4 py-2.5 font-medium">Check</th>
                <th className="px-3 py-2.5 text-right font-medium">Your page</th>
                <th className="max-w-[12rem] truncate px-3 py-2.5 text-right font-medium">{other}</th>
                <th className="px-4 py-2.5 text-right font-medium">Who&apos;s ahead</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g}>
                  <tr>
                    <th colSpan={4} className="border-b border-rule px-4 pt-4 pb-1.5 text-left text-sm font-semibold">
                      {g}
                    </th>
                  </tr>
                  {v.rows
                    .filter((r) => r.group === g)
                    .map((r) => (
                      <tr key={r.label} className="border-b border-rule/60 last:border-0">
                        <td className="px-4 py-2.5">{r.label}</td>
                        <Cell value={r.you} win={r.winner === "you"} />
                        <Cell value={r.them} win={r.winner === "them"} />
                        <td className="px-4 py-2.5 text-right text-sm">
                          <span className={r.winner === "you" ? "font-medium text-pass" : r.winner === "them" ? "font-medium text-fail" : "text-ink-soft"}>{r.you === "No data" || r.them === "No data" ? "Can't compare" : WIN_TEXT[r.winner]}</span>
                          {r.diff && <span className="text-ink-soft">, {r.diff}</span>}
                        </td>
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {(v.thirdParties.onlyYou.length > 0 || v.thirdParties.onlyThem.length > 0 || v.thirdParties.both.length > 0) && (
        <section>
          <h3 className="text-xl font-semibold tracking-tight">Outside scripts each page loads</h3>
          <p className="mt-1 mb-4 max-w-3xl text-[0.95rem] text-ink-soft">Scripts that downloaded during Google&apos;s test, so they affect the first load. Tools a page sets to load later are listed underneath, because they don&apos;t slow the first load.</p>
          <div className="grid gap-4 md:grid-cols-3">
            {(
              [
                ["Only on your page", v.thirdParties.onlyYou],
                ["On both", v.thirdParties.both],
                [`Only on ${other}`, v.thirdParties.onlyThem],
              ] as const
            ).map(([title, list]) => (
              <div key={title} className="min-w-0 rounded-xl border border-rule bg-white p-4">
                <p className="font-medium [overflow-wrap:anywhere]">
                  {title} ({list.length})
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {list.length ? list.map((n) => <li key={n} className="rounded bg-mist px-2 py-0.5 text-sm">{n}</li>) : <li className="text-sm text-ink-soft">None</li>}
                </ul>
              </div>
            ))}
          </div>
          {[
            ["Your page", you],
            [other, them],
          ].map(([who, r]) => {
            const d = (r as SpeedRun).thirdParty?.delayed ?? [];
            if (!d.length) return null;
            const shopify = d.some((t) => t.viaShopifyPixels);
            return (
              <p key={who as string} className="mt-3 flex gap-2 text-[0.93rem] leading-relaxed text-ink-soft">
                <ToneIcon tone="good" className="mt-0.5 h-4 w-4" />
                <span>
                  <span className="font-medium text-ink">{who as string}</span> also has {d.length > 1 ? `${d.slice(0, -1).map((t) => t.name).join(", ")} and ${d.at(-1)!.name}` : d[0].name} in its code, set to load after the page{shopify ? " (through Shopify's Customer events)" : ""}.
                </span>
              </p>
            );
          })}
        </section>
      )}

      <section>
        <h3 className="text-xl font-semibold tracking-tight">Loading race</h3>
        <p className="mt-1 mb-4 max-w-3xl text-[0.95rem] text-ink-soft">Both pages loading side by side on the same {you.strategy === "mobile" ? "phone" : "desktop"}, frame by frame. Download it to show a client or your team.</p>
        {you.filmstrip.length && them.filmstrip.length ? <ReplaySection run={you} versus={them} /> : <p className="text-ink-soft">Google didn&apos;t return snapshots for one of the pages, so there&apos;s no race to show.</p>}
      </section>
    </div>
  );
}
