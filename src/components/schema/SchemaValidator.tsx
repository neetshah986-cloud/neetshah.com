"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Issue, Item, Rendering, Report, RichResult, Severity, Value } from "@/lib/schema/types";
import { EXAMPLE_CODE } from "./example";
import { SourceViewer, type Focus } from "./SourceViewer";

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

type Pick = (f: { start: number; end: number; at?: number }) => void;

function ItemView({ item, issuesByItem, depth = 0, onPick, activeAt }: { item: Item; issuesByItem: Map<string, Issue[]>; depth?: number; onPick?: Pick; activeAt?: number }) {
  const own = issuesByItem.get(item.uid) ?? [];
  const itemLevel = own.filter((i) => !i.prop).sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  const pickItem = () => item.loc && onPick?.({ start: item.loc.start, end: item.loc.end });
  return (
    <div className={`@container min-w-0 ${depth ? "mt-2 rounded-lg border border-rule bg-paper" : ""}`}>
      <div className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 ${depth ? "border-b border-rule px-4 py-2.5" : "pb-3"}`}>
        {depth > 0 && item.loc && onPick ? (
          <button type="button" onClick={pickItem} className="font-semibold hover:text-serp" title="Show in source">
            {typeLabel(item.types)}
          </button>
        ) : (
          <span className={depth ? "font-semibold" : "text-xl font-semibold tracking-tight"}>{typeLabel(item.types)}</span>
        )}
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
          const active = p.at !== undefined && p.at === activeAt;
          const canPick = onPick && p.at !== undefined && item.loc;
          return (
            <div key={p.name} className={`grid gap-x-4 gap-y-1 py-2.5 @lg:grid-cols-[minmax(7rem,11rem)_minmax(0,1fr)] ${depth ? "px-3 @sm:px-4" : "px-2"} ${active ? "bg-serp/[0.07]" : ""}`}>
              <dt className="pt-0.5 font-mono text-[0.85rem]">
                {canPick ? (
                  <button
                    type="button"
                    onClick={() => onPick({ start: item.loc!.start, end: item.loc!.end, at: p.at })}
                    className={`flex items-start gap-2 text-left hover:text-serp ${active ? "text-serp" : ""}`}
                    title="Show in source"
                  >
                    <SevIcon s={worst ?? "pass"} className="mt-0.5 h-3.5 w-3.5" />
                    <span className="break-all underline decoration-rule decoration-dotted underline-offset-4">{p.name}</span>
                  </button>
                ) : (
                  <span className="flex items-start gap-2">
                    <SevIcon s={worst ?? "pass"} className="mt-0.5 h-3.5 w-3.5" />
                    <span className="break-all">{p.name}</span>
                  </span>
                )}
              </dt>
              <dd className="min-w-0">
                {p.values.length === 0 && <span className="text-ink-soft">(empty)</span>}
                {p.values.map((v, k) => (
                  <ValueView key={k} v={v} issuesByItem={issuesByItem} depth={depth} onPick={onPick} activeAt={activeAt} />
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

function ValueView({ v, issuesByItem, depth, onPick, activeAt }: { v: Value; issuesByItem: Map<string, Issue[]>; depth: number; onPick?: Pick; activeAt?: number }) {
  if (v.kind === "item") return <ItemView item={v.item} issuesByItem={issuesByItem} depth={depth + 1} onPick={onPick} activeAt={activeAt} />;
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

// ---------- Inspector: types → items → item, next to the source ----------

const itemTitle = (item: Item) => {
  for (const name of ["name", "headline", "title", "alternateName"]) {
    const v = item.props.find((p) => p.name === name)?.values[0];
    if (v?.kind === "text" && v.value.trim()) return v.value.trim();
  }
  return item.id ?? null;
};

type View = { level: "types" } | { level: "items"; group: string } | { level: "item"; uid: string; group: string };

function Inspector({
  report,
  issuesByItem,
  totals,
  pageIssues,
}: {
  report: Report;
  issuesByItem: Map<string, Issue[]>;
  totals: Map<string, Record<Severity, number>>;
  pageIssues: Issue[];
}) {
  const topLevel = report.blocks.flatMap((b) => b.items);
  const groups = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of topLevel) {
      const key = typeLabel(it.types);
      m.set(key, [...(m.get(key) ?? []), it]);
    }
    return [...m.entries()].map(([name, items]) => {
      const sum = { error: 0, warning: 0, info: 0 };
      for (const it of items) {
        const t = totals.get(it.uid);
        if (t) (Object.keys(sum) as Severity[]).forEach((k) => (sum[k] += t[k]));
      }
      return { name, items, sum };
    });
  }, [topLevel, totals]);

  const [view, setView] = useState<View>({ level: "types" });
  const [focus, setFocus] = useState<Focus>(null);
  const [sourceOpen, setSourceOpen] = useState(false);

  const markers = useMemo(() => {
    const m = new Map<number, Severity>();
    const rank = { error: 0, warning: 1, info: 2 } as const;
    for (const i of report.issues) {
      if (!i.item || i.severity === "info") continue;
      const item = report.items[i.item];
      const at = (i.prop ? item?.props.find((p) => p.name === i.prop)?.at : undefined) ?? item?.loc?.start;
      if (at === undefined) continue;
      const cur = m.get(at);
      if (!cur || rank[i.severity] < rank[cur]) m.set(at, i.severity);
    }
    return m;
  }, [report]);

  const pick: Pick = (f) => {
    setFocus(f);
    setSourceOpen(true);
  };
  const openItem = (it: Item, group: string) => {
    setView({ level: "item", uid: it.uid, group });
    if (it.loc) setFocus({ start: it.loc.start, end: it.loc.end });
  };
  const openGroup = (g: { name: string; items: Item[] }) => {
    if (g.items.length === 1) openItem(g.items[0], g.name);
    else {
      setView({ level: "items", group: g.name });
      const firstLoc = g.items[0]?.loc;
      if (firstLoc) setFocus({ start: firstLoc.start, end: firstLoc.end });
    }
  };

  const group = view.level !== "types" ? groups.find((g) => g.name === view.group) : undefined;
  const item = view.level === "item" ? report.items[view.uid] : undefined;

  const back = (to: View) => (
    <button type="button" onClick={() => setView(to)} className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-ink-soft hover:text-ink">
      <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
        <path d="M12.5 4.5L7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {to.level === "types" ? "All detected types" : view.level !== "types" ? view.group : ""}
    </button>
  );

  const counts = (sum?: Record<Severity, number>) => (
    <span className="flex shrink-0 items-center gap-1">
      <Count n={sum?.error ?? 0} s="error" />
      <Count n={sum?.warning ?? 0} s="warning" />
      {!sum?.error && !sum?.warning && <SevIcon s="pass" className="h-4 w-4" />}
    </span>
  );

  const navigator = (
    <div className="min-w-0">
      {view.level === "types" && (
        <>
          {pageIssues.length > 0 && (
            <div className="mb-5 rounded-xl border border-rule bg-white px-5 py-3">
              {pageIssues.map((i, k) => (
                <IssueLine key={k} issue={i} />
              ))}
            </div>
          )}
          <p className="mb-3 text-sm text-ink-soft">
            {groups.length} type{groups.length === 1 ? "" : "s"} detected. Choose one to inspect it and see it in the source.
          </p>
          <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-white">
            {groups.map((g) => (
              <li key={g.name}>
                <button type="button" onClick={() => openGroup(g)} className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-mist/60">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{g.name}</span>
                    <span className="block text-sm text-ink-soft">
                      {g.items.length} item{g.items.length === 1 ? "" : "s"} · {[...new Set(g.items.map((i) => FORMAT_LABEL[i.format]))].join(", ")}
                    </span>
                  </span>
                  {counts(g.sum)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {view.level === "items" && group && (
        <>
          {back({ level: "types" })}
          <h3 className="text-xl font-semibold tracking-tight">
            {group.name} <span className="font-normal text-ink-soft">({group.items.length})</span>
          </h3>
          <ul className="mt-4 divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-white">
            {group.items.map((it, k) => {
              const title = itemTitle(it);
              return (
                <li key={it.uid}>
                  <button type="button" onClick={() => openItem(it, group.name)} className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors hover:bg-mist/60">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{title ?? `${group.name} ${k + 1}`}</span>
                      <span className="block text-sm text-ink-soft">
                        {FORMAT_LABEL[it.format]}
                        {it.loc ? ` · line ${report.html.slice(0, it.loc.start).split("\n").length}` : ""}
                      </span>
                    </span>
                    {counts(totals.get(it.uid))}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {view.level === "item" && item && (
        <>
          {back(group && group.items.length > 1 ? { level: "items", group: view.group } : { level: "types" })}
          {itemTitle(item) && <p className="mb-1 truncate text-sm text-ink-soft">{itemTitle(item)}</p>}
          <ItemView item={item} issuesByItem={issuesByItem} onPick={pick} activeAt={focus?.at} />
          <p className="mt-3 text-sm text-ink-soft">Select a property name to see it in the source.</p>
        </>
      )}
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
      <div className="order-2 min-w-0 lg:order-1">
        <div className="hidden lg:sticky lg:top-24 lg:block">
          <SourceViewer html={report.html} focus={focus} markers={markers} className="h-[calc(100vh-8rem)] min-h-[28rem]" />
        </div>
        <details open={sourceOpen} onToggle={(e) => setSourceOpen((e.target as HTMLDetailsElement).open)} className="lg:hidden">
          <summary className="cursor-pointer rounded-lg border border-rule bg-white px-4 py-3 font-medium">Page source</summary>
          {sourceOpen && <SourceViewer html={report.html} focus={focus} markers={markers} className="mt-3 h-[60vh]" />}
        </details>
      </div>
      <div className="order-1 min-w-0 lg:order-2">{navigator}</div>
    </div>
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

const WHERE = {
  page: { label: "On the page", tone: "text-pass", icon: "pass" as const },
  js: { label: "Only after JavaScript", tone: "text-serp", icon: "info" as const },
  missing: { label: "Not in the page HTML", tone: "text-warn", icon: "warning" as const },
};

function ContentView({ report }: { report: Report }) {
  if (report.content === null)
    return <Empty title="Fetch a URL to compare with the page" body="Content matching compares your structured data with the text visitors see. That needs the full page, so check a URL or paste the whole page source rather than just the JSON-LD." />;
  if (!report.content.length)
    return <Empty title="Nothing to compare" body="Content matching covers products, articles, events, recipes, jobs, local businesses, reviews and FAQs. None were found on this page." />;
  const where = (c: { where?: string; found: boolean }) => (c.where ?? (c.found ? "page" : "missing")) as keyof typeof WHERE;
  const missing = report.content.filter((c) => where(c) === "missing").length;
  const js = report.content.filter((c) => where(c) === "js").length;
  const total = report.content.length;
  return (
    <div>
      <p className="max-w-3xl text-ink-soft">
        Google&apos;s guidelines say structured data must describe content that is visible on the page. Values that aren&apos;t visible can make a page ineligible for rich results, or count as spammy markup.
      </p>
      <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-1 font-medium">
        <li className="text-pass">{total - missing - js} on the page</li>
        {js > 0 && <li className="text-serp">{js} only after JavaScript</li>}
        <li className={missing ? "text-warn" : "text-ink-soft"}>{missing} not in the page HTML</li>
      </ul>
      {missing > 0 && (
        <details className="mt-5 max-w-3xl rounded-xl border border-rule bg-white px-5 py-4 text-[0.95rem] leading-relaxed">
          <summary className="cursor-pointer font-semibold">What &ldquo;not in the page HTML&rdquo; means, and how to double-check</summary>
          <p className="mt-2 text-ink-soft">
            These values are in your structured data but not in the HTML {report.source.kind === "url" ? "the server sent" : "you pasted"}, either as visible text or as JavaScript data. Usually that means they aren&apos;t shown to visitors at all, which goes against Google&apos;s guidelines. Some sites, though, load sections such as FAQs from a separate request after the page opens, and this tool doesn&apos;t run JavaScript, so it can&apos;t see those.
          </p>
          <p className="mt-3 font-medium">To check against what visitors actually see:</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-ink-soft">
            <li>Open the page in Chrome and expand any &ldquo;View more&rdquo; or accordion sections.</li>
            <li>Open DevTools (F12), right-click the <code className="font-mono text-[0.85em]">&lt;html&gt;</code> element in the Elements panel, and choose Copy &gt; Copy outerHTML.</li>
            <li>Paste it into Paste code above and validate. Content match then compares against the rendered page.</li>
          </ol>
          <p className="mt-3 text-ink-soft">
            Anything still missing then isn&apos;t visible to users. Anything that now appears is rendered by JavaScript, so it&apos;s worth server-rendering for crawlers that don&apos;t run JavaScript.
          </p>
        </details>
      )}
      {js > 0 && (
        <div className="mt-5 max-w-3xl rounded-xl border border-serp/25 bg-serp/5 px-5 py-4 text-[0.95rem] leading-relaxed">
          <p className="font-semibold">Some content is added by JavaScript</p>
          <p className="mt-1 text-ink-soft">
            These values aren&apos;t in the HTML your server sends. The page&apos;s JavaScript adds them in the browser, which is client-side rendering. Google renders JavaScript, so it will usually see them, but rendering can be delayed, and many other crawlers and AI assistants read only the raw HTML. Rendering this content on the server is the safer option.
          </p>
        </div>
      )}
      <ul className="mt-6 divide-y divide-rule border-y border-rule">
        {report.content.map((c, k) => {
          const w = WHERE[where(c)];
          return (
            <li key={k} className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 py-3 md:grid-cols-[auto_minmax(0,19rem)_1fr_auto] md:gap-x-5">
              <SevIcon s={w.icon} className="mt-0.5 h-4 w-4" />
              <span className="break-all font-mono text-[0.85rem] text-ink-soft">
                {typeLabel(report.items[c.item]?.types ?? [])}.{c.prop}
              </span>
              <span className="col-start-2 break-words text-[0.92rem] md:col-start-auto">{c.value.length > 160 ? `${c.value.slice(0, 160)}…` : c.value}</span>
              <span className={`col-start-2 text-sm md:col-start-auto ${w.tone}`}>{w.label}</span>
            </li>
          );
        })}
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

// ---------- Rendering (SSR vs CSR) ----------

type Row = { s: Severity | "pass"; title: string; body: string };

function renderingRows(r: Rendering): Row[] {
  const rows: Row[] = [];
  const ssrFix =
    r.framework === "Next.js"
      ? " In Next.js, render this section in a Server Component (or with SSR/SSG) instead of only on the client."
      : r.framework === "Nuxt"
        ? " In Nuxt, keep this content in server-rendered components rather than client-only ones."
        : r.framework === "React" || r.framework === "Angular"
          ? ` For a ${r.framework} app, use server-side rendering or pre-rendering for these pages.`
          : "";

  if (r.schemaInServerHtml)
    rows.push({ s: "pass", title: "Structured data is in the server HTML", body: "Search engines and AI crawlers can read it without running JavaScript. This is the recommended setup." });
  else
    rows.push({
      s: "warning",
      title: "No structured data in the server HTML",
      body:
        r.tagManager || r.jsCreatesSchema || r.emptyAppShell
          ? "It may be added by JavaScript or Google Tag Manager after the page loads, which this check can't see. Google can process structured data added with JavaScript, but only after rendering, which can be delayed, and crawlers that don't run JavaScript never see it. Best practice: output JSON-LD in the server-rendered HTML."
          : "There's no structured data in the HTML this page sends.",
    });

  if (r.jsCreatesSchema)
    rows.push({ s: "warning", title: "JavaScript on this page writes structured data in the browser", body: "That markup isn't in the server HTML, so it isn't checked here and crawlers that don't run JavaScript miss it. Best practice: move it into the server-rendered HTML." });

  if (r.tagManager) {
    const checked = (r.gtm ?? []).filter((c) => c.checked);
    const withSchema = checked.filter((c) => c.schemaTags > 0);
    const ids = (r.gtm ?? []).map((c) => c.id).join(", ");
    if (withSchema.length) {
      const types = [...new Set(withSchema.flatMap((c) => c.types))];
      const tags = withSchema.reduce((n, c) => n + c.schemaTags, 0);
      rows.push({
        s: "warning",
        title: `Structured data is also added through Google Tag Manager (${withSchema.map((c) => c.id).join(", ")})`,
        body: `The container has ${tags} tag${tags === 1 ? "" : "s"} that write JSON-LD${types.length ? `, with ${types.join(", ")}` : ""}. That markup only exists after GTM runs in the browser, so it isn't in the server HTML and isn't validated here. Google can pick it up after rendering, but it's slower, other crawlers and AI assistants miss it, and it breaks easily when tags change. It can also duplicate or contradict the markup already in the page. Best practice: move it into the page template and remove the GTM tags.`,
      });
    } else if (checked.length) {
      rows.push({
        s: "pass",
        title: `No structured data in Google Tag Manager (${checked.map((c) => c.id).join(", ")})`,
        body: "Tag Manager is installed, but its container doesn't add any JSON-LD. Your schema isn't deployed through GTM, which is the recommended setup.",
      });
    } else {
      rows.push({
        s: "info",
        title: `Google Tag Manager is installed${ids ? ` (${ids})` : ""}`,
        body: "This doesn't mean your schema is in GTM. The container couldn't be checked, so if anyone adds structured data through Tag Manager, it wouldn't be validated here. Best practice: add schema to the page template, not through GTM.",
      });
    }
  }

  if (r.emptyAppShell)
    rows.push({ s: "warning", title: "The page is an empty app shell", body: `The server sends an empty container and JavaScript builds the page (client-side rendering). Crawlers get no content from the first HTML.${ssrFix || " Use server-side rendering or static generation."}` });

  if (r.csrValues > 0)
    rows.push({
      s: "warning",
      title: `${r.csrValues} value${r.csrValues === 1 ? "" : "s"} in your markup only appear${r.csrValues === 1 ? "s" : ""} after JavaScript runs`,
      body: `The content your structured data describes is rendered in the browser (CSR), not sent by the server. Google usually sees it after rendering, but rendering can be delayed, and many other crawlers and AI assistants read only the raw HTML. Best practice: server-side render (SSR) this content so the visible text and the markup arrive together.${ssrFix} Details are under Content match.`,
    });
  else if (r.schemaInServerHtml && !r.missingValues)
    rows.push({ s: "pass", title: "The content your markup describes is in the server HTML", body: "Nothing it relies on needs JavaScript to appear." });

  if (r.missingValues > 0)
    rows.push({
      s: "warning",
      title: `${r.missingValues} value${r.missingValues === 1 ? " in your markup isn't" : "s in your markup aren't"} in the page HTML at all`,
      body: "They're either not shown to visitors, which goes against Google's guidelines, or loaded later by JavaScript from a separate request, which this tool can't run. Content match explains how to check against the rendered page. Either way, the content your structured data describes should be in the server HTML.",
    });

  return rows;
}

