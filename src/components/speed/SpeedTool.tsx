"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { PageSpeed } from "./PageSpeed";

// Only "Test a page" loads with the page; the other modes load when their tab is opened.
const Loading = () => <div className="h-56 animate-pulse rounded-2xl border border-rule bg-white motion-reduce:animate-none" aria-label="Loading" />;
const Leaderboard = dynamic(() => import("./Leaderboard").then((m) => m.Leaderboard), { loading: Loading });
const PageTypes = dynamic(() => import("./PageTypes").then((m) => m.PageTypes), { loading: Loading });
const GscHelper = dynamic(() => import("./GscHelper").then((m) => m.GscHelper), { loading: Loading });

type Mode = "page" | "compare" | "leaderboard" | "types" | "gsc";

const MODES: { id: Mode; label: string; short?: string; hint: string }[] = [
  { id: "page", label: "Test a page", hint: "One page on mobile and desktop, with the causes and the fixes." },
  { id: "compare", label: "Compare with a competitor", short: "Compare", hint: "Your page against one competitor's page, head to head: who's faster, why, and what to change." },
  { id: "leaderboard", label: "Speed leaderboard", hint: "Your page against up to 5 pages ranking for the same keyword." },
  { id: "types", label: "Page types", hint: "Find which template is slow: home, category, product, blog." },
  { id: "gsc", label: "Search Console", hint: "Upload a Core Web Vitals export and get the cause and fix for each URL group." },
];

export function SpeedTool() {
  const [mode, setMode] = useState<Mode>("page");

  // Links can open a mode directly: ?mode=compare, ?mode=leaderboard, ?mode=types, ?mode=gsc (a shared comparison has &vs=)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const m = (q.get("mode") ?? (q.get("vs") && q.get("url") ? "compare" : null)) as Mode | null;
    if (m && MODES.some((x) => x.id === m) && m !== "page") {
      const t = setTimeout(() => setMode(m), 0);
      return () => clearTimeout(t);
    }
  }, []);

  function choose(m: Mode) {
    setMode(m);
    const u = new URL(window.location.href);
    // Switching between Test a page and Compare keeps the page being tested.
    const keep = (m === "page" || m === "compare") && (mode === "page" || mode === "compare");
    const url = u.searchParams.get("url");
    u.search = "";
    if (keep && url) u.searchParams.set("url", url);
    if (m !== "page") u.searchParams.set("mode", m);
    window.history.replaceState(null, "", u);
  }

  const active = MODES.find((m) => m.id === mode)!;
  return (
    <div>
      <div role="tablist" aria-label="What to test" className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-mist p-1 lg:flex">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            aria-label={m.label}
            aria-controls="speed-mode"
            onClick={() => choose(m.id)}
            className={`flex-1 rounded-lg px-3 py-2.5 last:col-span-2 lg:px-4 text-[0.95rem] font-medium whitespace-nowrap transition-colors ${mode === m.id ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}
          >
            {m.short ? (
              <>
                <span className="sm:hidden">{m.short}</span>
                <span className="hidden sm:inline">{m.label}</span>
              </>
            ) : (
              m.label
            )}
          </button>
        ))}
      </div>
      <p className="mb-4 text-[0.95rem] text-ink-soft">{active.hint}</p>
      <div id="speed-mode" role="tabpanel">
        {(mode === "page" || mode === "compare") && <PageSpeed compare={mode === "compare"} onCompare={(on) => choose(on ? "compare" : "page")} />}
        {mode === "leaderboard" && <Leaderboard />}
        {mode === "types" && <PageTypes />}
        {mode === "gsc" && <GscHelper />}
      </div>
    </div>
  );
}
