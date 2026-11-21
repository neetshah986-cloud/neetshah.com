"use client";

import { useEffect, useState } from "react";
import { GscHelper } from "./GscHelper";
import { Leaderboard } from "./Leaderboard";
import { PageSpeed } from "./PageSpeed";
import { PageTypes } from "./PageTypes";

type Mode = "page" | "leaderboard" | "types" | "gsc";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "page", label: "Test a page", hint: "One page on mobile and desktop, with causes and fixes. Add a competitor to compare." },
  { id: "leaderboard", label: "Speed leaderboard", hint: "Your page against up to 5 pages ranking for the same keyword." },
  { id: "types", label: "Page types", hint: "Find which template is slow: home, category, product, blog." },
  { id: "gsc", label: "Search Console", hint: "Upload a Core Web Vitals export and get the cause and fix for each URL group." },
];

export function SpeedTool() {
  const [mode, setMode] = useState<Mode>("page");

  // Links can open a mode directly: ?mode=leaderboard, ?mode=types, ?mode=gsc
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("mode") as Mode | null;
    if (m && MODES.some((x) => x.id === m) && m !== "page") {
      const t = setTimeout(() => setMode(m), 0);
      return () => clearTimeout(t);
    }
  }, []);

  function choose(m: Mode) {
    setMode(m);
    const u = new URL(window.location.href);
    u.search = "";
    if (m !== "page") u.searchParams.set("mode", m);
    window.history.replaceState(null, "", u);
  }

  const active = MODES.find((m) => m.id === mode)!;
  return (
    <div>
      <div role="tablist" aria-label="What to test" className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-mist p-1 sm:flex">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            aria-controls="speed-mode"
            onClick={() => choose(m.id)}
            className={`flex-1 rounded-lg px-3 py-2.5 sm:px-4 text-[0.95rem] font-medium whitespace-nowrap transition-colors ${mode === m.id ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="mb-4 text-[0.95rem] text-ink-soft">{active.hint}</p>
      <div id="speed-mode" role="tabpanel">
        {mode === "page" && <PageSpeed />}
        {mode === "leaderboard" && <Leaderboard />}
        {mode === "types" && <PageTypes />}
        {mode === "gsc" && <GscHelper />}
      </div>
    </div>
  );
}
