"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchRun, normaliseUrl, runLimited } from "@/lib/speed/client";
import { hostOf } from "@/lib/speed/compare";
import { boardCsv, rankBoard, type Entrant, type Ranked } from "@/lib/speed/leaderboard";
import { formatBytes, formatMetric, rate, thresholds, type MetricKey } from "@/lib/speed/metrics";
import type { SpeedRun, Strategy } from "@/lib/speed/types";
import { DeviceToggle, downloadText, pageLabel, Progress, RunDetail, ratingText, scoreText, useTicker } from "./Multi";
import { Glossed } from "./Glossary";
import { ToneIcon } from "./ui";
import { VersusSection } from "./Versus";

const MAX_COMPETITORS = 5;

type Sort = "rank" | "score" | "fLCP" | "fINP" | "fCLS" | "LCP" | "TBT" | "CLS" | "weight" | "tp";

function fieldOf(r: SpeedRun) {
  return r.field ?? r.originField;
}

function sortValue(r: Ranked, s: Sort): number | undefined {
  const f = fieldOf(r.run);
  switch (s) {
    case "score":
      return -r.run.score;
    case "fLCP":
      return f?.metrics.LCP?.value;
    case "fINP":
      return f?.metrics.INP?.value;
    case "fCLS":
      return f?.metrics.CLS?.value;
    case "LCP":
    case "TBT":
    case "CLS":
      return r.run.lab[s]?.value;
    case "weight":
      return r.run.facts?.bytes.total;
    case "tp":
      return r.run.thirdParty?.blockingMs;
    default:
      return r.rank;
  }
}

