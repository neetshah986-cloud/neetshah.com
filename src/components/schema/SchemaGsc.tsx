"use client";

import { useMemo, useRef, useState } from "react";
import { runLimited } from "@/lib/speed/client";
import { readGscFile, readGscText, type GscExport } from "@/lib/speed/gsc";
import { fetchSchema } from "@/lib/schema/client";
import { forFeature, pretty, template, withMissing } from "@/lib/schema/fix";
import { detectReport, FEATURES, issueFields, issueText } from "@/lib/schema/gscRich";
import type { Item, Report } from "@/lib/schema/types";
import { FixCode } from "./FixCode";

const MAX = 10;

type Job = { url: string; report?: Report; error?: string; loading?: boolean };

/** Does the item have this dotted path (any value)? */
function has(item: Item, path: string): boolean {
  const [head, ...rest] = path.split(".");
  const p = item.props.filter((x) => x.name === head).flatMap((x) => x.values);
  if (!p.length) return false;
  if (!rest.length) return true;
  return p.some((v) => v.kind === "item" && has(v.item, rest.join(".")));
}

function pageLabel(u: string) {
  try {
    const x = new URL(u);
    return x.host.replace(/^www\./, "") + (x.pathname === "/" ? "" : x.pathname);
  } catch {
    return u;
  }
}

