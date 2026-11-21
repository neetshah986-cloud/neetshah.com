"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { fetchRun } from "@/lib/speed/client";
import { hostOf } from "@/lib/speed/compare";
import { forget, remember, type Snapshot } from "@/lib/speed/history";
import type { Rating } from "@/lib/speed/metrics";
import { prefetchTrend } from "@/lib/speed/trend-client";
import type { SpeedRun, Strategy } from "@/lib/speed/types";
import type { ResultTab } from "./Report";
import { RatingIcon } from "./ui";

// The report and the comparison are only needed once a result arrives, so they load separately
// and the tool itself stays light.
const RunView = dynamic(() => import("./Report").then((m) => m.RunView), { loading: () => <ReportLoading /> });
const VersusSection = dynamic(() => import("./Versus").then((m) => m.VersusSection), { loading: () => <ReportLoading /> });

function ReportLoading() {
  return <div className="h-64 animate-pulse rounded-2xl border border-rule bg-white motion-reduce:animate-none" aria-label="Loading the report" />;
}

const TONE: Record<Rating, { text: string }> = { good: { text: "text-pass" }, ni: { text: "text-warn" }, poor: { text: "text-fail" } };

// ---------- the tool ----------

const STEPS = ["Sending the page to Google's Lighthouse", "Loading it on a throttled phone and a desktop", "Measuring LCP, CLS and blocking time", "Reading real-user data from Chrome", "Working out the root causes"];

type State = { run?: SpeedRun; error?: string; loading: boolean; earlier?: Snapshot[] };
type Pair = Record<Strategy, State>;
type Who = "you" | "them";
type Mode = "versus" | "you" | "them";

const EMPTY: Pair = { mobile: { loading: false }, desktop: { loading: false } };

function DeviceTabs({ tab, setTab, you, them }: { tab: Strategy; setTab: (s: Strategy) => void; you: Pair; them?: Pair }) {
  const chip = (st: State) => (
    <>
      {st.loading && <span className="h-3 w-3 animate-spin rounded-full border-2 border-ink-soft/30 border-t-serp motion-reduce:animate-none" aria-label="Testing" />}
      {st.run && <span className={`text-xs font-semibold ${TONE[st.run.score >= 90 ? "good" : st.run.score >= 50 ? "ni" : "poor"].text}`}>{st.run.score}</span>}
      {st.error && <span className="h-2 w-2 rounded-full bg-fail" aria-label="Failed" />}
    </>
  );
  return (
    <div role="tablist" aria-label="Device" className="inline-flex rounded-lg bg-mist p-1 text-sm">
      {(["mobile", "desktop"] as Strategy[]).map((s) => (
        <button key={s} role="tab" aria-selected={tab === s} onClick={() => setTab(s)} className={`flex items-center gap-2 rounded-md px-4 py-1.5 font-medium transition-colors ${tab === s ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}>
          {s === "mobile" ? "Mobile" : "Desktop"}
          {chip(you[s])}
          {them && (
            <>
              <span className="text-ink-soft/50">vs</span>
              {chip(them[s])}
            </>
          )}
        </button>
      ))}
    </div>
  );
}

function Testing({ label, elapsed }: { label: string; elapsed: number }) {
  const step = Math.min(STEPS.length - 1, Math.floor(elapsed / 7));
  return (
    <div className="rounded-2xl border border-rule bg-white p-6" aria-live="polite">
      <p className="text-lg font-semibold tracking-tight">
        Testing {label}… {elapsed}s
      </p>
      <ol className="mt-4 space-y-2">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex items-center gap-2.5 text-[0.95rem] ${i < step ? "text-ink" : i === step ? "font-medium text-ink" : "text-ink-soft/60"}`}>
            {i < step ? (
              <RatingIcon r="good" className="h-4 w-4" />
            ) : i === step ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-soft/30 border-t-serp motion-reduce:animate-none" />
            ) : (
              <span className="h-4 w-4 rounded-full border-2 border-rule" />
            )}
            {s}
          </li>
        ))}
      </ol>
      {elapsed > 45 && <p className="mt-4 text-sm text-ink-soft">This page is slow to test. Heavy pages can take Google up to two minutes, so keep this tab open.</p>}
    </div>
  );
}

