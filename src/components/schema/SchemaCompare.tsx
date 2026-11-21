"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normaliseUrl, runLimited } from "@/lib/speed/client";
import { blockedReport, compareSchema, typesOf, type Cell, type Entrant } from "@/lib/schema/compare";
import { fetchSchema } from "@/lib/schema/client";
import { forFeature, pretty, template, withMissing } from "@/lib/schema/fix";
import { FixCode } from "./FixCode";

const MAX = 5;

const host = (u: string) => {
  try {
    return new URL(u).host.replace(/^www\./, "");
  } catch {
    return u;
  }
};

const CELL: Record<Cell, { label: string; cls: string; icon: "ok" | "warn" | "bad" | "none" }> = {
  eligible: { label: "Eligible", cls: "text-pass", icon: "ok" },
  warnings: { label: "Eligible, could add more", cls: "text-pass", icon: "ok" },
  invalid: { label: "Broken", cls: "text-fail", icon: "bad" },
  retired: { label: "Retired by Google", cls: "text-ink-soft", icon: "none" },
  none: { label: "Not there", cls: "text-ink-soft", icon: "none" },
};

function CellIcon({ c }: { c: Cell }) {
  const k = CELL[c].icon;
  if (k === "ok")
    return (
      <svg viewBox="0 0 20 20" className="h-5 w-5 text-pass" role="img" aria-label={CELL[c].label}>
        <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.15" />
        <path d="M6 10.4l2.6 2.6L14 7.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (k === "bad")
    return (
      <svg viewBox="0 0 20 20" className="h-5 w-5 text-fail" role="img" aria-label={CELL[c].label}>
        <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.15" />
        <path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  return <span className="text-lg leading-none text-ink-soft/60" aria-label={CELL[c].label}>–</span>;
}

function csv(rows: string[][]) {
  return rows.map((r) => r.map((t) => (/[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t)).join(",")).join("\n");
}

export function SchemaCompare() {
  const [keyword, setKeyword] = useState("");
  const [mine, setMine] = useState("");
  const [others, setOthers] = useState<string[]>(["", "", ""]);
  const [entrants, setEntrants] = useState<Entrant[]>([]);
  const [running, setRunning] = useState(false);
  const [openFix, setOpenFix] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  async function start(kw = keyword, you = mine, comp = others) {
    const urls = [normaliseUrl(you), ...comp.map(normaliseUrl)].filter(Boolean);
    const unique = urls.filter((u, i) => urls.indexOf(u) === i).slice(0, MAX + 1);
    if (!normaliseUrl(you) || unique.length < 2) return;
    setEntrants(unique.map((url, i) => ({ url, you: i === 0, loading: true })));
    setRunning(true);
    setOpenFix(null);
    const u = new URL(window.location.href);
    u.search = "";
    u.searchParams.set("mode", "compare");
    if (kw.trim()) u.searchParams.set("kw", kw.trim());
    u.searchParams.set("url", unique[0]);
    for (const c of unique.slice(1)) u.searchParams.append("vs", c);
    window.history.replaceState(null, "", u);
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ block: "start" }));
    await runLimited(
      unique.map((url) => () => fetchSchema(url)),
      6,
      (i, r) => setEntrants((es) => es.map((e, j) => (j === i ? { ...e, loading: false, report: r.value, error: r.error } : e))),
    );
    setRunning(false);
  }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("mode") !== "compare" || !q.get("url")) return;
    const you = q.get("url")!;
    const vs = q.getAll("vs").slice(0, MAX);
    const kw = q.get("kw") ?? "";
    const t = setTimeout(() => {
      setKeyword(kw);
      setMine(you);
      setOthers(vs.length >= 3 ? vs : [...vs, ...Array(3 - vs.length).fill("")]);
      start(kw, you, vs);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cmp = useMemo(() => compareSchema(entrants), [entrants]);
  const you = cmp.youIdx >= 0 ? cmp.done[cmp.youIdx] : undefined;
  const failed = entrants.filter((e) => e.error);
  const done = entrants.filter((e) => e.report || e.error).length;

  function fixFor(feature: string) {
    if (!you?.report) return null;
    const r = you.report;
    const own = forFeature(r, feature === "Review stars" || feature === "Price and stock" ? "Product snippet" : feature === "Shipping and returns" ? "Merchant listing" : feature)[0];
    const item = own ? r.items[own.item] : undefined;
    if (item && item.format === "json-ld") {
      const need = feature === "Review stars" ? ["aggregateRating"] : feature === "Price and stock" ? ["offers.price", "offers.priceCurrency", "offers.availability"] : feature === "Shipping and returns" ? ["offers.shippingDetails", "offers.hasMerchantReturnPolicy"] : own.missingRequired;
      const { json, added } = withMissing(item, need);
      if (added.length) return { code: pretty(json), added, label: "Your existing markup with the missing fields added" };
    }
    const t = template(feature, r);
    return t ? { code: pretty(t), added: [], label: `Starter ${feature.toLowerCase()} markup for your page` } : null;
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
        className="rounded-2xl border border-rule bg-white p-4 shadow-[0_1px_0_#D9E0EA,0_24px_48px_-32px_rgba(14,26,43,0.3)] sm:p-6"
      >
        <label className="block">
          <span className="text-sm font-medium">Keyword (optional, for your notes and the export)</span>
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="gold earrings for women" className="mt-1.5 w-full rounded-lg border border-rule bg-paper px-4 py-2.5 outline-none focus:border-serp focus:bg-white lg:w-1/2" />
        </label>
        <label className="mt-4 block">
          <span className="text-sm font-medium">Your page</span>
          <input value={mine} onChange={(e) => setMine(e.target.value)} inputMode="url" spellCheck={false} placeholder="https://yoursite.com/your-ranking-page" className="mt-1.5 w-full rounded-lg border border-rule bg-paper px-4 py-2.5 font-mono text-[0.92rem] outline-none focus:border-serp focus:bg-white" />
        </label>
        <fieldset className="mt-4">
          <legend className="text-sm font-medium">Competitor pages ranking for the same search (up to {MAX})</legend>
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
          {others.length < MAX && (
            <button type="button" onClick={() => setOthers((xs) => [...xs, ""])} className="mt-2 text-sm font-medium text-serp hover:underline">
              Add another competitor
            </button>
          )}
        </fieldset>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="submit" disabled={running || !mine.trim() || !others.some((o) => o.trim())} className="rounded-lg bg-ink px-6 py-3 font-medium text-paper transition-colors hover:bg-serp disabled:cursor-not-allowed disabled:opacity-50">
            {running ? "Checking…" : "Compare structured data"}
          </button>
          <p className="text-sm text-ink-soft">Use the pages on page one for your keyword. Each page takes a few seconds.</p>
        </div>
      </form>

      <div ref={resultsRef} className="scroll-mt-24">
        {entrants.length > 0 && (
          <div className="mt-8 space-y-8">
            {running && (
              <div className="rounded-xl border border-rule bg-white p-4" aria-live="polite">
                <p className="font-medium">
                  Checking {entrants.length} pages: {done} done
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-mist">
                  <div className="h-full rounded-full bg-serp transition-[width]" style={{ width: `${(done / entrants.length) * 100}%` }} />
                </div>
              </div>
            )}

            {you && cmp.done.length > 1 && (
              <section className="rounded-2xl border border-rule bg-white p-5 sm:p-6">
                <p className="text-sm text-ink-soft">{keyword.trim() ? `Structured data for “${keyword.trim()}”` : "Structured data compared"}</p>
                <p className="mt-1 text-2xl font-semibold leading-snug tracking-tight">
                  {cmp.gaps.length
                    ? `Competitors use ${cmp.gaps.length} rich result feature${cmp.gaps.length === 1 ? "" : "s"} your page doesn't: ${cmp.gaps
                        .slice(0, 3)
                        .map((g) => g.feature.toLowerCase())
                        .join(", ")}.`
                    : "Your page has every rich result feature your competitors use."}
                </p>
                {cmp.gaps.length > 0 && (
                  <ol className="mt-5 space-y-3">
                    {cmp.gaps.map((g) => {
                      const open = openFix === g.feature;
                      const fix = open ? fixFor(g.feature) : null;
                      return (
                        <li key={g.feature} className="rounded-xl border border-rule p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold leading-snug">
                                {g.have} of {g.of} competitors can show {g.feature.toLowerCase()}; {g.yours === "invalid" ? "yours is broken" : "you can't"}.
                              </p>
                              <p className="mt-0.5 text-sm text-ink-soft">In Google: {g.shows}.</p>
                              <p className="mt-1.5 text-[0.95rem] leading-relaxed">{g.why}</p>
                            </div>
                            <button type="button" onClick={() => setOpenFix(open ? null : g.feature)} className="shrink-0 rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper hover:bg-serp">
                              {open ? "Hide the code" : "Get the code"}
                            </button>
                          </div>
                          {open && (
                            <div className="mt-4">
                              {fix ? <FixCode code={fix.code} added={fix.added} label={fix.label} /> : <p className="text-sm text-ink-soft">Open Google&apos;s documentation for this feature to see the required fields.</p>}
                              <p className="mt-2 text-sm text-ink-soft">Only mark up what&apos;s visible on the page: stars need real reviews shown on the page, and prices must match what visitors see. Then check the page again in the Check a page tab.</p>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            )}

            {cmp.done.length > 0 && cmp.rows.length > 0 && (
              <section>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold tracking-tight">Rich results side by side</h3>
                    <p className="mt-1 max-w-3xl text-[0.95rem] text-ink-soft">What each page can show in Google, checked against Google&apos;s requirements. Hover a cell to see what&apos;s missing. Eligible means Google can show it; Google still decides when to.</p>
                  </div>
                  {!running && (
                    <button
                      type="button"
                      onClick={() => {
                        const rows = [["Feature", "Shows in Google", ...cmp.done.map((e) => (e.you ? `${host(e.url)} (you)` : host(e.url)))], ...cmp.rows.map((r) => [r.feature, r.shows, ...r.cells.map((c, i) => `${CELL[c].label}${r.notes[i] ? ` (${r.notes[i]})` : ""}`)])];
                        const a = document.createElement("a");
                        a.href = URL.createObjectURL(new Blob([csv(rows)], { type: "text/csv;charset=utf-8" }));
                        a.download = `neetshah-schema-comparison-${(keyword || host(cmp.done[0].url)).replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}.csv`;
                        a.click();
                        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
                      }}
                      className="rounded-md border border-rule bg-white px-3 py-1.5 text-sm font-medium hover:border-ink-soft"
                    >
                      Download CSV
                    </button>
                  )}
                </div>
                <div className="overflow-x-auto rounded-xl border border-rule bg-white">
                  <table className="w-full text-[0.93rem]" style={{ minWidth: 260 + cmp.done.length * 130 }}>
                    <thead>
                      <tr className="border-b border-rule bg-mist/50 text-left text-sm">
                        <th className="sticky left-0 bg-mist px-4 py-2.5 font-medium text-ink-soft">Feature</th>
                        {cmp.done.map((e) => (
                          <th key={e.url} className={`px-3 py-2.5 text-center font-medium ${e.you ? "bg-serp/[0.07] text-ink" : "text-ink-soft"}`}>
                            <span className="block max-w-[9rem] truncate" title={e.url}>
                              {host(e.url)}
                            </span>
                            {e.you && <span className="mt-0.5 inline-block rounded bg-serp px-1.5 py-px text-[0.68rem] font-semibold text-white">You</span>}
                            {blockedReport(e.report) && <span className="mt-0.5 block text-[0.68rem] font-normal text-warn">Blocked the tool</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cmp.rows.map((r) => (
                        <tr key={r.feature} className="border-b border-rule/70 last:border-0">
                          <td className="sticky left-0 max-w-[11rem] bg-white px-3 py-2.5 sm:max-w-none sm:px-4">
                            <span className="block font-medium">{r.feature}</span>
                            {r.shows && <span className="block text-xs text-ink-soft">{r.shows}</span>}
                          </td>
                          {r.cells.map((c, i) => (
                            <td key={i} className={`px-3 py-2.5 text-center ${cmp.done[i].you ? "bg-serp/[0.04]" : ""}`} title={`${CELL[c].label}${r.notes[i] ? `. ${r.notes[i]}` : ""}`}>
                              <span className="inline-flex flex-col items-center gap-0.5">
                                <CellIcon c={c} />
                                {(c === "invalid" || c === "warnings") && <span className={`text-[0.7rem] ${CELL[c].cls}`}>{c === "invalid" ? "Broken" : "Could add more"}</span>}
                              </span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft">
                  <span className="flex items-center gap-1.5">
                    <CellIcon c="eligible" /> Eligible
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CellIcon c="invalid" /> Markup there but broken
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CellIcon c="none" /> Not there
                  </span>
                </p>
              </section>
            )}

            {cmp.done.length > 0 && (
              <section>
                <h3 className="text-xl font-semibold tracking-tight">Each page</h3>
                <ul className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {cmp.done.map((e) => {
                    const r = e.report;
                    const js = r.rendering && (r.rendering.jsCreatesSchema || (!r.rendering.schemaInServerHtml && r.rendering.tagManager));
                    return (
                      <li key={e.url} className={`rounded-xl border bg-white p-4 ${e.you ? "border-serp/50" : "border-rule"}`}>
                        <p className="flex items-center justify-between gap-2">
                          <span className="truncate font-semibold" title={e.url}>
                            {host(e.url)}
                          </span>
                          {e.you && <span className="shrink-0 rounded bg-serp px-1.5 py-px text-[0.68rem] font-semibold text-white">You</span>}
                        </p>
                        <p className="mt-1 text-sm text-ink-soft">
                          {r.counts.items} item{r.counts.items === 1 ? "" : "s"}, <span className={r.counts.errors ? "font-medium text-fail" : ""}>{r.counts.errors} error{r.counts.errors === 1 ? "" : "s"}</span>, {r.counts.warnings} warning{r.counts.warnings === 1 ? "" : "s"}
                        </p>
                        <ul className="mt-2 flex flex-wrap gap-1">
                          {typesOf(r).length ? typesOf(r).slice(0, 10).map((t) => <li key={t} className="rounded bg-mist px-1.5 py-0.5 text-xs">{t}</li>) : <li className="text-sm text-ink-soft">{blockedReport(r) ? "The site blocked this tool, so its markup couldn't be read. It isn't counted in the gaps." : "No structured data found"}</li>}
                        </ul>
                        {r.source.archived && <p className="mt-2 text-xs text-warn">The site blocked the tool, so its Internet Archive copy from {r.source.archived.date} was checked.</p>}
                        {js && <p className="mt-2 text-xs text-ink-soft">Some markup may be added by JavaScript or Tag Manager, which this check can&apos;t fully see.</p>}
                        <a href={`/tools/schema-validator?url=${encodeURIComponent(e.url)}`} target="_blank" rel="noopener" className="mt-3 inline-block text-sm font-medium text-serp hover:underline">
                          Full check of this page
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {failed.length > 0 && !running && (
              <div className="rounded-xl border border-rule bg-white p-4 text-sm">
                <p className="font-medium">Pages that couldn&apos;t be checked</p>
                <ul className="mt-2 space-y-1 text-ink-soft">
                  {failed.map((e) => (
                    <li key={e.url}>
                      <span className="font-mono text-[0.8rem]">{e.url}</span>: {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
