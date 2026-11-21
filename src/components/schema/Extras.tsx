"use client";

import { useEffect, useRef } from "react";
import { SCHEMA_GLOSSARY } from "@/lib/schema/glossary";
import { compareSnapshots, snapshot, type SchemaSnapshot } from "@/lib/schema/history";
import { schemaDoFirst } from "@/lib/schema/plain";
import type { Report } from "@/lib/schema/types";
import { Glossed } from "../speed/Glossary";

export const G = ({ text }: { text: string }) => <Glossed text={text} list={SCHEMA_GLOSSARY} />;

/** The Schema inspector bookmark and how to use it. */
export function InspectorPanel() {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    fetch("/schema-inspector.js")
      .then((r) => r.text())
      .then((t) => {
        const code = t.replace("__ORIGIN__", window.location.origin);
        // React won't render javascript: links, so the bookmarklet's address is set directly.
        ref.current?.setAttribute("href", `javascript:${encodeURIComponent(code)}`);
      })
      .catch(() => {});
  }, []);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <p className="font-medium">Check the page your browser sees, including JavaScript and Tag Manager</p>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-soft">
          The Schema inspector is a bookmark. On any page, click it: it takes the page exactly as your browser shows it, with the structured data that JavaScript or Google Tag Manager added, and opens it here, checked. It works on sites that block automated tools, and on pages behind a login.
        </p>
        <a
          ref={ref}
          href="#schema-inspector"
          onClick={(e) => e.preventDefault()}
          draggable
          title="Drag me to your bookmarks bar"
          className="mt-4 inline-flex cursor-grab items-center gap-2 rounded-lg bg-ink px-4 py-2.5 font-medium text-paper active:cursor-grabbing"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
            <path d="M5 3h10v14l-5-3.5L5 17z" fill="currentColor" />
          </svg>
          Schema inspector
        </a>
      </div>
      <ol className="space-y-2.5 text-[0.95rem] leading-relaxed">
        {[
          "Drag the Schema inspector button to your bookmarks bar (show it with Ctrl + Shift + B, or Cmd + Shift + B on a Mac).",
          "Open the page you want to check and let it load fully. Accept the cookie banner if it has one.",
          "Click the bookmark. A new tab opens here with the result. If your browser blocks pop-ups, allow them for that site and click again.",
          "The result also tells you which types only appear after the page loads, so you can see what JavaScript or Tag Manager adds.",
        ].map((s, i) => (
          <li key={s} className="flex gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mist text-xs font-semibold">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Shown instead of the rendering check when the page came from the Schema inspector. */
export function RenderedPanel({ r }: { r: NonNullable<Report["source"]["rendered"]> }) {
  return (
    <section className="mt-6 rounded-xl border border-rule bg-white">
      <div className="border-b border-rule px-5 py-3.5">
        <h3 className="font-semibold">Checked as your browser rendered it</h3>
      </div>
      <ul className="divide-y divide-rule text-[0.93rem] leading-relaxed">
        <li className="px-5 py-3.5">This includes everything JavaScript and Google Tag Manager added after the page loaded, and the content match uses the text visitors actually see.</li>
        {r.serverChecked ? (
          r.addedTypes.length ? (
            <li className="px-5 py-3.5">
              <p className="font-medium text-warn">Only after the page loads: {r.addedTypes.join(", ")}</p>
              <p className="mt-1 text-ink-soft">
                <G text="The server HTML doesn't have these types; JavaScript or Tag Manager adds them in the browser. Google can usually read them after rendering, but it's slower and other crawlers and AI assistants miss them. Best practice: output them in the page template." />
              </p>
            </li>
          ) : (
            <li className="px-5 py-3.5">
              <p className="font-medium text-pass">Every type here is also in the server HTML</p>
              <p className="mt-1 text-ink-soft">Nothing depends on JavaScript or Tag Manager to appear, which is the recommended setup.</p>
            </li>
          )
        ) : (
          <li className="px-5 py-3.5 text-ink-soft">The server HTML couldn&apos;t be fetched to compare (the site blocks automated requests), so this checks the rendered page only.</li>
        )}
      </ul>
    </section>
  );
}

export function DoFirst({ report, onTab }: { report: Report; onTab: (t: "items" | "google" | "content" | "source") => void }) {
  const f = schemaDoFirst(report);
  if (!f) return null;
  return (
    <div className="mt-5 flex flex-col gap-2 rounded-lg bg-serp/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[0.95rem] leading-relaxed">
        <span className="font-semibold">Do this first:</span> <G text={f.text} />
      </p>
      {f.tab && (
        <button type="button" onClick={() => onTab(f.tab!)} className="shrink-0 self-start rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper hover:bg-serp sm:self-auto">
          Show me
        </button>
      )}
    </div>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const STATUS: Record<string, string> = { eligible: "eligible", warnings: "eligible with warnings", invalid: "broken", retired: "retired", limited: "limited" };

/** "Did my fix work?" compared with the last check of the same page. */
export function FixCheck({ prev, report, onAgain, onClear }: { prev: SchemaSnapshot; report: Report; onAgain: () => void; onClear: () => void }) {
  const c = compareSnapshots(prev, snapshot(report));
  const border = c.verdict === "better" ? "border-pass/40" : c.verdict === "worse" ? "border-fail/40" : "border-rule";
  const headline =
    c.verdict === "better" && !c.fixed.length && c.rich.some((r) => r.better)
      ? `It worked: ${c.rich.filter((r) => r.better).map((r) => r.feature.toLowerCase()).join(", ")} improved.`
      : c.verdict === "better"
      ? `It worked:${c.fixed.length} issue${c.fixed.length === 1 ? "" : "s"} fixed${c.added.length ? `, ${c.added.length} new` : ""}.`
      : c.verdict === "worse"
        ? `It got worse: ${c.added.length} new issue${c.added.length === 1 ? "" : "s"}${c.fixed.length ? `, ${c.fixed.length} fixed` : ""}.`
        : c.fixed.length || c.added.length
          ? `${c.fixed.length} fixed, ${c.added.length} new since then.`
          : "No change since your last check.";
  return (
    <section aria-label="Did my fix work?" className={`mt-6 rounded-xl border-2 ${border} bg-white p-5`}>
      <p className="text-sm text-ink-soft">Did my fix work? Compared with your check on {when(c.since)}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{headline}</p>
      <p className="mt-1 text-sm text-ink-soft">
        Errors {c.errors[0]} to {c.errors[1]}, warnings {c.warnings[0]} to {c.warnings[1]}.
      </p>
      {c.rich.length > 0 && (
        <ul className="mt-3 space-y-1 text-[0.95rem]">
          {c.rich.map((r) => (
            <li key={r.feature} className={r.better ? "text-pass" : "text-fail"}>
              {r.feature}: {r.before ? STATUS[r.before] : "not there"} to {r.after ? STATUS[r.after] : "not there"}
            </li>
          ))}
        </ul>
      )}
      {(c.fixed.length > 0 || c.added.length > 0) && (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {c.fixed.length > 0 && (
            <div>
              <p className="text-sm font-medium text-pass">Fixed</p>
              <ul className="mt-1 space-y-0.5 text-sm text-ink-soft">
                {c.fixed.slice(0, 6).map((i) => (
                  <li key={i.key}>{i.message}</li>
                ))}
              </ul>
            </div>
          )}
          {c.added.length > 0 && (
            <div>
              <p className="text-sm font-medium text-fail">New</p>
              <ul className="mt-1 space-y-0.5 text-sm text-ink-soft">
                {c.added.slice(0, 6).map((i) => (
                  <li key={i.key}>{i.message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-4 border-t border-rule pt-3 text-sm">
        <button type="button" onClick={onAgain} className="font-medium text-serp hover:underline">
          Check again
        </button>
        <button type="button" onClick={onClear} className="text-ink-soft hover:text-ink hover:underline">
          Clear saved checks
        </button>
        <span className="text-ink-soft">Saved only in this browser.</span>
      </div>
    </section>
  );
}
