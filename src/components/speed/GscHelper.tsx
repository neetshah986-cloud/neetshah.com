"use client";

import { useMemo, useRef, useState } from "react";
import { fetchRun, runLimited } from "@/lib/speed/client";
import { readGscFile, readGscText, type GscExport, type GscMetric } from "@/lib/speed/gsc";
import { formatMetric, RATING_LABEL, type MetricKey } from "@/lib/speed/metrics";
import type { Finding, SpeedRun, Strategy } from "@/lib/speed/types";
import { DeviceToggle, type Job, pageLabel, Progress, RunDetail, ratingText, scoreText, useTicker } from "./Multi";
import { Glossed } from "./Glossary";
import { ToneIcon } from "./ui";

const MAX_TESTS = 10;
const IMPACT = { high: "bg-fail/10 text-fail", medium: "bg-warn/10 text-warn", low: "bg-mist text-ink-soft" };

/** Lighthouse can't measure INP, so TBT (the lab stand-in) is used for its cause and fixes. */
const labKeyOf = (m: GscMetric): MetricKey => (m === "INP" ? "TBT" : m);

function fixesFor(run: SpeedRun, metric: GscMetric): Finding[] {
  const keys: MetricKey[] = metric === "INP" ? ["INP", "TBT"] : [metric];
  return run.findings.filter((f) => f.metrics.some((k) => keys.includes(k))).sort((a, b) => b.weight - a.weight);
}