function RenderingPanel({ r }: { r: Rendering }) {
  const rows = renderingRows(r);
  const ok = rows.every((x) => x.s === "pass" || x.s === "info");
  return (
    <section aria-labelledby="rendering-heading" className="mt-6 rounded-xl border border-rule bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule px-5 py-3.5">
        <h3 id="rendering-heading" className="font-semibold">
          Rendering check: {ok ? "server-side, as recommended" : "parts of this page rely on JavaScript"}
        </h3>
        {r.framework && <p className="text-sm text-ink-soft">Built with {r.framework}</p>}
      </div>
      <ul className="divide-y divide-rule">
        {rows.map((x) => (
          <li key={x.title} className="flex gap-3 px-5 py-3.5">
            <SevIcon s={x.s} className="mt-0.5 h-4 w-4" />
            <div className="min-w-0">
              <p className="font-medium leading-snug">{x.title}</p>
              <p className="mt-1 max-w-4xl text-[0.93rem] leading-relaxed text-ink-soft">{x.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- Archived copy notice ----------

function ArchivedNote({ a, liveUrl, onPasteCode }: { a: NonNullable<Report["source"]["archived"]>; liveUrl?: string; onPasteCode: () => void }) {
  const days = a.ageDays;
  const date = new Date(a.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const old = days > 30;
  return (
    <div className={`mt-3 max-w-3xl rounded-lg border px-4 py-3 text-[0.93rem] leading-relaxed ${old ? "border-warn/30 bg-warn/5" : "border-serp/25 bg-serp/5"}`}>
      <p className="font-medium">
        Checked the Internet Archive&apos;s copy from {date} ({days === 0 ? "today" : days === 1 ? "1 day old" : `${days} days old`})
      </p>
      <p className="mt-0.5 text-ink-soft">
        The site {a.reason}, which is how many sites block automated requests, so the latest archived copy of the page was checked instead.
        {old ? " It's more than a month old, so recent changes to the page won't show." : " Changes made since then won't show."}{" "}
        <a href={a.snapshotUrl} target="_blank" rel="noopener nofollow" className="text-serp hover:underline">
          View the archived copy
        </a>
      </p>

      <div className="mt-3 border-t border-rule/70 pt-3">
        <p className="font-medium">To check the live page instead</p>
        <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-ink-soft">
          <li>
            {liveUrl ? (
              <a href={liveUrl} target="_blank" rel="noopener nofollow" className="text-serp hover:underline">
                Open the live page
              </a>
            ) : (
              "Open the page"
            )}{" "}
            in your browser.
          </li>
          <li>
            Press <Kbd>Ctrl</Kbd> + <Kbd>U</Kbd> to view its source (<Kbd>Cmd</Kbd> + <Kbd>Option</Kbd> + <Kbd>U</Kbd> on a Mac).
          </li>
          <li>
            Select everything with <Kbd>Ctrl</Kbd> + <Kbd>A</Kbd> and copy it with <Kbd>Ctrl</Kbd> + <Kbd>C</Kbd> (<Kbd>Cmd</Kbd> + <Kbd>A</Kbd>, <Kbd>Cmd</Kbd> + <Kbd>C</Kbd> on a Mac).
          </li>
          <li>
            Come back here,{" "}
            <button type="button" onClick={onPasteCode} className="font-medium text-serp hover:underline">
              switch to Paste code
            </button>
            , paste with <Kbd>Ctrl</Kbd> + <Kbd>V</Kbd> and select Validate code.
          </li>
        </ol>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-rule bg-white px-1.5 py-px font-mono text-[0.8em] text-ink shadow-[0_1px_0_#D9E0EA]">{children}</kbd>;
}

// ---------- Report for developers ----------

function plainReport(report: Report): string {
  const lines: string[] = [];
  lines.push(`Structured data report: ${report.source.finalUrl ?? report.source.url ?? "pasted code"}`);
  lines.push(`Checked with SEO People Hub's Schema Validator (schema.org ${report.vocabVersion})`);
  if (report.source.archived) lines.push(`Note: the site blocked automated requests, so this checks the Internet Archive's copy from ${report.source.archived.date.slice(0, 10)} (${report.source.archived.snapshotUrl}).`);
  lines.push(`${report.counts.errors} errors, ${report.counts.warnings} warnings, ${report.counts.info} notes`, "");
  if (report.rendering) {
    const rows = renderingRows(report.rendering).filter((x) => x.s !== "pass");
    if (rows.length) {
      lines.push("RENDERING (SSR vs CSR)");
      for (const x of rows) lines.push(`- ${x.title}. ${x.body}`);
      lines.push("");
    }
  }
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
  const missing = report.content?.filter((c) => c.where === "missing") ?? [];
  if (missing.length) {
    lines.push("IN STRUCTURED DATA BUT NOT IN THE PAGE HTML (not shown to users, or loaded later by JavaScript)");
    for (const c of missing) lines.push(`- ${c.prop}: ${c.value.slice(0, 120)}`);
    lines.push("");
  }
  const jsOnly = report.content?.filter((c) => c.where === "js") ?? [];
  if (jsOnly.length) {
    lines.push("VISIBLE ONLY AFTER JAVASCRIPT RUNS (not in the server HTML)");
    for (const c of jsOnly) lines.push(`- ${c.prop}: ${c.value.slice(0, 120)}`);
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
    const q = new URLSearchParams(window.location.search);
    const shared = q.get("url");
    if (!shared || q.get("mode")) return;
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

  const tabs: { id: Tab; label: string; n?: number; s?: Severity }[] = report
    ? [
        { id: "items", label: "Items", n: report.counts.errors, s: "error" },
        { id: "google", label: "Google features", n: report.richResults.filter((r) => r.status === "invalid").length, s: "error" },
        { id: "content", label: "Content match", n: report.content?.filter((c) => (c.where ?? (c.found ? "page" : "missing")) === "missing").length ?? 0, s: "warning" },
        { id: "graph", label: "Entity graph", n: report.graph.edges.filter((e) => !e.resolved).length, s: "warning" },
        { id: "source", label: "Formatted JSON-LD" },
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
                  {report.source.archived && (
                    <ArchivedNote
                      a={report.source.archived}
                      liveUrl={report.source.finalUrl}
                      onPasteCode={() => {
                        setMode("code");
                        setCode("");
                        window.scrollTo({ top: 0 });
                        setTimeout(() => document.getElementById("sv-code")?.focus(), 50);
                      }}
                    />
                  )}
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

          {report.rendering && <RenderingPanel r={report.rendering} />}

          <div role="tablist" aria-label="Results" className="-mx-1 mt-6 flex gap-1 overflow-x-auto pb-1">
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
            {tab === "items" && <Inspector key={report.html.length + report.counts.items} report={report} issuesByItem={issuesByItem} totals={totals} pageIssues={pageIssues} />}
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
