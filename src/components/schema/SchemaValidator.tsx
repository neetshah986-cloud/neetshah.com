"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Issue, Item, Report, RichResult, Severity, Value } from "@/lib/schema/types";
import { EXAMPLE_CODE } from "./example";

type Mode = "url" | "code";
type Tab = "items" | "google" | "content" | "graph" | "source";

const SEV_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
const FORMAT_LABEL = { "json-ld": "JSON-LD", microdata: "Microdata", rdfa: "RDFa" } as const;

// ---------- Small pieces ----------

function SevIcon({ s, className = "h-4 w-4" }: { s: Severity | "pass"; className?: string }) {
  if (s === "pass")
    return (
      <svg viewBox="0 0 20 20" className={`${className} shrink-0 text-pass`} aria-label="Pass">
        <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.14" />
        <path d="M6 10.4l2.6 2.6L14 7.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  const color = s === "error" ? "text-fail" : s === "warning" ? "text-warn" : "text-serp";
  return (
    <svg viewBox="0 0 20 20" className={`${className} shrink-0 ${color}`} aria-label={s === "error" ? "Error" : s === "warning" ? "Warning" : "Note"}>
      <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.14" />
      {s === "info" ? (
        <path d="M10 9v5M10 6.2h.01" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      ) : (
        <path d="M10 5.8v5.2M10 14h.01" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      )}
    </svg>
  );
}

function Count({ n, s, onDark = false }: { n: number; s: Severity; onDark?: boolean }) {
  if (!n) return null;
  const tone = onDark
    ? "bg-paper/15 text-paper"
    : s === "error"
      ? "bg-fail/10 text-fail"
      : s === "warning"
        ? "bg-warn/10 text-warn"
        : "bg-serp/10 text-serp";
  return <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums ${tone}`}>{n}</span>;
}

function IssueLine({ issue }: { issue: Issue }) {
  return (
    <div className="flex gap-2.5 py-1.5">
      <SevIcon s={issue.severity} className="mt-0.5 h-4 w-4" />
      <div className="min-w-0 text-[0.92rem] leading-snug">
        <p className={issue.severity === "error" ? "text-ink" : "text-ink"}>{issue.message}</p>
        {issue.hint && <p className="mt-0.5 text-ink-soft">{issue.hint}</p>}
      </div>
    </div>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const typeLabel = (types: string[]) => (types.length ? types.join(" / ") : "Untyped object");

// ---------- Items ----------

function ItemView({ item, issuesByItem, depth = 0 }: { item: Item; issuesByItem: Map<string, Issue[]>; depth?: number }) {
  const own = issuesByItem.get(item.uid) ?? [];
  const itemLevel = own.filter((i) => !i.prop).sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  return (
    <div className={depth ? "mt-2 rounded-lg border border-rule bg-paper" : ""}>
      <div className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 ${depth ? "border-b border-rule px-4 py-2.5" : "pb-3"}`}>
        <span className={depth ? "font-semibold" : "text-xl font-semibold tracking-tight"}>{typeLabel(item.types)}</span>
        {item.id && <span className="break-all font-mono text-xs text-ink-soft">{item.id}</span>}
      </div>
      {itemLevel.length > 0 && (
        <div className={depth ? "border-b border-rule px-4 py-1.5" : "mb-3"}>
          {itemLevel.map((i, k) => (
            <IssueLine key={k} issue={i} />
          ))}
        </div>
      )}
      <dl className={depth ? "divide-y divide-rule" : "divide-y divide-rule border-y border-rule"}>
        {item.props.map((p) => {
          const pIssues = own.filter((i) => i.prop === p.name).sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
          const worst = pIssues[0]?.severity;
          return (
            <div key={p.name} className={`grid gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[minmax(8rem,13rem)_1fr] ${depth ? "px-4" : ""}`}>
              <dt className="flex items-start gap-2 pt-0.5 font-mono text-[0.85rem]">
                <SevIcon s={worst ?? "pass"} className="mt-0.5 h-3.5 w-3.5" />
                <span className="break-all">{p.name}</span>
              </dt>
              <dd className="min-w-0">
                {p.values.length === 0 && <span className="text-ink-soft">(empty)</span>}
                {p.values.map((v, k) => (
                  <ValueView key={k} v={v} issuesByItem={issuesByItem} depth={depth} />
                ))}
                {pIssues.length > 0 && (
                  <div className="mt-1.5 rounded-md bg-mist/70 px-3 py-1">
                    {pIssues.map((i, k) => (
                      <IssueLine key={k} issue={i} />
                    ))}
                  </div>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function ValueView({ v, issuesByItem, depth }: { v: Value; issuesByItem: Map<string, Issue[]>; depth: number }) {
  if (v.kind === "item") return <ItemView item={v.item} issuesByItem={issuesByItem} depth={depth + 1} />;
  if (v.kind === "ref")
    return (
      <p className="text-[0.92rem]">
        <span className="text-ink-soft">Reference to </span>
        <span className="break-all font-mono text-[0.85rem]">{v.id}</span>
      </p>
    );
  const isUrl = /^https?:\/\//.test(v.value);
  return (
    <p className="break-words text-[0.92rem] leading-relaxed">
      {isUrl ? (
        <a href={v.value} target="_blank" rel="noopener nofollow" className="break-all text-serp hover:underline">
          {v.value}
        </a>
      ) : v.value.length > 400 ? (
        `${v.value.slice(0, 400)}…`
      ) : (
        v.value
      )}
    </p>
  );
}

// ---------- Google ----------

const RICH_STATUS: Record<RichResult["status"], { label: string; tone: string }> = {
  invalid: { label: "Missing required fields", tone: "bg-fail/10 text-fail" },
  warnings: { label: "Eligible, can be improved", tone: "bg-warn/10 text-warn" },
  eligible: { label: "Eligible", tone: "bg-pass/10 text-pass" },
  limited: { label: "Limited use", tone: "bg-mist text-ink-soft" },
  retired: { label: "No longer shown by Google", tone: "bg-mist text-ink-soft" },
};

function GoogleView({ report }: { report: Report }) {
  if (!report.richResults.length)
    return <Empty title="No Google rich result types found" body="None of the items on this page match a Google Search rich result feature. They can still help search engines understand the page." />;
  return (
    <div>
      <p className="max-w-3xl text-ink-soft">
        Checked against Google Search Central&apos;s requirements for each feature. Meeting them makes a page eligible; Google still decides whether to show a rich result.
      </p>
      <ul className="mt-6 grid gap-4 lg:grid-cols-2">
        {report.richResults.map((r, k) => (
          <li key={k} className="rounded-xl border border-rule bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold tracking-tight">{r.feature}</p>
                <p className="text-sm text-ink-soft">{r.type}</p>
              </div>
              <span className={`rounded-md px-2 py-1 text-sm font-medium ${RICH_STATUS[r.status].tone}`}>{RICH_STATUS[r.status].label}</span>
            </div>
            {r.note && <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-soft">{r.note}</p>}
            {r.missingRequired.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-semibold text-fail">Required, missing</p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {r.missingRequired.map((m) => (
                    <li key={m} className="rounded-md bg-fail/10 px-2 py-0.5 font-mono text-[0.8rem] text-fail">{m}</li>
                  ))}
                </ul>
              </div>
            )}
            {r.missingRecommended.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-semibold text-warn">Recommended, missing</p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {r.missingRecommended.map((m) => (
                    <li key={m} className="rounded-md bg-mist px-2 py-0.5 font-mono text-[0.8rem] text-ink-soft">{m}</li>
                  ))}
                </ul>
              </div>
            )}
            {r.status === "eligible" && <p className="mt-3 text-[0.95rem] text-ink-soft">All required and recommended fields are present.</p>}
            {r.docs && (
              <a href={r.docs} target="_blank" rel="noopener" className="mt-4 inline-block text-sm font-medium text-serp hover:underline">
                Google&apos;s {r.feature.toLowerCase()} documentation
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Content match ----------

function ContentView({ report }: { report: Report }) {
  if (report.content === null)
    return <Empty title="Fetch a URL to compare with the page" body="Content matching compares your structured data with the text visitors see. That needs the full page, so check a URL rather than pasted code." />;
  if (!report.content.length)
    return <Empty title="Nothing to compare" body="Content matching covers products, articles, events, recipes, jobs, local businesses, reviews and FAQs. None were found on this page." />;
  const missing = report.content.filter((c) => !c.found).length;
  return (
    <div>
      <p className="max-w-3xl text-ink-soft">
        Google&apos;s guidelines say structured data must describe content that is visible on the page. Values that don&apos;t appear in the page text can make a page ineligible for rich results, or count as spammy markup.
      </p>
      <p className="mt-4 font-medium">
        {missing ? `${missing} of ${report.content.length} values weren't found in the visible text.` : `All ${report.content.length} values were found in the visible text.`}
      </p>
      <ul className="mt-5 divide-y divide-rule border-y border-rule">
        {report.content.map((c, k) => (
          <li key={k} className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 py-3 md:grid-cols-[auto_minmax(0,19rem)_1fr_auto] md:gap-x-5">
            <SevIcon s={c.found ? "pass" : "warning"} className="mt-0.5 h-4 w-4" />
            <span className="break-all font-mono text-[0.85rem] text-ink-soft">
              {typeLabel(report.items[c.item]?.types ?? [])}.{c.prop}
            </span>
            <span className="col-start-2 break-words text-[0.92rem] md:col-start-auto">{c.value.length > 160 ? `${c.value.slice(0, 160)}…` : c.value}</span>
            <span className={`col-start-2 text-sm md:col-start-auto ${c.found ? "text-pass" : "text-warn"}`}>{c.found ? "On the page" : "Not on the page"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Graph ----------

function GraphView({ report }: { report: Report }) {
  const { nodes, edges } = report.graph;
  const typeOf = new Map(nodes.map((n) => [n.id, n.types]));
  const unresolved = edges.filter((e) => !e.resolved);
  if (!edges.length)
    return <Empty title="No connections between entities" body='Entities are linked when one refers to another by @id, for example an Article with "publisher": {"@id": "https://example.com/#organization"}. Linking them shows search engines how they relate.' />;
  return (
    <div>
      <p className="max-w-3xl text-ink-soft">How the entities on this page point to each other through @id. Broken links are references to an @id that isn&apos;t defined on the page.</p>
      {unresolved.length > 0 && <p className="mt-4 font-medium text-warn">{unresolved.length} reference{unresolved.length > 1 ? "s" : ""} point to an @id that isn&apos;t on this page.</p>}
      <ul className="mt-5 space-y-3">
        {nodes
          .filter((n) => edges.some((e) => e.from === n.id))
          .map((n) => (
            <li key={n.id} className="rounded-xl border border-rule bg-white p-4">
              <p className="font-semibold">{typeLabel(n.types)}</p>
              <p className="break-all font-mono text-xs text-ink-soft">{n.id.startsWith("i") && !n.id.includes("/") ? "(no @id)" : n.id}</p>
              <ul className="mt-3 space-y-1.5">
                {edges
                  .filter((e) => e.from === n.id)
                  .map((e, k) => (
                    <li key={k} className="flex flex-wrap items-baseline gap-x-2 text-[0.92rem]">
                      <span className="font-mono text-[0.85rem] text-ink-soft">{e.prop}</span>
                      <span aria-hidden="true" className="text-ink-soft">→</span>
                      <span className={e.resolved ? "" : "text-warn"}>{e.resolved ? typeLabel(typeOf.get(e.to) ?? []) : "Not defined on this page"}</span>
                      <span className="break-all font-mono text-xs text-ink-soft">{e.to}</span>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
      </ul>
    </div>
  );
}

// ---------- Source ----------

function SourceView({ report }: { report: Report }) {
  const json = report.blocks.filter((b) => b.format === "json-ld");
  return (
    <div className="space-y-6">
      {json.map((b) => {
        let pretty = b.raw ?? "";
        try {
          pretty = JSON.stringify(JSON.parse(b.raw ?? ""), null, 2);
        } catch {
          /* show the raw text when it isn't valid JSON */
        }
        return (
          <div key={b.index}>
            <p className="mb-2 text-sm text-ink-soft">
              JSON-LD block {b.index + 1}
              {b.line ? `, line ${b.line} of the HTML` : ""}
            </p>
            <pre className="max-h-[32rem] overflow-auto rounded-xl bg-ink p-4 font-mono text-[0.8rem] leading-relaxed text-[#E6ECF5]">{pretty}</pre>
          </div>
        );
      })}
      {report.blocks.some((b) => b.format !== "json-ld") && (
        <p className="text-ink-soft">
          Microdata and RDFa are read from the HTML attributes. Their items are shown under Items.
        </p>
      )}
      {!json.length && !report.blocks.length && <Empty title="No source to show" body="No structured data was found." />}
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-rule bg-white p-8">
      <p className="font-semibold">{title}</p>
      <p className="mt-1.5 max-w-2xl leading-relaxed text-ink-soft">{body}</p>
    </div>
  );
}

// ---------- Report for developers ----------

function plainReport(report: Report): string {
  const lines: string[] = [];
  lines.push(`Structured data report: ${report.source.finalUrl ?? report.source.url ?? "pasted code"}`);
  lines.push(`Checked with SEO People Hub's Schema Validator (schema.org ${report.vocabVersion})`);
  lines.push(`${report.counts.errors} errors, ${report.counts.warnings} warnings, ${report.counts.info} notes`, "");
  for (const s of ["error", "warning", "info"] as Severity[]) {
    const list = report.issues.filter((i) => i.severity === s);
    if (!list.length) continue;
    lines.push(s === "error" ? "ERRORS" : s === "warning" ? "WARNINGS" : "NOTES");
    for (const i of list) {
      const where = i.item ? `[${typeLabel(report.items[i.item]?.types ?? [])}${i.prop ? `.${i.prop}` : ""}] ` : "";
      lines.push(`- ${where}${i.message}${i.hint ? ` ${i.hint}` : ""}`);
    }
    lines.push("");
  }
  const rich = report.richResults.filter((r) => r.missingRequired.length);
  if (rich.length) {
    lines.push("GOOGLE RICH RESULTS: MISSING REQUIRED FIELDS");
    for (const r of rich) lines.push(`- ${r.feature} (${r.type}): ${r.missingRequired.join(", ")}`);
    lines.push("");
  }
  const missing = report.content?.filter((c) => !c.found) ?? [];
  if (missing.length) {
    lines.push("NOT VISIBLE ON THE PAGE");
    for (const c of missing) lines.push(`- ${c.prop}: ${c.value.slice(0, 120)}`);
  }
  return lines.join("\n");
}

// ---------- Main ----------

export function SchemaValidator() {
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [tab, setTab] = useState<Tab>("items");
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  async function run(next?: { mode: Mode; url?: string; code?: string }) {
    const m = next?.mode ?? mode;
    const payload = m === "url" ? { mode: m, url: next?.url ?? url } : { mode: m, code: next?.code ?? code };
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/schema-validator", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The check failed. Try again.");
      const r = data as Report;
      setReport(r);
      setTab("items");
      setSelected(r.blocks.flatMap((b) => b.items)[0]?.uid ?? null);
      if (m === "url") {
        const u = new URL(window.location.href);
        u.searchParams.set("url", payload.url ?? "");
        window.history.replaceState(null, "", u);
      }
      requestAnimationFrame(() => resultsRef.current?.focus());
    } catch (e) {
      setReport(null);
      setError(e instanceof Error ? e.message : "The check failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  // Shared links: /tools/schema-validator?url=https://example.com runs straight away.
  useEffect(() => {
    const shared = new URLSearchParams(window.location.search).get("url");
    if (!shared) return;
    const t = setTimeout(() => {
      setUrl(shared);
      run({ mode: "url", url: shared });
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const issuesByItem = useMemo(() => {
    const m = new Map<string, Issue[]>();
    for (const i of report?.issues ?? []) if (i.item) m.set(i.item, [...(m.get(i.item) ?? []), i]);
    return m;
  }, [report]);

  // Issue totals per top-level item, nested items included.
  const totals = useMemo(() => {
    const out = new Map<string, Record<Severity, number>>();
    if (!report) return out;
    const count = (item: Item, acc: Record<Severity, number>, seen: Set<string>) => {
      if (seen.has(item.uid)) return;
      seen.add(item.uid);
      for (const i of issuesByItem.get(item.uid) ?? []) acc[i.severity]++;
      for (const p of item.props) for (const v of p.values) if (v.kind === "item") count(v.item, acc, seen);
    };
    for (const b of report.blocks)
      for (const it of b.items) {
        const acc = { error: 0, warning: 0, info: 0 };
        count(it, acc, new Set());
        out.set(it.uid, acc);
      }
    return out;
  }, [report, issuesByItem]);

  const topLevel = report?.blocks.flatMap((b) => b.items) ?? [];
  const pageIssues = (report?.issues ?? []).filter((i) => !i.item).sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  const selectedItem = selected ? report?.items[selected] : undefined;

  const tabs: { id: Tab; label: string; n?: number; s?: Severity }[] = report
    ? [
        { id: "items", label: "Items", n: report.counts.errors, s: "error" },
        { id: "google", label: "Google features", n: report.richResults.filter((r) => r.status === "invalid").length, s: "error" },
        { id: "content", label: "Content match", n: report.content?.filter((c) => !c.found).length ?? 0, s: "warning" },
        { id: "graph", label: "Entity graph", n: report.graph.edges.filter((e) => !e.resolved).length, s: "warning" },
        { id: "source", label: "Source" },
      ]
    : [];

  return (
    <div>
      {/* Input */}
      <div className="rounded-2xl border border-rule bg-white p-4 shadow-[0_1px_0_#D9E0EA,0_24px_48px_-32px_rgba(14,26,43,0.3)] sm:p-6">
        <div role="tablist" aria-label="What to check" className="inline-flex rounded-lg bg-mist p-1 text-sm">
          {(["url", "code"] as Mode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3.5 py-1.5 font-medium transition-colors ${mode === m ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}
            >
              {m === "url" ? "Fetch URL" : "Paste code"}
            </button>
          ))}
        </div>

        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          {mode === "url" ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <label htmlFor="sv-url" className="sr-only">Page URL</label>
              <input
                id="sv-url"
                type="text"
                inputMode="url"
                autoComplete="url"
                spellCheck={false}
                placeholder="https://example.com/product-page"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-rule bg-paper px-4 py-3 font-mono text-[0.95rem] outline-none transition-colors placeholder:text-ink-soft/60 focus:border-serp focus:bg-white"
              />
              <button type="submit" disabled={loading || !url.trim()} className="rounded-lg bg-ink px-6 py-3 font-medium text-paper transition-colors hover:bg-serp disabled:cursor-not-allowed disabled:opacity-50">
                {loading ? "Checking…" : "Validate URL"}
              </button>
            </div>
          ) : (
            <div>
              <label htmlFor="sv-code" className="sr-only">JSON-LD or HTML</label>
              <textarea
                id="sv-code"
                rows={10}
                spellCheck={false}
                placeholder={'Paste JSON-LD, a <script type="application/ld+json"> tag, or a full HTML page'}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full rounded-lg border border-rule bg-paper px-4 py-3 font-mono text-[0.85rem] leading-relaxed outline-none transition-colors placeholder:text-ink-soft/60 focus:border-serp focus:bg-white"
              />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="submit" disabled={loading || !code.trim()} className="rounded-lg bg-ink px-6 py-3 font-medium text-paper transition-colors hover:bg-serp disabled:cursor-not-allowed disabled:opacity-50">
                  {loading ? "Checking…" : "Validate code"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCode(EXAMPLE_CODE);
                    run({ mode: "code", code: EXAMPLE_CODE });
                  }}
                  className="rounded-lg px-3 py-3 font-medium text-serp hover:underline"
                >
                  Try an example with mistakes
                </button>
              </div>
            </div>
          )}
        </form>
        {error && (
          <p role="alert" className="mt-4 flex gap-2 rounded-lg bg-fail/10 px-4 py-3 text-fail">
            <SevIcon s="error" className="mt-0.5 h-4 w-4" />
            {error}
          </p>
        )}
      </div>

      {/* Results */}
      {report && (
        <div ref={resultsRef} tabIndex={-1} className="mt-10 outline-none" aria-live="polite">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-5">
            <div className="min-w-0">
              {report.source.kind === "url" ? (
                <>
                  <a href={report.source.finalUrl} target="_blank" rel="noopener nofollow" className="block truncate font-mono text-sm text-serp hover:underline">
                    {report.source.finalUrl}
                  </a>
                  <p className="mt-1 text-sm text-ink-soft">
                    HTTP {report.source.status} · {((report.source.bytes ?? 0) / 1024).toFixed(0)} KB · fetched in {((report.source.ms ?? 0) / 1000).toFixed(1)}s
                  </p>
                </>
              ) : (
                <p className="text-sm text-ink-soft">Pasted code</p>
              )}
              <p className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                {report.counts.errors === 0 && topLevel.length > 0
                  ? report.counts.warnings
                    ? "Valid, with warnings"
                    : "Valid structured data"
                  : topLevel.length === 0
                    ? "No structured data found"
                    : `${report.counts.errors} error${report.counts.errors === 1 ? "" : "s"} to fix`}
              </p>
              <p className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[0.95rem] text-ink-soft">
                <span>{plural(report.counts.items, "item")}</span>
                <span className="text-fail">{plural(report.counts.errors, "error")}</span>
                <span className="text-warn">{plural(report.counts.warnings, "warning")}</span>
                <span>{plural(report.counts.info, "note")}</span>
                <span>schema.org {report.vocabVersion}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(plainReport(report));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="rounded-lg border border-rule bg-white px-4 py-2 text-sm font-medium hover:border-ink"
              >
                {copied ? "Copied" : "Copy report for a developer"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = "schema-report.json";
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
                className="rounded-lg border border-rule bg-white px-4 py-2 text-sm font-medium hover:border-ink"
              >
                Download JSON
              </button>
            </div>
          </div>

          <div role="tablist" aria-label="Results" className="-mx-1 mt-5 flex gap-1 overflow-x-auto pb-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-[0.95rem] font-medium transition-colors ${tab === t.id ? "bg-ink text-paper" : "text-ink-soft hover:bg-mist hover:text-ink"}`}
              >
                {t.label}
                {t.s && <Count n={t.n ?? 0} s={t.s} onDark={tab === t.id} />}
              </button>
            ))}
          </div>

          <div className="mt-6">
            {tab === "items" && (
              <div>
                {pageIssues.length > 0 && (
                  <div className="mb-6 rounded-xl border border-rule bg-white px-5 py-3">
                    {pageIssues.map((i, k) => (
                      <IssueLine key={k} issue={i} />
                    ))}
                  </div>
                )}
                {topLevel.length > 0 && (
                  <div className="grid gap-6 lg:grid-cols-[18rem_1fr] lg:gap-10">
                    <nav aria-label="Detected items">
                      <ul className="space-y-1.5 lg:sticky lg:top-24">
                        {topLevel.map((it) => {
                          const t = totals.get(it.uid);
                          return (
                            <li key={it.uid}>
                              <button
                                type="button"
                                onClick={() => setSelected(it.uid)}
                                aria-current={selected === it.uid}
                                className={`w-full rounded-lg border px-3.5 py-2.5 text-left transition-colors ${selected === it.uid ? "border-ink bg-white" : "border-transparent hover:bg-mist"}`}
                              >
                                <span className="flex items-center justify-between gap-2">
                                  <span className="truncate font-medium">{typeLabel(it.types)}</span>
                                  <span className="flex shrink-0 gap-1">
                                    <Count n={t?.error ?? 0} s="error" />
                                    <Count n={t?.warning ?? 0} s="warning" />
                                    {!t?.error && !t?.warning && <SevIcon s="pass" className="h-4 w-4" />}
                                  </span>
                                </span>
                                <span className="mt-0.5 block text-xs text-ink-soft">{FORMAT_LABEL[it.format]}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </nav>
                    <div className="min-w-0">{selectedItem && <ItemView item={selectedItem} issuesByItem={issuesByItem} />}</div>
                  </div>
                )}
              </div>
            )}
            {tab === "google" && <GoogleView report={report} />}
            {tab === "content" && <ContentView report={report} />}
            {tab === "graph" && <GraphView report={report} />}
            {tab === "source" && <SourceView report={report} />}
          </div>
        </div>
      )}
    </div>
  );
}