function Icon({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-ink-soft/30 border-t-serp motion-reduce:animate-none" aria-label="Checking" />;
  return ok ? (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-pass" role="img" aria-label="Fixed">
      <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.15" />
      <path d="M6 10.4l2.6 2.6L14 7.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-fail" role="img" aria-label="Still missing">
      <path d="M10 2l8.5 15h-17z" fill="currentColor" opacity="0.15" />
      <path d="M10 7.5v4M10 14.4h.01" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function SchemaGsc() {
  const [data, setData] = useState<GscExport | null>(null);
  const [fileName, setFileName] = useState("");
  const [feature, setFeature] = useState("Product snippet");
  const [issue, setIssue] = useState("");
  const [paste, setPaste] = useState(false);
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [jobs, setJobs] = useState<Job[]>([]);
  const [running, setRunning] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  function accept(d: GscExport, name: string) {
    if (!d.rows.length) {
      setError("No example URLs were found. In Search Console, open the report (for example Product snippets), click one issue, and export from the issue's page.");
      setData(null);
      return;
    }
    setError("");
    setFileName(name);
    setData(d);
    setFeature(detectReport(`${name} | ${Object.values(d.pairs ?? {}).join(" | ")} | ${d.meta ?? ""}`) ?? feature);
    setIssue(issueText(d.pairs, d.meta ?? "") ?? "");
    setPicked(new Set(d.rows.slice(0, MAX).map((r) => r.url)));
    setJobs([]);
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    try {
      accept(await readGscFile(f), f.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file. Export again as CSV and upload the ZIP.");
    }
  }

  async function check() {
    if (!data) return;
    const urls = data.rows.map((r) => r.url).filter((u) => picked.has(u)).slice(0, MAX);
    setJobs(urls.map((url) => ({ url, loading: true })));
    setRunning(true);
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ block: "start" }));
    await runLimited(
      urls.map((u) => () => fetchSchema(u)),
      5,
      (i, r) => setJobs((js) => js.map((j, k) => (k === i ? { ...j, loading: false, report: r.value, error: r.error } : j))),
    );
    setRunning(false);
  }

  const { fields, either } = useMemo(() => issueFields(issue), [issue]);

  // Per page: the feature's item, whether the issue's field is there now, and the fix.
  const results = useMemo(
    () =>
      jobs.map((j) => {
        if (!j.report) return { job: j };
        const r = j.report;
        const rr = forFeature(r, feature);
        const worst = [...rr].reverse()[0];
        const item = worst ? r.items[worst.item] : undefined;
        const present = item ? (either ? fields.some((f) => has(item, f)) : fields.every((f) => has(item, f))) : false;
        const stillMissing = item && fields.length ? (either ? (present ? [] : [fields[0]]) : fields.filter((f) => !has(item, f))) : fields;
        // Required fields Google lists separately, without repeating the issue's own field.
        const required = (worst?.missingRequired ?? []).filter((spec) => !spec.split(" or ").some((alt) => fields.includes(alt.trim())));
        const fixedNow = !!item && (fields.length ? present : worst?.status === "eligible" || worst?.status === "warnings");
        let fix: { code: string; added: string[]; label: string } | null = null;
        if (item && item.format === "json-ld") {
          const need = [...new Set([...stillMissing, ...required])];
          const w = withMissing(item, need);
          if (w.added.length) fix = { code: pretty(w.json), added: w.added, label: "This page's markup with the missing fields added" };
        } else if (!item) {
          const t = template(feature, r);
          if (t) fix = { code: pretty(t), added: [], label: `Starter ${feature.toLowerCase()} markup` };
        }
        return { job: j, report: r, rr: worst, item, present, stillMissing, required, fixedNow, fix };
      }),
    [jobs, feature, fields, either],
  );

  const checked = results.filter((x) => "report" in x && x.report);
  const stillBroken = checked.filter((x) => "fixedNow" in x && !x.fixedNow).length;
  const fixed = checked.length - stillBroken;
  const commonMissing = useMemo(() => {
    const count = new Map<string, number>();
    for (const x of results) if ("stillMissing" in x && x.stillMissing) for (const f of [...new Set([...(x.stillMissing ?? []), ...(x.required ?? [])])]) count.set(f, (count.get(f) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]);
  }, [results]);

  return (
    <div>
      <div className="rounded-2xl border border-rule bg-white p-4 shadow-[0_1px_0_#D9E0EA,0_24px_48px_-32px_rgba(14,26,43,0.3)] sm:p-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>
            <p className="font-medium">Export the issue from Search Console</p>
            <ol className="mt-2 space-y-1.5 text-[0.95rem] leading-relaxed text-ink-soft">
              <li>1. Open Search Console and pick a rich result report: Shopping (Product snippets, Merchant listings) or Enhancements (Breadcrumbs, Videos, Review snippets and others).</li>
              <li>2. Click one issue, for example &quot;Missing field &apos;aggregateRating&apos;&quot;.</li>
              <li>3. Click Export at the top right and choose Download CSV.</li>
              <li>4. Upload the ZIP here. Excel files and a single CSV work too.</li>
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
                <span className="font-medium">{fileName || "Drop the Search Console export here"}</span>
                <span className="mt-1 text-sm text-ink-soft">{fileName ? "Drop another file to replace it" : "or click to choose a file (.zip, .csv, .xlsx)"}</span>
                <span className="mt-2 text-xs text-ink-soft">Read in your browser. The file isn&apos;t uploaded or saved anywhere.</span>
              </label>
            ) : (
              <div>
                <label htmlFor="sg-paste" className="text-sm font-medium">Paste the example URLs (one per line), or the table from Google Sheets</label>
                <textarea id="sg-paste" value={pasted} onChange={(e) => setPasted(e.target.value)} rows={6} spellCheck={false} className="mt-1.5 w-full rounded-lg border border-rule bg-paper px-4 py-3 font-mono text-[0.85rem] outline-none focus:border-serp focus:bg-white" />
                <button type="button" onClick={() => accept(readGscText(pasted), "Pasted list")} disabled={!pasted.trim()} className="mt-2 rounded-lg bg-ink px-5 py-2.5 font-medium text-paper hover:bg-serp disabled:opacity-50">
                  Read the list
                </button>
              </div>
            )}
            <button type="button" onClick={() => setPaste((p) => !p)} className="mt-2 text-sm font-medium text-serp hover:underline">
              {paste ? "Upload a file instead" : "Paste instead"}
            </button>
          </div>
        </div>
        {error && <p role="alert" className="mt-4 rounded-lg bg-fail/10 px-4 py-3 text-fail">{error}</p>}
      </div>

      {data && (
        <section className="mt-8 rounded-2xl border border-rule bg-white p-5 sm:p-6">
          <div className="grid gap-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
            <label className="block">
              <span className="text-sm font-medium">Rich result report</span>
              <select value={feature} onChange={(e) => setFeature(e.target.value)} disabled={running} className="mt-1.5 w-full rounded-lg border border-rule bg-white px-3 py-2">
                {FEATURES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Issue (from the export; edit it if it wasn&apos;t found)</span>
              <input value={issue} onChange={(e) => setIssue(e.target.value)} placeholder={`Missing field "aggregateRating"`} className="mt-1.5 w-full rounded-lg border border-rule bg-paper px-3 py-2 outline-none focus:border-serp focus:bg-white" />
              <span className="mt-1 block text-xs text-ink-soft">{fields.length ? `Field${fields.length > 1 ? "s" : ""} to check: ${fields.join(either ? " or " : ", ")}` : "No field found in the issue: every required field will be checked."}</span>
            </label>
          </div>
          <p className="mt-5 font-medium">
            {data.rows.length} example URL{data.rows.length === 1 ? "" : "s"} (up to {MAX} are checked)
          </p>
          <ul className="mt-2 max-h-64 divide-y divide-rule overflow-y-auto rounded-lg border border-rule">
            {data.rows.map((r) => (
              <li key={r.url}>
                <label className="flex cursor-pointer items-center gap-3 px-3.5 py-2">
                  <input
                    type="checkbox"
                    checked={picked.has(r.url)}
                    disabled={running || (!picked.has(r.url) && picked.size >= MAX)}
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
                  <span className="min-w-0 truncate font-mono text-[0.82rem]" title={r.url}>
                    {pageLabel(r.url)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button type="button" onClick={check} disabled={running || !picked.size} className="mt-4 rounded-lg bg-ink px-6 py-3 font-medium text-paper transition-colors hover:bg-serp disabled:cursor-not-allowed disabled:opacity-50">
            {running ? "Checking…" : `Check ${picked.size} page${picked.size === 1 ? "" : "s"}`}
          </button>
        </section>
      )}

      <div ref={resultsRef} className="scroll-mt-24">
        {jobs.length > 0 && (
          <div className="mt-8 space-y-6">
            {checked.length > 0 && (
              <section className="rounded-2xl border border-rule bg-white p-5 sm:p-6">
                <p className="text-sm text-ink-soft">
                  {feature}
                  {issue ? `: ${issue}` : ""}
                  {running ? " (filling in as pages are checked)" : ""}
                </p>
                <p className="mt-1 text-2xl font-semibold leading-snug tracking-tight">
                  {stillBroken === 0 ? `All ${checked.length} pages checked now have it. Click Validate fix on the issue in Search Console.` : fixed ? `${stillBroken} of ${checked.length} pages still have the issue; ${fixed} look fixed.` : `The issue is still on all ${checked.length} pages checked.`}
                </p>
                {commonMissing.length > 0 && stillBroken > 1 && (
                  <p className="mt-3 rounded-lg bg-mist/70 px-4 py-3 leading-relaxed">
                    <span className="font-medium">Fix it in the template:</span> {commonMissing[0][0]} is missing on {commonMissing[0][1]} of {checked.length} pages. These pages share a template, so add the field once there (product template, theme or SEO plugin) rather than page by page.
                  </p>
                )}
              </section>
            )}

            {results.map((x) => {
              const j = x.job;
              if (!("report" in x) || !x.report)
                return (
                  <div key={j.url} className="flex items-center gap-2 rounded-xl border border-rule bg-white px-4 py-3 text-sm">
                    <Icon ok={j.error ? false : null} />
                    <span className="min-w-0 truncate font-mono text-[0.82rem]">{pageLabel(j.url)}</span>
                    {j.error && <span className="text-fail">{j.error}</span>}
                  </div>
                );
              return (
                <section key={j.url} className="rounded-2xl border border-rule bg-white p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="flex min-w-0 items-center gap-2 font-mono text-[0.9rem]">
                      <Icon ok={!!x.fixedNow} />
                      <span className="truncate" title={j.url}>
                        {pageLabel(j.url)}
                      </span>
                    </p>
                    <span className={`shrink-0 rounded-md px-2 py-1 text-sm font-medium ${x.fixedNow ? "bg-pass/10 text-pass" : "bg-fail/10 text-fail"}`}>{x.fixedNow ? "Fixed on the live page" : "Still has the issue"}</span>
                  </div>
                  {!x.item ? (
                    <p className="mt-3 leading-relaxed">No {feature.toLowerCase()} markup was found on this page now{x.report.rendering?.tagManager || x.report.rendering?.jsCreatesSchema ? ". It may be added by JavaScript or Tag Manager, which this check can't fully see: open the full check to confirm." : "."}</p>
                  ) : (
                    <div className="mt-3 space-y-2 text-[0.95rem]">
                      {fields.length > 0 && (
                        <p>
                          {x.present ? (
                            <span className="text-pass">{fields.join(either ? " / " : ", ")} {fields.length > 1 && !either ? "are" : "is"} now on the page.</span>
                          ) : (
                            <span>
                              Still missing: <span className="font-mono text-[0.85rem] text-fail">{(x.stillMissing ?? []).join(", ")}</span>
                            </span>
                          )}
                        </p>
                      )}
                      {(x.required ?? []).length > 0 && (
                        <p>
                          Other required fields missing: <span className="font-mono text-[0.85rem] text-fail">{x.required!.join(", ")}</span>
                        </p>
                      )}
                      {x.item.format !== "json-ld" && <p className="text-ink-soft">This page uses {x.item.format === "microdata" ? "microdata" : "RDFa"}: add the field as an attribute in the HTML, or switch to JSON-LD.</p>}
                    </div>
                  )}
                  {x.fix && !x.fixedNow && (
                    <div className="mt-4">
                      <FixCode code={x.fix.code} added={x.fix.added} label={x.fix.label} />
                    </div>
                  )}
                  <a href={`/tools/schema-validator?url=${encodeURIComponent(j.url)}`} target="_blank" rel="noopener" className="mt-3 inline-block text-sm font-medium text-serp hover:underline">
                    Full check of this page
                  </a>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