function Failed({ text }: { text: string }) {
  return (
    <p role="alert" className="flex gap-2 rounded-lg bg-fail/10 px-4 py-3 text-fail">
      <RatingIcon r="poor" className="mt-0.5 h-4 w-4" />
      {text}
    </p>
  );
}

/** `compare` shows the competitor box; the Compare tab above the tool controls it through `onCompare`. */
export function PageSpeed({ compare = false, onCompare }: { compare?: boolean; onCompare?: (on: boolean) => void } = {}) {
  const [url, setUrl] = useState("");
  const [compUrl, setCompUrl] = useState("");
  const withComp = compare;
  const setWithComp = (on: boolean) => onCompare?.(on);
  const [tab, setTab] = useState<Strategy>("mobile");
  const [view, setView] = useState<ResultTab>("overview");
  const [mode, setMode] = useState<Mode>("you");
  const [focus, setFocus] = useState<{ audit: string; n: number } | null>(null);
  const [state, setState] = useState<Pair>(EMPTY);
  const [comp, setComp] = useState<Pair | null>(null);
  const [started, setStarted] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);
  const loading = state.mobile.loading || state.desktop.loading || !!comp?.mobile.loading || !!comp?.desktop.loading;

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [loading]);

  async function runOne(who: Who, strategy: Strategy, target: string, fresh: boolean) {
    const set = (st: State) => (who === "you" ? setState((s) => ({ ...s, [strategy]: st })) : setComp((s) => ({ ...(s ?? EMPTY), [strategy]: st })));
    set({ loading: true });
    try {
      const run = await fetchRun(target, strategy, fresh);
      prefetchTrend(run.finalUrl, strategy);
      set({ loading: false, run, earlier: remember(run) });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : "The test failed. Try again." });
    }
  }

  function start() {
    const t = Date.now();
    setStarted(t);
    setNow(t);
  }

  function run(target = url, fresh = false, vs = withComp ? compUrl : "") {
    if (!target.trim()) return;
    const other = vs.trim();
    start();
    setView("overview");
    setMode(other ? "versus" : "you");
    const u = new URL(window.location.href);
    u.searchParams.set("url", target.trim());
    if (other) u.searchParams.set("vs", other);
    else u.searchParams.delete("vs");
    window.history.replaceState(null, "", u);
    runOne("you", "mobile", target.trim(), fresh);
    runOne("you", "desktop", target.trim(), fresh);
    if (other) {
      setComp(EMPTY);
      runOne("them", "mobile", other, fresh);
      runOne("them", "desktop", other, fresh);
    } else setComp(null);
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ block: "start" }));
  }

  /** "Did my fix work?": test only your page again, skipping every cache. */
  function retest() {
    const r = state[tab].run;
    if (!r) return;
    start();
    setMode("you");
    setView("overview");
    runOne("you", "mobile", r.requestedUrl, true);
    runOne("you", "desktop", r.requestedUrl, true);
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ block: "start" }));
  }

  // Shared links: ?url=https://example.com runs straight away; &vs= adds a competitor.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const shared = q.get("url");
    const m = q.get("mode");
    if (!shared || (m && m !== "compare")) return;
    const vs = q.get("vs") ?? "";
    const t = setTimeout(() => {
      setUrl(shared);
      if (vs) {
        setCompUrl(vs);
        setWithComp(true);
      }
      run(shared, false, vs);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const elapsed = started ? Math.max(0, Math.round((now - started) / 1000)) : 0;
  const mine = state[tab];
  const theirs = comp?.[tab];
  const shown = mode === "them" && comp ? comp : state;
  const current = shown[tab];
  const any = state.mobile.run || state.desktop.run || state.mobile.error || state.desktop.error || loading;
  const compHost = comp && (comp.mobile.run ?? comp.desktop.run) ? hostOf((comp.mobile.run ?? comp.desktop.run)!.finalUrl) : compUrl ? hostOf(compUrl.replace(/^(?!https?:)/, "https://")) : "Competitor";

  return (
    <div>
      <div className="rounded-2xl border border-rule bg-white p-4 shadow-[0_1px_0_#D9E0EA,0_24px_48px_-32px_rgba(14,26,43,0.3)] sm:p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <label htmlFor="ps-url" className="sr-only">Page URL</label>
            <input
              id="ps-url"
              type="text"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              placeholder="https://example.com/page"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-rule bg-paper px-4 py-3 font-mono text-[0.95rem] outline-none transition-colors placeholder:text-ink-soft/60 focus:border-serp focus:bg-white"
            />
            <button type="submit" disabled={loading || !url.trim() || (withComp && !compUrl.trim())} className="rounded-lg bg-ink px-6 py-3 font-medium text-paper transition-colors hover:bg-serp disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? "Testing…" : withComp ? "Compare speed" : "Test page speed"}
            </button>
          </div>
          {withComp && (
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <label htmlFor="ps-vs" className="shrink-0 text-sm font-medium text-ink-soft sm:w-28">
                Competitor
              </label>
              <input
                id="ps-vs"
                type="text"
                inputMode="url"
                spellCheck={false}
                placeholder="https://competitor.com/similar-page"
                value={compUrl}
                onChange={(e) => setCompUrl(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-rule bg-paper px-4 py-3 font-mono text-[0.95rem] outline-none transition-colors placeholder:text-ink-soft/60 focus:border-serp focus:bg-white"
              />
              <button type="button" onClick={() => setWithComp(false)} className="shrink-0 text-sm font-medium text-ink-soft hover:text-ink hover:underline">
                Remove
              </button>
            </div>
          )}
        </form>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="text-sm text-ink-soft">
            {withComp ? "Tests both pages on mobile and desktop at the same time, then shows who's faster and why." : "Tests mobile and desktop at the same time on Google's servers. It usually takes 20 to 40 seconds, and up to two minutes for heavy pages."}
          </p>
          {!withComp && (
            <button type="button" onClick={() => setWithComp(true)} className="text-sm font-medium text-serp hover:underline">
              Compare with a competitor
            </button>
          )}
        </div>
      </div>

      <div ref={resultsRef} className="scroll-mt-24">
        {any && (
          <div className="mt-8">
            {comp && (
              <div role="tablist" aria-label="What to show" className="mb-4 flex flex-wrap gap-2">
                {(
                  [
                    ["versus", "Head to head"],
                    ["you", "Your page"],
                    ["them", compHost],
                  ] as [Mode, string][]
                ).map(([m, label]) => (
                  <button
                    key={m}
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => setMode(m)}
                    className={`max-w-[16rem] truncate rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${mode === m ? "border-ink bg-ink text-paper" : "border-rule bg-white text-ink-soft hover:border-ink-soft hover:text-ink"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <DeviceTabs tab={tab} setTab={setTab} you={mode === "them" && comp ? comp : state} them={mode === "versus" && comp ? comp : undefined} />
              {mine.run && !loading && (
                <button type="button" onClick={() => run(mine.run!.requestedUrl, true, comp ? (theirs?.run?.requestedUrl ?? compUrl) : "")} className="text-sm font-medium text-serp hover:underline">
                  Run again
                </button>
              )}
            </div>

            <div className="mt-6">
              {mode === "versus" && comp ? (
                mine.loading || theirs?.loading ? (
                  <Testing label={`both ${tab} pages`} elapsed={elapsed} />
                ) : mine.error || theirs?.error ? (
                  <Failed text={mine.error ? `Your page: ${mine.error}` : `${compHost}: ${theirs?.error}`} />
                ) : mine.run && theirs?.run ? (
                  <VersusSection
                    key={mine.run.fetchedAt + theirs.run.fetchedAt}
                    you={mine.run}
                    them={theirs.run}
                    onFix={(audit) => {
                      setMode("you");
                      setView("fixes");
                      setFocus({ audit, n: Date.now() });
                    }}
                  />
                ) : null
              ) : (
                <>
                  {current.loading && <Testing label={`the ${tab} page`} elapsed={elapsed} />}
                  {current.error && !current.loading && <Failed text={current.error} />}
                  {current.run && !current.loading && (
                    <RunView
                      key={current.run.fetchedAt + tab + mode}
                      run={current.run}
                      other={shown[tab === "mobile" ? "desktop" : "mobile"].run}
                      view={view}
                      setView={setView}
                      earlier={mode === "you" ? current.earlier : undefined}
                      onRetest={retest}
                      onForget={() => {
                        forget(current.run!);
                        setState((s) => ({ ...s, [tab]: { ...s[tab], earlier: [] } }));
                      }}
                      focusAudit={mode === "you" ? focus?.audit : undefined}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