export function GscHelper() {
  const [data, setData] = useState<GscExport | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [paste, setPaste] = useState(false);
  const [pasted, setPasted] = useState("");
  const [metric, setMetric] = useState<GscMetric>("LCP");
  const [device, setDevice] = useState<Strategy>("mobile");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [jobs, setJobs] = useState<(Job & { size?: number; value?: string })[]>([]);
  const [running, setRunning] = useState(false);
  const [drag, setDrag] = useState(false);
  const [detail, setDetail] = useState<SpeedRun | null>(null);
  const now = useTicker(running);
  const resultsRef = useRef<HTMLDivElement>(null);

  function accept(d: GscExport, name: string) {
    if (!d.rows.length) {
      setError("No example URLs were found. In Search Console, open one issue (for example \"LCP issue: longer than 2.5 s\") and export from that page: the overview page has no URLs.");
      setData(null);
      return;
    }
    setError("");
    setFileName(name);
    setData(d);
    if (d.metric) setMetric(d.metric);
    if (d.device) setDevice(d.device);
    const order = [...d.rows].sort((a, b) => (b.groupSize ?? 0) - (a.groupSize ?? 0));
    setPicked(new Set(order.slice(0, MAX_TESTS).map((r) => r.url)));
    setJobs([]);
    setDetail(null);
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    try {
      accept(await readGscFile(f), f.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file. Export again as CSV and upload the ZIP.");
    }
  }

  async function test(fresh = false) {
    if (!data) return;
    const rows = data.rows.filter((r) => picked.has(r.url)).slice(0, MAX_TESTS);
    setDetail(null);
    setJobs(rows.map((r) => ({ url: r.url, size: r.groupSize, value: r.groupValue })));
    setRunning(true);
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ block: "start" }));
    await runLimited(
      rows.map((r, i) => () => {
        setJobs((js) => js.map((j, k) => (k === i ? { ...j, loading: true, started: Date.now() } : j)));
        return fetchRun(r.url, device, fresh);
      }),
      6,
      (i, r) => setJobs((js) => js.map((j, k) => (k === i ? { ...j, loading: false, run: r.value, error: r.error } : j))),
    );
    setRunning(false);
  }

  const results = useMemo(() => jobs.filter((j): j is typeof j & { run: SpeedRun } => !!j.run).sort((a, b) => (b.size ?? 0) - (a.size ?? 0)), [jobs]);

  // Fixes that help the most URLs across groups.
  const shared = useMemo(() => {
    const map = new Map<string, { title: string; impact: Finding["impact"]; groups: number; urls: number; weight: number }>();
    for (const r of results) {
      for (const f of fixesFor(r.run, metric)) {
        const m = map.get(f.auditId) ?? { title: f.title, impact: f.impact, groups: 0, urls: 0, weight: 0 };
        m.groups++;
        m.urls += r.size ?? 1;
        m.weight = Math.max(m.weight, f.weight);
        map.set(f.auditId, m);
      }
    }
    return [...map.values()].filter((m) => m.groups >= Math.min(2, results.length)).sort((a, b) => b.urls * b.weight - a.urls * a.weight || b.groups - a.groups);
  }, [results, metric]);

  const affected = results.reduce((n, r) => n + (r.size ?? 0), 0);
  const labKey = labKeyOf(metric);

  return (
    <div>
      <div className="rounded-2xl border border-rule bg-white p-4 shadow-[0_1px_0_#D9E0EA,0_24px_48px_-32px_rgba(14,26,43,0.3)] sm:p-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>
            <p className="font-medium">Export the issue from Search Console</p>
            <ol className="mt-2 space-y-1.5 text-[0.95rem] leading-relaxed text-ink-soft">
              <li>1. Open Search Console, then Experience, Core Web Vitals, and Open report for Mobile (or Desktop).</li>
              <li>2. Under &quot;Why URLs aren&apos;t considered good&quot;, click an issue, for example &quot;LCP issue: longer than 2.5 s&quot;.</li>
              <li>3. Click Export at the top right and choose Download CSV.</li>
              <li>4. Upload the ZIP file here. Excel files and a single CSV work too.</li>
            </ol>
          </div>
          <div>
            {!paste ? (
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  onFile(e.dataTransfer.files[0]);
                }}
                className={`flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${drag ? "border-serp bg-serp/5" : "border-rule bg-paper hover:border-ink-soft"}`}
              >
                <input type="file" accept=".zip,.csv,.tsv,.txt,.xlsx" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
                <span className="font-medium">{fileName ? fileName : "Drop the Search Console export here"}</span>
                <span className="mt-1 text-sm text-ink-soft">{fileName ? "Drop another file to replace it" : "or click to choose a file (.zip, .csv, .xlsx)"}</span>
                <span className="mt-2 text-xs text-ink-soft">Read in your browser. The file isn&apos;t uploaded or saved anywhere.</span>
              </label>
            ) : (
              <div>
                <label htmlFor="gsc-paste" className="text-sm font-medium">Paste the examples table (from Google Sheets), or a list of URLs</label>
                <textarea id="gsc-paste" value={pasted} onChange={(e) => setPasted(e.target.value)} rows={6} spellCheck={false} className="mt-1.5 w-full rounded-lg border border-rule bg-paper px-4 py-3 font-mono text-[0.85rem] outline-none focus:border-serp focus:bg-white" />
                <button type="button" onClick={() => accept(readGscText(pasted), "Pasted table")} disabled={!pasted.trim()} className="mt-2 rounded-lg bg-ink px-5 py-2.5 font-medium text-paper hover:bg-serp disabled:opacity-50">
                  Read the table
                </button>
              </div>
            )}
            <button type="button" onClick={() => setPaste((p) => !p)} className="mt-2 text-sm font-medium text-serp hover:underline">
              {paste ? "Upload a file instead" : "Paste instead"}
            </button>
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-4 flex gap-2 rounded-lg bg-fail/10 px-4 py-3 text-fail">
            <ToneIcon tone="poor" className="mt-0.5 h-4 w-4" />
            {error}
          </p>
        )}
      </div>

      {data && (
        <section className="mt-8 rounded-2xl border border-rule bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold tracking-tight">
                {data.rows.length} URL group{data.rows.length === 1 ? "" : "s"}
                {data.issue ? `: ${data.issue}` : ""}
              </h3>
              <p className="mt-1 text-[0.95rem] text-ink-soft">Each URL is an example for a group of similar pages. Fixing the example&apos;s template fixes the group. The biggest groups are picked first (up to {MAX_TESTS}).</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-ink-soft">Issue</span>
                <select value={metric} onChange={(e) => setMetric(e.target.value as GscMetric)} disabled={running} className="rounded-md border border-rule bg-white px-2 py-1">
                  <option value="LCP">LCP</option>
                  <option value="INP">INP</option>
                  <option value="CLS">CLS</option>
                </select>
              </label>
              <DeviceToggle value={device} onChange={setDevice} disabled={running} />
            </div>
          </div>
          <ul className="mt-4 max-h-80 divide-y divide-rule overflow-y-auto rounded-lg border border-rule">
            {data.rows.map((r) => (
              <li key={r.url}>
                <label className="flex cursor-pointer items-center gap-3 px-3.5 py-2">
                  <input
                    type="checkbox"
                    checked={picked.has(r.url)}
                    disabled={running || (!picked.has(r.url) && picked.size >= MAX_TESTS)}
                    onChange={(e) =>
                      setPicked((p) => {
                        const n = new Set(p);
                        if (e.target.checked) n.add(r.url);
                        else n.delete(r.url);
                        return n;
                      })
                    }
                    className="h-4 w-4 accent-ink"
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-[0.82rem]" title={r.url}>
                    {pageLabel(r.url, 80)}
                  </span>
                  {r.groupValue && <span className="shrink-0 text-sm font-medium">{r.groupValue}</span>}
                  {r.groupSize && <span className="shrink-0 text-right text-sm text-ink-soft sm:w-32">{r.groupSize === 1 ? "1 URL" : `${r.groupSize.toLocaleString("en-IN")} URLs`}</span>}
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <button type="button" onClick={() => test()} disabled={running || !picked.size} className="rounded-lg bg-ink px-6 py-3 font-medium text-paper transition-colors hover:bg-serp disabled:cursor-not-allowed disabled:opacity-50">
              {running ? "Testing…" : `Find the cause for ${picked.size} group${picked.size === 1 ? "" : "s"}`}
            </button>
            <p className="text-sm text-ink-soft">Tests the example page of each group {device === "mobile" ? "on mobile" : "on desktop"}, six at a time.</p>
          </div>
        </section>
      )}

      <div ref={resultsRef} className="scroll-mt-24">
        {jobs.length > 0 && (
          <div className="mt-8 space-y-8">
            <Progress jobs={jobs} now={now} />

            {results.length > 0 && (
              <section className="rounded-2xl border border-rule bg-white p-5 sm:p-6">
                <p className="text-sm text-ink-soft">Search Console {metric} issue, {device}</p>
                <p className="mt-1 text-2xl font-semibold leading-snug tracking-tight">
                  {results.length} group{results.length === 1 ? "" : "s"} checked{affected ? `, covering ${affected.toLocaleString("en-IN")} URLs` : ""}.{" "}
                  {shared[0] ? `The fix that helps the most: ${shared[0].title.charAt(0).toLowerCase() + shared[0].title.slice(1)}.` : ""}
                </p>
                {shared.length > 0 && (
                  <div className="mt-4">
                    <p className="font-medium">Fixes that help several groups at once</p>
                    <ol className="mt-2 divide-y divide-rule rounded-lg border border-rule">
                      {shared.slice(0, 5).map((s) => (
                        <li key={s.title} className="flex items-start justify-between gap-3 px-3.5 py-2.5">
                          <span>
                            <span className="block font-medium leading-snug">{s.title}</span>
                            <span className="text-sm text-ink-soft">
                              Found in {s.groups} of {results.length} groups{affected ? `, about ${s.urls.toLocaleString("en-IN")} URLs` : ""}
                            </span>
                          </span>
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold capitalize ${IMPACT[s.impact]}`}>{s.impact}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {metric === "INP" && <p className="mt-3 text-sm text-ink-soft">INP can only be measured with real visitors. The causes below come from Total Blocking Time in the lab, which is driven by the same JavaScript work.</p>}
              </section>
            )}

            {results.map((r) => {
              const run = r.run;
              const now28 = (run.field?.scope === "url" ? run.field : null)?.metrics[metric];
              const lab = run.lab[labKey];
              const diag = run.diagnoses.find((d) => d.metric === labKey) ?? (metric === "INP" ? run.diagnoses.find((d) => d.metric === "INP") : undefined);
              const fixes = fixesFor(run, metric).slice(0, 4);
              const fixedNow = now28 && now28.rating === "good";
              return (
                <section key={r.url} className="rounded-2xl border border-rule bg-white p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-ink-soft">
                        {r.size ? (r.size === 1 ? "A group of 1 URL" : `Group of ${r.size.toLocaleString("en-IN")} similar URLs`) : "URL group"}
                        {r.value ? `, Search Console ${metric}: ${r.value}` : ""}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[0.9rem]" title={run.finalUrl}>
                        {pageLabel(run.finalUrl, 90)}
                      </p>
                    </div>
                    <span className={`text-3xl font-semibold tracking-tight ${scoreText(run.score)}`}>{run.score}</span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg bg-mist/60 px-4 py-3">
                      <p className="text-sm text-ink-soft">Real visitors now (this URL, last 28 days)</p>
                      {now28 ? (
                        <p className={`mt-0.5 flex items-center gap-2 text-lg font-semibold ${ratingText[now28.rating]}`}>
                          <ToneIcon tone={now28.rating} />
                          {metric} {now28.display} <span className="text-sm font-normal text-ink-soft">{RATING_LABEL[now28.rating].toLowerCase()}</span>
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[0.95rem] text-ink-soft">Not enough traffic for this URL alone. Search Console&apos;s group value is the one to watch.</p>
                      )}
                    </div>
                    <div className="rounded-lg bg-mist/60 px-4 py-3">
                      <p className="text-sm text-ink-soft">Lab test now{metric === "INP" ? " (Total Blocking Time)" : ""}</p>
                      {lab ? (
                        <p className={`mt-0.5 flex items-center gap-2 text-lg font-semibold ${ratingText[lab.rating]}`}>
                          <ToneIcon tone={lab.rating} />
                          {labKey} {formatMetric(labKey, lab.value, device)}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-ink-soft">–</p>
                      )}
                    </div>
                  </div>
                  {fixedNow && (
                    <p className="mt-3 flex gap-2 rounded-lg bg-pass/10 px-4 py-3 text-[0.95rem] text-pass">
                      <ToneIcon tone="good" className="mt-0.5 h-4 w-4" />
                      Real visitors on this URL are now in the good range. If you&apos;ve already fixed this template, click Validate fix on the issue in Search Console.
                    </p>
                  )}
                  {diag && (
                    <p className="mt-4 leading-relaxed">
                      <span className="font-medium">Cause: </span>
                      <Glossed text={diag.headline} /> {diag.detail && <span className="text-ink-soft"><Glossed text={diag.detail} /></span>}
                    </p>
                  )}
                  {fixes.length > 0 ? (
                    <div className="mt-4">
                      <p className="font-medium">Fixes for {metric} on this template</p>
                      <ol className="mt-2 divide-y divide-rule rounded-lg border border-rule">
                        {fixes.map((f) => (
                          <li key={f.id} className="flex items-start justify-between gap-3 px-3.5 py-2.5">
                            <span className="min-w-0">
                              <span className="block font-medium leading-snug">{f.title}</span>
                              <span className="text-sm text-ink-soft">{f.summary}</span>
                            </span>
                            <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold capitalize ${IMPACT[f.impact]}`}>{f.impact}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : (
                    <p className="mt-4 text-[0.95rem] text-ink-soft">Google&apos;s lab test found no {metric} problems on this page today. If Search Console still shows the issue, the slow experiences may come from parts the lab doesn&apos;t see (logged-in visitors, slow devices, pop-ups after interaction), or the fix is live and the 28-day data hasn&apos;t caught up yet.</p>
                  )}
                  <button type="button" onClick={() => setDetail(run)} className="mt-3 text-sm font-medium text-serp hover:underline">
                    Open the full report with the element and fixed code
                  </button>
                </section>
              );
            })}

            {!running && jobs.some((j) => j.error) && (
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
            {!running && results.length > 0 && (
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
