"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchRun, normaliseUrl, runLimited } from "@/lib/speed/client";
import { groupUrls, urlsFromText, type PageGroup } from "@/lib/speed/groups";
import { formatBytes, RATING_LABEL, type MetricKey } from "@/lib/speed/metrics";
import { summarise, type TemplateSummary } from "@/lib/speed/templates";
import type { SpeedRun, Strategy } from "@/lib/speed/types";
import { DeviceToggle, type Job, pageLabel, Progress, RunDetail, ratingText, scoreText, useTicker } from "./Multi";
import { ToneIcon } from "./ui";

type Group = PageGroup & { on: boolean };
type Found = { sitemap?: string; total?: number; skipped?: number };

const IMPACT = { high: "bg-fail/10 text-fail", medium: "bg-warn/10 text-warn", low: "bg-mist text-ink-soft" };

export function PageTypes() {
  const [site, setSite] = useState("");
  const [paste, setPaste] = useState(false);
  const [pasted, setPasted] = useState("");
  const [device, setDevice] = useState<Strategy>("mobile");
  const [perGroup, setPerGroup] = useState(2);
  const [items, setItems] = useState<{ loc: string; source?: string }[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [found, setFound] = useState<Found>({});
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState("");
  const [jobs, setJobs] = useState<(Job & { group: string })[]>([]);
  const [running, setRunning] = useState(false);
  const [detail, setDetail] = useState<SpeedRun | null>(null);
  const now = useTicker(running);
  const resultsRef = useRef<HTMLDivElement>(null);

  function regroup(list: { loc: string; source?: string }[], n: number) {
    setGroups(groupUrls(list, n).map((g) => ({ ...g, on: true })));
  }

  async function find(target = site) {
    setError("");
    setJobs([]);
    setDetail(null);
    if (paste) {
      const urls = urlsFromText(pasted);
      if (urls.length < 2) return setError("Paste at least two page URLs, one per line.");
      const list = urls.map((loc) => ({ loc }));
      setItems(list);
      setFound({ total: urls.length });
      regroup(list, perGroup);
      return;
    }
    if (!target.trim()) return;
    setFinding(true);
    setGroups([]);
    try {
      const res = await fetch("/api/page-speed/sitemap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: normaliseUrl(target) }) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.error ?? "Couldn't read the sitemap.");
      const list: { loc: string; source: string }[] = data.found;
      // Make sure the home page is included.
      try {
        const home = new URL(normaliseUrl(target)).origin + "/";
        if (!list.some((x) => x.loc.replace(/\/$/, "") === home.replace(/\/$/, ""))) list.unshift({ loc: home, source: "" });
      } catch {
        /* ignore */
      }
      setItems(list);
      setFound({ sitemap: data.sitemap, total: data.total, skipped: data.skipped });
      regroup(list, perGroup);
      const u = new URL(window.location.href);
      u.search = "";
      u.searchParams.set("mode", "types");
      u.searchParams.set("site", target.trim());
      window.history.replaceState(null, "", u);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read the sitemap.");
    } finally {
      setFinding(false);
    }
  }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("mode") !== "types" || !q.get("site")) return;
    const s = q.get("site")!;
    const t = setTimeout(() => {
      setSite(s);
      find(s);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function test(fresh = false) {
    const picked = groups.filter((g) => g.on).flatMap((g) => g.samples.map((url) => ({ url, group: g.key })));
    if (!picked.length) return;
    setDetail(null);
    setJobs(picked.map((p) => ({ ...p })));
    setRunning(true);
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ block: "start" }));
    await runLimited(
      picked.map((p, i) => () => {
        setJobs((js) => js.map((j, k) => (k === i ? { ...j, loading: true, started: Date.now() } : j)));
        return fetchRun(p.url, device, fresh);
      }),
      6,
      (i, r) => setJobs((js) => js.map((j, k) => (k === i ? { ...j, loading: false, run: r.value, error: r.error } : j))),
    );
    setRunning(false);
  }

  const summaries = useMemo(() => {
    const out: { group: Group; s: TemplateSummary; failed: number }[] = [];
    for (const g of groups) {
      const mine = jobs.filter((j) => j.group === g.key);
      const runs = mine.map((j) => j.run).filter((r): r is SpeedRun => !!r);
      const s = summarise(runs);
      if (s) out.push({ group: g, s, failed: mine.filter((j) => j.error).length });
    }
    return out.sort((a, b) => a.s.score - b.s.score);
  }, [groups, jobs]);

  const total = groups.filter((g) => g.on).reduce((n, g) => n + g.samples.length, 0);
  const done = jobs.length > 0 && !running;
  const slowest = summaries[0];
  const fastest = summaries.length > 1 ? summaries[summaries.length - 1] : undefined;

  return (
    <div>
      <div className="rounded-2xl border border-rule bg-white p-4 shadow-[0_1px_0_#D9E0EA,0_24px_48px_-32px_rgba(14,26,43,0.3)] sm:p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            find();
          }}
        >
          {!paste ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <label htmlFor="pt-site" className="sr-only">Website or sitemap URL</label>
              <input id="pt-site" value={site} onChange={(e) => setSite(e.target.value)} inputMode="url" spellCheck={false} placeholder="https://example.com or https://example.com/sitemap.xml" className="min-w-0 flex-1 rounded-lg border border-rule bg-paper px-4 py-3 font-mono text-[0.95rem] outline-none focus:border-serp focus:bg-white" />
              <button type="submit" disabled={finding || !site.trim()} className="rounded-lg bg-ink px-6 py-3 font-medium text-paper transition-colors hover:bg-serp disabled:cursor-not-allowed disabled:opacity-50">
                {finding ? "Reading sitemap…" : "Find page types"}
              </button>
            </div>
          ) : (
            <div>
              <label htmlFor="pt-paste" className="text-sm font-medium">Page URLs, one per line</label>
              <textarea id="pt-paste" value={pasted} onChange={(e) => setPasted(e.target.value)} rows={6} spellCheck={false} placeholder={"https://example.com/\nhttps://example.com/collections/shoes\nhttps://example.com/products/runner\nhttps://example.com/blogs/news/sizing-guide"} className="mt-1.5 w-full rounded-lg border border-rule bg-paper px-4 py-3 font-mono text-[0.9rem] outline-none focus:border-serp focus:bg-white" />
              <button type="submit" disabled={!pasted.trim()} className="mt-2 rounded-lg bg-ink px-6 py-3 font-medium text-paper transition-colors hover:bg-serp disabled:opacity-50">
                Group these pages
              </button>
            </div>
          )}
        </form>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="text-sm text-ink-soft">{paste ? "The tool groups your URLs by page type from their paths." : "Reads the sitemap (from robots.txt or /sitemap.xml) and groups the pages by type: home, category, product, blog and more."}</p>
          <button type="button" onClick={() => setPaste((p) => !p)} className="text-sm font-medium text-serp hover:underline">
            {paste ? "Use a sitemap instead" : "Paste URLs instead"}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-3 flex gap-2 rounded-lg bg-fail/10 px-4 py-3 text-fail">
            <ToneIcon tone="poor" className="mt-0.5 h-4 w-4" />
            {error}
          </p>
        )}
      </div>

      {groups.length > 0 && (
        <section className="mt-8 rounded-2xl border border-rule bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold tracking-tight">
                {groups.length} page type{groups.length === 1 ? "" : "s"} found in {(found.total ?? items.length).toLocaleString("en-IN")} URLs
              </h3>
              <p className="mt-1 text-[0.95rem] text-ink-soft">
                {found.sitemap ? (
                  <>
                    From <span className="font-mono text-[0.85rem] [overflow-wrap:anywhere]">{found.sitemap}</span>
                    {found.skipped ? ` (the first sitemaps of each type; ${found.skipped} more skipped)` : ""}.{" "}
                  </>
                ) : null}
                Pages of one type share a template, so testing a couple of each tells you how the whole type performs. Untick types you don&apos;t need.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-ink-soft">Pages per type</span>
                <select
                  value={perGroup}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setPerGroup(n);
                    regroup(items, n);
                  }}
                  disabled={running}
                  className="rounded-md border border-rule bg-white px-2 py-1"
                >
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <DeviceToggle value={device} onChange={setDevice} disabled={running} />
            </div>
          </div>
          <ul className="mt-5 grid gap-3 md:grid-cols-2">
            {groups.map((g) => (
              <li key={g.key} className={`rounded-xl border p-4 transition-colors ${g.on ? "border-ink/30 bg-white" : "border-rule bg-mist/40 opacity-70"}`}>
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" checked={g.on} disabled={running} onChange={(e) => setGroups((gs) => gs.map((x) => (x.key === g.key ? { ...x, on: e.target.checked } : x)))} className="mt-1 h-4 w-4 accent-ink" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">{g.label}</span>
                      <span className="shrink-0 text-sm text-ink-soft">{g.urls.length.toLocaleString("en-IN")} URLs</span>
                    </span>
                    <span className="mt-1.5 block space-y-0.5">
                      {g.samples.map((u) => (
                        <span key={u} className="block truncate font-mono text-[0.8rem] text-ink-soft" title={u}>
                          {pageLabel(u, 70)}
                        </span>
                      ))}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button type="button" onClick={() => test()} disabled={running || !total} className="rounded-lg bg-ink px-6 py-3 font-medium text-paper transition-colors hover:bg-serp disabled:cursor-not-allowed disabled:opacity-50">
              {running ? "Testing…" : `Test ${total} page${total === 1 ? "" : "s"}`}
            </button>
            <p className="text-sm text-ink-soft">Six pages are tested at a time, so {total} pages take about {Math.max(1, Math.ceil(total / 6))} to {Math.max(2, Math.ceil(total / 6) * 2)} minutes.</p>
          </div>
        </section>
      )}

      <div ref={resultsRef} className="scroll-mt-24">
        {jobs.length > 0 && (
          <div className="mt-8 space-y-8">
            <Progress jobs={jobs} now={now} />

            {slowest && (
              <section className="rounded-2xl border border-rule bg-white p-5 sm:p-6">
                <p className="text-sm text-ink-soft">
                  Results by page type, {device}
                  {running ? " (filling in as results arrive)" : ""}
                </p>
                <p className="mt-1 text-2xl font-semibold leading-snug tracking-tight">
                  {summaries.length > 1
                    ? `${slowest.group.label} are your slowest template: score ${slowest.s.score}${slowest.s.lab.LCP ? `, LCP ${slowest.s.lab.LCP.display}` : ""}.`
                    : `${slowest.group.label}: score ${slowest.s.score}${slowest.s.lab.LCP ? `, LCP ${slowest.s.lab.LCP.display}` : ""}.`}
                  {fastest && fastest.s.score - slowest.s.score >= 10 ? ` ${fastest.group.label} score ${fastest.s.score}.` : ""}
                </p>
                {slowest.s.worst?.cause && <p className="mt-2 leading-relaxed text-ink-soft">{slowest.s.worst.cause}</p>}
                {slowest.s.common[0] && (
                  <p className="mt-3 rounded-lg bg-mist/70 px-4 py-3 leading-relaxed">
                    <span className="font-medium">Fix first:</span> {slowest.s.common[0].title}. It appears on {slowest.s.common[0].seenIn} of {slowest.s.runs.length} {slowest.group.label.toLowerCase()} tested, so one change in the template fixes it on all {slowest.group.urls.length.toLocaleString("en-IN")}.
                  </p>
                )}
              </section>
            )}

            {summaries.length > 0 && (
              <section>
                <h3 className="text-xl font-semibold tracking-tight">Templates compared</h3>
                <p className="mt-1 mb-3 text-[0.95rem] text-ink-soft">Slowest first. Lab numbers are the median of the pages tested for each type.</p>
                <div className="overflow-x-auto rounded-xl border border-rule bg-white">
                  <table className="w-full min-w-[760px] text-[0.93rem]">
                    <thead>
                      <tr className="border-b border-rule bg-mist/50 text-left text-sm text-ink-soft">
                        <th className="px-4 py-2.5 font-medium">Page type</th>
                        <th className="px-3 py-2.5 font-medium">Real visitors</th>
                        <th className="px-3 py-2.5 font-medium">Score</th>
                        <th className="px-3 py-2.5 font-medium">LCP</th>
                        <th className="px-3 py-2.5 font-medium">TBT</th>
                        <th className="px-3 py-2.5 font-medium">CLS</th>
                        <th className="px-3 py-2.5 font-medium">Weight</th>
                        <th className="px-3 py-2.5 font-medium">Main problem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaries.map(({ group, s }) => {
                        const lab = (k: MetricKey) => {
                          const m = s.lab[k];
                          return m ? <span className={ratingText[m.rating]}>{m.display}</span> : "–";
                        };
                        const weights = s.runs.map((r) => r.facts?.bytes.total ?? 0).sort((a, b) => a - b);
                        return (
                          <tr key={group.key} className="border-b border-rule/70 align-top last:border-0">
                            <td className="px-4 py-3">
                              <a href={`#type-${group.key}`} className="font-medium hover:underline">
                                {group.label}
                              </a>
                              <span className="block text-xs text-ink-soft">
                                {s.runs.length} tested of {group.urls.length.toLocaleString("en-IN")}
                              </span>
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              {s.cwv === null ? (
                                <span className="text-ink-soft">No data</span>
                              ) : (
                                <span className={`inline-flex items-center gap-1.5 font-medium ${s.cwv ? "text-pass" : "text-fail"}`}>
                                  <ToneIcon tone={s.cwv ? "good" : "poor"} className="h-4 w-4" />
                                  {s.cwv ? "Passed" : "Failed"}
                                </span>
                              )}
                              {s.fieldScope === "origin" && <span className="block text-xs text-ink-soft">whole site</span>}
                            </td>
                            <td className={`px-3 py-3 text-lg font-semibold ${scoreText(s.score)}`}>{s.score}</td>
                            <td className="px-3 py-3 whitespace-nowrap">{lab("LCP")}</td>
                            <td className="px-3 py-3 whitespace-nowrap">{lab("TBT")}</td>
                            <td className="px-3 py-3 whitespace-nowrap">{lab("CLS")}</td>
                            <td className="px-3 py-3 whitespace-nowrap text-ink-soft">{weights.length ? formatBytes(weights[Math.floor(weights.length / 2)]) : "–"}</td>
                            <td className="max-w-[20rem] px-3 py-3 text-sm leading-snug">{s.worst ? <span><span className="font-medium">{s.worst.key} {s.worst.display}</span> <span className="text-ink-soft">({RATING_LABEL[s.worst.rating].toLowerCase()})</span></span> : <span className="text-pass">All good</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {summaries.map(({ group, s, failed }) => (
              <section key={group.key} id={`type-${group.key}`} className="scroll-mt-24 rounded-2xl border border-rule bg-white p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold tracking-tight">{group.label}</h3>
                    <p className="mt-1 text-sm text-ink-soft">
                      {group.urls.length.toLocaleString("en-IN")} URLs of this type. {s.runs.length} tested{failed ? `, ${failed} failed` : ""}.
                    </p>
                  </div>
                  <span className={`text-4xl font-semibold tracking-tight ${scoreText(s.score)}`}>{s.score}</span>
                </div>
                {s.worst?.cause && (
                  <p className="mt-3 flex gap-2.5 leading-relaxed">
                    <ToneIcon tone={s.worst.rating} className="mt-1 h-4 w-4" />
                    <span>
                      <span className="font-medium">
                        {s.worst.key} {s.worst.display}.
                      </span>{" "}
                      {s.worst.cause}
                    </span>
                  </p>
                )}
                <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                  <div className="min-w-0">
                    <p className="font-medium">Template fixes (found on most pages of this type)</p>
                    {s.common.length ? (
                      <ol className="mt-2 divide-y divide-rule rounded-lg border border-rule">
                        {s.common.slice(0, 6).map((c) => (
                          <li key={c.auditId} className="flex items-start justify-between gap-3 px-3.5 py-2.5">
                            <span className="min-w-0">
                              <span className="block font-medium leading-snug [overflow-wrap:anywhere]">{c.title}</span>
                              <span className="text-sm text-ink-soft [overflow-wrap:anywhere]">
                                On {c.seenIn} of {s.runs.length} pages tested
                                {c.example.elements[0]?.node.selector ? `, e.g. ${c.example.elements[0].node.selector.slice(0, 60)}` : ""}
                              </span>
                            </span>
                            <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold capitalize ${IMPACT[c.impact]}`}>{c.impact}</span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="mt-2 text-[0.95rem] text-ink-soft">No problem repeats across the pages tested, so the issues are page by page rather than in the template.</p>
                    )}
                    <p className="mt-2 text-sm text-ink-soft">Open a page&apos;s full report for the element, the fixed code and platform steps.</p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">Pages tested</p>
                    <ul className="mt-2 space-y-2">
                      {s.runs.map((r) => (
                        <li key={r.finalUrl} className="flex items-center justify-between gap-3 rounded-lg border border-rule px-3.5 py-2.5">
                          <span className="min-w-0">
                            <span className="block truncate font-mono text-[0.8rem]" title={r.finalUrl}>
                              {pageLabel(r.finalUrl, 60)}
                            </span>
                            <span className="text-xs text-ink-soft">
                              LCP {r.lab.LCP?.display ?? "–"}, TBT {r.lab.TBT?.display ?? "–"}, CLS {r.lab.CLS?.display ?? "–"}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-3">
                            <span className={`font-semibold ${scoreText(r.score)}`}>{r.score}</span>
                            <button type="button" onClick={() => setDetail(r)} className="text-sm font-medium text-serp hover:underline">
                              Full report
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            ))}

            {done && jobs.some((j) => j.error) && (
              <div className="rounded-xl border border-rule bg-white p-4 text-sm">
                <p className="font-medium">Pages that couldn&apos;t be tested</p>
                <ul className="mt-2 space-y-1 text-ink-soft">
                  {jobs
                    .filter((j) => j.error)
                    .map((j) => (
                      <li key={j.url}>
                        <span className="font-mono text-[0.8rem]">{pageLabel(j.url, 70)}</span>: {j.error}
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {done && (
              <button type="button" onClick={() => test(true)} className="text-sm font-medium text-serp hover:underline">
                Test these pages again
              </button>
            )}

            {detail && <RunDetail run={detail} onClose={() => setDetail(null)} />}
          </div>
        )}
      </div>
    </div>
  );
}
