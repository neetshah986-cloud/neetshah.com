"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { SchemaValidator } from "./SchemaValidator";

type Mode = "page" | "compare" | "gsc";

const Loading = () => <div className="h-56 animate-pulse rounded-2xl border border-rule bg-white motion-reduce:animate-none" aria-label="Loading" />;
const SchemaCompare = dynamic(() => import("./SchemaCompare").then((m) => m.SchemaCompare), { loading: Loading });
const SchemaGsc = dynamic(() => import("./SchemaGsc").then((m) => m.SchemaGsc), { loading: Loading });

const MODES: { id: Mode; label: string; short?: string; hint: string }[] = [
  { id: "page", label: "Check a page", hint: "Validate one page or a pasted snippet against schema.org and Google's rich result rules." },
  { id: "compare", label: "Compare with competitors", short: "Compare", hint: "Your page against up to 5 pages ranking for the same keyword: which rich results each can show, and what you're missing." },
  { id: "gsc", label: "Search Console", hint: "Upload a rich result issue from Search Console: each example page is checked, with the missing field and the fixed JSON-LD." },
];

export function SchemaTool() {
  const [mode, setMode] = useState<Mode>("page");

  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("mode") as Mode | null;
    if (m && m !== "page" && MODES.some((x) => x.id === m)) {
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
      <div role="tablist" aria-label="What to do" className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-mist p-1 sm:flex">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            aria-label={m.label}
            onClick={() => choose(m.id)}
            className={`flex-1 rounded-lg px-2 py-2.5 text-[0.85rem] sm:text-[0.95rem] font-medium whitespace-nowrap transition-colors sm:px-4 ${mode === m.id ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}
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
      <div role="tabpanel">
        {mode === "page" && <SchemaValidator />}
        {mode === "compare" && <SchemaCompare />}
        {mode === "gsc" && <SchemaGsc />}
      </div>
    </div>
  );
}