/** One small panel per metric: every page as a bar against Google's thresholds. */
function MetricBars({ k, rows, strategy, field }: { k: MetricKey; rows: Ranked[]; strategy: Strategy; field: boolean }) {
  const t = thresholds(k, strategy);
  const vals = rows
    .map((r) => ({ r, v: field ? fieldOf(r.run)?.metrics[k]?.value : r.run.lab[k]?.value }))
    .filter((x): x is { r: Ranked; v: number } => typeof x.v === "number")
    .sort((a, b) => a.v - b.v);
  const max = Math.max(t.poor * 1.15, ...vals.map((x) => x.v)) || 1;
  const name = k === "TBT" ? "Total Blocking Time" : k === "INP" ? "Interaction to Next Paint" : k === "CLS" ? "Cumulative Layout Shift" : "Largest Contentful Paint";
  return (
    <figure className="min-w-0 rounded-xl border border-rule bg-white p-4">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="font-medium">
          {name} <span className="text-ink-soft">({k})</span>
        </span>
        <span className="text-xs text-ink-soft">lower is better</span>
      </figcaption>
      {vals.length ? (
        <ul className="mt-3 space-y-2">
          {vals.map(({ r, v }) => {
            const rating = rate(k, v, strategy);
            return (
              <li key={r.url} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_4.4rem] items-center gap-2 text-sm">
                <span className={`truncate ${r.you ? "font-semibold text-ink" : "text-ink-soft"}`} title={r.run.finalUrl}>
                  {r.you ? "You" : hostOf(r.run.finalUrl)}
                </span>
                <span className="relative h-3 rounded-full bg-mist">
                  <span className={`absolute inset-y-0 left-0 rounded-full ${r.you ? "bg-serp" : "bg-ink-soft/45"}`} style={{ width: `${Math.max(2, (v / max) * 100)}%` }} />
                  {/* Google's good and poor thresholds */}
                  <span className="absolute -inset-y-1 w-px bg-pass" style={{ left: `${(t.good / max) * 100}%` }} aria-hidden />
                  <span className="absolute -inset-y-1 w-px bg-fail" style={{ left: `${(t.poor / max) * 100}%` }} aria-hidden />
                </span>
                <span className={`flex items-center justify-end gap-1 font-medium ${ratingText[rating]}`}>
                  <ToneIcon tone={rating} className="h-3.5 w-3.5" />
                  {formatMetric(k, v, strategy)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-ink-soft">{field ? "Google has no real-visitor data for these pages yet." : "No data."}</p>
      )}
      {vals.length > 0 && (
        <p className="mt-3 flex gap-4 text-xs text-ink-soft">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-px bg-pass" aria-hidden /> Good up to {formatMetric(k, t.good, strategy)}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-px bg-fail" aria-hidden /> Poor over {formatMetric(k, t.poor, strategy)}
          </span>
        </p>
      )}
    </figure>
  );
}

function Th({ s, sort, setSort, children, className = "" }: { s: Sort; sort: Sort; setSort: (s: Sort) => void; children: React.ReactNode; className?: string }) {
  const active = sort === s;
  return (
    <th className={`px-3 py-2.5 font-medium ${className}`} aria-sort={active ? "ascending" : "none"}>
      <button type="button" onClick={() => setSort(s)} className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-ink ${active ? "text-ink" : ""}`}>
        {children}
        {active && <span aria-hidden>▾</span>}
      </button>
    </th>
  );
}

export function Leaderboard() {
  const [keyword, setKeyword] = useState("");
  const [mine, setMine] = useState("");
  const [others, setOthers] = useState<string[]>(["", "", ""]);
  const [device, setDevice] = useState<Strategy>("mobile");
  const [entrants, setEntrants] = useState<(Entrant & { started?: number })[]>([]);
  const [running, setRunning] = useState(false);
  const [sort, setSort] = useState<Sort>("rank");
  const [fieldView, setFieldView] = useState(true);
  const [detail, setDetail] = useState<{ url: string; kind: "versus" | "report" } | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const now = useTicker(running);
  useEffect(() => {
    if (detail) requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: "start" }));
  }, [detail]);

  const board = useMemo(() => rankBoard(entrants), [entrants]);
  const anyField = board.ranked.some((r) => fieldOf(r.run));
  const showField = fieldView && anyField;

  async function start(kw = keyword, you = mine, comp = others, dev = device, fresh = false) {
    const urls = [normaliseUrl(you), ...comp.map(normaliseUrl).filter(Boolean)].filter(Boolean);
    const unique = urls.filter((u, i) => urls.indexOf(u) === i).slice(0, MAX_COMPETITORS + 1);
    if (!normaliseUrl(you) || unique.length < 2) return;
    setDetail(null);
    setSort("rank");
    const list: (Entrant & { started?: number })[] = unique.map((url, i) => ({ url, you: i === 0 }));
    setEntrants(list);
    setRunning(true);
    const u = new URL(window.location.href);
    u.search = "";
    u.searchParams.set("mode", "leaderboard");
    if (kw.trim()) u.searchParams.set("kw", kw.trim());
    u.searchParams.set("device", dev);
    u.searchParams.set("url", unique[0]);
    for (const c of unique.slice(1)) u.searchParams.append("vs", c);
    window.history.replaceState(null, "", u);
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ block: "start" }));
    await runLimited(
      unique.map((url, i) => () => {
        setEntrants((e) => e.map((x, j) => (j === i ? { ...x, loading: true, started: Date.now() } : x)));
        return fetchRun(url, dev, fresh);
      }),
      6,
      (i, r) => setEntrants((e) => e.map((x, j) => (j === i ? { ...x, loading: false, run: r.value, error: r.error } : x))),
    );
    setRunning(false);
  }

  // Shared links: ?mode=leaderboard&url=...&vs=...&vs=...
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("mode") !== "leaderboard" || !q.get("url")) return;
    const you = q.get("url") ?? "";
    const vs = q.getAll("vs").slice(0, MAX_COMPETITORS);
    const kw = q.get("kw") ?? "";
    const dev: Strategy = q.get("device") === "desktop" ? "desktop" : "mobile";
    const t = setTimeout(() => {
      setKeyword(kw);
      setMine(you);
      setOthers(vs.length >= 3 ? vs : [...vs, ...Array(3 - vs.length).fill("")]);
      setDevice(dev);
      start(kw, you, vs, dev);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => {
    if (sort === "rank") return board.ranked;
    return [...board.ranked].sort((a, b) => (sortValue(a, sort) ?? 1e12) - (sortValue(b, sort) ?? 1e12));
  }, [board.ranked, sort]);
  const failed = entrants.filter((e) => e.error);
  const detailRun = detail ? board.ranked.find((r) => r.url === detail.url) : undefined;
  const filled = others.filter((o) => o.trim()).length;

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
        className="rounded-2xl border border-rule bg-white p-4 shadow-[0_1px_0_#D9E0EA,0_24px_48px_-32px_rgba(14,26,43,0.3)] sm:p-6"
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="block">
            <span className="text-sm font-medium">Keyword (optional, for your notes and the export)</span>
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="iphone 17 back cover" className="mt-1.5 w-full rounded-lg border border-rule bg-paper px-4 py-2.5 outline-none focus:border-serp focus:bg-white" />
          </label>
          <div>
            <span className="text-sm font-medium">Device</span>
            <div className="mt-1.5">
              <DeviceToggle value={device} onChange={setDevice} disabled={running} />
            </div>
          </div>
        </div>
        <label className="mt-4 block">
          <span className="text-sm font-medium">Your page</span>
          <input
            value={mine}
            onChange={(e) => setMine(e.target.value)}
            inputMode="url"
            spellCheck={false}
            placeholder="https://yoursite.com/your-ranking-page"
            className="mt-1.5 w-full rounded-lg border border-rule bg-paper px-4 py-2.5 font-mono text-[0.92rem] outline-none focus:border-serp focus:bg-white"
          />
        </label>
        <fieldset className="mt-4">
          <legend className="text-sm font-medium">Competitor pages ranking for the same search (up to {MAX_COMPETITORS})</legend>
          <div className="mt-1.5 grid gap-2 md:grid-cols-2">
            {others.map((o, i) => (
              <input
                key={i}
                value={o}
                onChange={(e) => setOthers((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))}
                inputMode="url"
                spellCheck={false}
                aria-label={`Competitor ${i + 1}`}
                placeholder={`https://competitor-${i + 1}.com/page`}
                className="w-full rounded-lg border border-rule bg-paper px-4 py-2.5 font-mono text-[0.92rem] outline-none focus:border-serp focus:bg-white"
              />
            ))}
          </div>
          {others.length < MAX_COMPETITORS && (
            <button type="button" onClick={() => setOthers((xs) => [...xs, ""])} className="mt-2 text-sm font-medium text-serp hover:underline">
              Add another competitor
            </button>
          )}
        </fieldset>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="submit" disabled={running || !mine.trim() || !filled} className="rounded-lg bg-ink px-6 py-3 font-medium text-paper transition-colors hover:bg-serp disabled:cursor-not-allowed disabled:opacity-50">
            {running ? "Testing…" : "Rank by speed"}
          </button>
          <p className="text-sm text-ink-soft">Use the pages that rank on page one for your keyword. Mobile is what Google uses for ranking.</p>
        </div>
      </form>

      <div ref={resultsRef} className="scroll-mt-24">
        {entrants.length > 0 && (
          <div className="mt-8 space-y-8">
            <Progress jobs={entrants} now={now} />

            {board.ranked.length > 0 && (
              <section className="rounded-2xl border border-rule bg-white p-5 sm:p-6">
                <p className="text-sm text-ink-soft">
                  {keyword.trim() ? `Speed leaderboard for “${keyword.trim()}”` : "Speed leaderboard"}, {device}
                  {running ? " (filling in as results arrive)" : ""}
                </p>
                <p className="mt-1 text-2xl font-semibold leading-snug tracking-tight">{board.headline}</p>
                {board.reasons.length > 0 && board.against && (
                  <div className="mt-5">
                    <p className="font-medium">{board.you === board.leader ? `Why you're ahead of ${hostOf(board.against.run.finalUrl)}` : `What puts you behind ${hostOf(board.against.run.finalUrl)}`}</p>
                    <ol className="mt-2 space-y-2.5">
                      {board.reasons.map((r) => (
                        <li key={r.title} className="flex gap-2.5">
                          <ToneIcon tone={board.you === board.leader ? "good" : "poor"} className="mt-1 h-4 w-4" />
                          <span>
                            <span className="font-medium">{r.title}.</span> <span className="text-ink-soft"><Glossed text={r.detail} /></span>
                            {r.fix && <span className="block text-[0.93rem]">What to do: {r.fix}</span>}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {board.you && board.you !== board.leader && board.leader && (
                  <button type="button" onClick={() => setDetail({ url: board.leader!.url, kind: "versus" })} className="mt-3 text-sm font-medium text-serp hover:underline">
                    Open the full head to head with {hostOf(board.leader.run.finalUrl)}
                  </button>
                )}
              </section>
            )}

            {board.ranked.length > 0 && (
              <section>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold tracking-tight">Ranking</h3>
                    <p className="mt-1 max-w-3xl text-[0.95rem] text-ink-soft">Pages that pass Core Web Vitals with real visitors come first (that&apos;s what Google uses in Search), then the lab score breaks ties. Click a column to sort by it.</p>
                  </div>
                  {!running && (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => downloadText(`neetshah-speed-leaderboard-${(keyword || hostOf(board.ranked[0].run.finalUrl)).replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}-${device}.csv`, boardCsv(board, keyword))} className="rounded-md border border-rule bg-white px-3 py-1.5 text-sm font-medium hover:border-ink-soft">
                        Download CSV
                      </button>
                      <button type="button" onClick={() => start(keyword, mine, others, device, true)} className="rounded-md border border-rule bg-white px-3 py-1.5 text-sm font-medium hover:border-ink-soft">
                        Test again
                      </button>
                    </div>
                  )}
                </div>
                <div className="overflow-x-auto rounded-xl border border-rule bg-white">
                  <table className="w-full min-w-[980px] text-[0.93rem]">
                    <thead>
                      <tr className="border-b border-rule bg-mist/50 text-left text-sm text-ink-soft">
                        <Th s="rank" sort={sort} setSort={setSort} className="pl-4">#</Th>
                        <th className="px-3 py-2.5 font-medium">Page</th>
                        <th className="px-3 py-2.5 font-medium">Real visitors</th>
                        <Th s="fLCP" sort={sort} setSort={setSort}>LCP</Th>
                        <Th s="fINP" sort={sort} setSort={setSort}>INP</Th>
                        <Th s="fCLS" sort={sort} setSort={setSort}>CLS</Th>
                        <Th s="score" sort={sort} setSort={setSort}>Score</Th>
                        <Th s="LCP" sort={sort} setSort={setSort}>Lab LCP</Th>
                        <Th s="TBT" sort={sort} setSort={setSort}>TBT</Th>
                        <Th s="weight" sort={sort} setSort={setSort}>Weight</Th>
                        <th className="px-3 py-2.5 font-medium">Main weakness</th>
                        <th className="px-3 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const f = fieldOf(r.run);
                        const cell = (k: MetricKey) => {
                          const m = f?.metrics[k];
                          return m ? <span className={`font-medium ${ratingText[m.rating]}`}>{m.display}</span> : <span className="text-ink-soft">–</span>;
                        };
                        const lab = (k: MetricKey) => {
                          const m = r.run.lab[k];
                          return m ? <span className={ratingText[m.rating]}>{m.display}</span> : <span className="text-ink-soft">–</span>;
                        };
                        return (
                          <tr key={r.url} className={`border-b border-rule/70 align-top last:border-0 ${r.you ? "bg-serp/[0.05]" : ""}`}>
                            <td className="py-3 pr-2 pl-4 text-lg font-semibold">{r.rank}</td>
                            <td className="max-w-[15rem] px-3 py-3">
                              <span className="block truncate font-medium" title={r.run.finalUrl}>
                                {hostOf(r.run.finalUrl)}
                              </span>
                              <span className="block truncate text-xs text-ink-soft">{pageLabel(r.run.finalUrl, 60).replace(hostOf(r.run.finalUrl), "") || "/"}</span>
                              {r.you && <span className="mt-1 inline-block rounded bg-serp px-1.5 py-0.5 text-[0.7rem] font-semibold text-white">Your page</span>}
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              {r.cwv === null ? (
                                <span className="text-ink-soft">No data</span>
                              ) : (
                                <span className={`inline-flex items-center gap-1.5 font-medium ${r.cwv ? "text-pass" : "text-fail"}`}>
                                  <ToneIcon tone={r.cwv ? "good" : "poor"} className="h-4 w-4" />
                                  {r.cwv ? "Passed" : "Failed"}
                                </span>
                              )}
                              {f?.scope === "origin" && <span className="block text-xs text-ink-soft">whole site</span>}
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">{cell("LCP")}</td>
                            <td className="px-3 py-3 whitespace-nowrap">{cell("INP")}</td>
                            <td className="px-3 py-3 whitespace-nowrap">{cell("CLS")}</td>
                            <td className={`px-3 py-3 text-lg font-semibold ${scoreText(r.run.score)}`}>{r.run.score}</td>
                            <td className="px-3 py-3 whitespace-nowrap">{lab("LCP")}</td>
                            <td className="px-3 py-3 whitespace-nowrap">{lab("TBT")}</td>
                            <td className="px-3 py-3 whitespace-nowrap text-ink-soft">{r.run.facts ? formatBytes(r.run.facts.bytes.total) : "–"}</td>
                            <td className="max-w-[18rem] px-3 py-3 text-sm leading-snug">
                              {r.weakness ? (
                                <>
                                  <span className="font-medium">
                                    {r.weakness.metric} {r.weakness.value}:
                                  </span>{" "}
                                  <span className="line-clamp-3 text-ink-soft" title={r.weakness.text}>
                                    {r.weakness.text}
                                  </span>
                                </>
                              ) : (
                                <span className="text-pass">Every metric is good</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-right text-sm whitespace-nowrap">
                              {!r.you && board.you && (
                                <button type="button" onClick={() => setDetail({ url: r.url, kind: "versus" })} className="block font-medium text-serp hover:underline">
                                  Head to head
                                </button>
                              )}
                              <button type="button" onClick={() => setDetail({ url: r.url, kind: "report" })} className="mt-1 block font-medium text-serp hover:underline">
                                Full report
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {entrants
                        .filter((e) => !e.run)
                        .map((e) => (
                          <tr key={e.url} className="border-b border-rule/70 last:border-0">
                            <td className="py-3 pl-4 text-ink-soft">–</td>
                            <td colSpan={11} className="px-3 py-3 text-sm">
                              <span className="font-medium">{pageLabel(e.url)}</span>{" "}
                              {e.error ? <span className="text-fail">{e.error}</span> : <span className="text-ink-soft">{e.loading ? "Testing…" : "Waiting"}</span>}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {failed.length > 0 && !running && <p className="mt-2 text-sm text-ink-soft">Pages that failed aren&apos;t ranked. Check the URL, or try again in a minute.</p>}
              </section>
            )}

            {board.ranked.length > 1 && (
              <section>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold tracking-tight">Metric by metric</h3>
                    <p className="mt-1 text-[0.95rem] text-ink-soft">Each page against Google&apos;s thresholds. Your page is the blue bar.</p>
                  </div>
                  <div role="radiogroup" aria-label="Data" className="inline-flex rounded-lg bg-mist p-1 text-sm">
                    {[
                      [true, "Real visitors"],
                      [false, "Lab test"],
                    ].map(([v, l]) => (
                      <button key={String(v)} type="button" role="radio" aria-checked={showField === v} disabled={v === true && !anyField} onClick={() => setFieldView(v as boolean)} className={`rounded-md px-3.5 py-1.5 font-medium transition-colors disabled:opacity-40 ${showField === v ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}>
                        {l as string}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                  {(showField ? (["LCP", "INP", "CLS"] as MetricKey[]) : (["LCP", "TBT", "CLS"] as MetricKey[])).map((k) => (
                    <MetricBars key={k} k={k} rows={board.ranked} strategy={device} field={showField} />
                  ))}
                </div>
              </section>
            )}

            {detail && detailRun && (
              <div ref={detailRef} className="scroll-mt-20">
                {detail.kind === "versus" && board.you && detailRun !== board.you ? (
                  <section className="scroll-mt-20 rounded-2xl border-2 border-ink/80 bg-paper p-4 sm:p-6">
                    <div className="mb-5 flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-lg font-semibold tracking-tight">Head to head with {hostOf(detailRun.run.finalUrl)}</p>
                      <button type="button" onClick={() => setDetail(null)} className="shrink-0 rounded-md border border-rule bg-white px-3 py-1.5 text-sm font-medium hover:border-ink-soft">
                        Close
                      </button>
                    </div>
                    <VersusSection
                      you={board.you.run}
                      them={detailRun.run}
                      onFix={() => setDetail({ url: board.you!.url, kind: "report" })}
                    />
                  </section>
                ) : (
                  <RunDetail run={detailRun.run} onClose={() => setDetail(null)} />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
