import Link from "next/link";
import { statusLabel, type Tool } from "@/lib/tools";

// Tools as rows: the name and what it checks carry the weight, not a card grid.
export function ToolList({ tools }: { tools: Tool[] }) {
  return (
    <ul className="divide-y divide-rule border-y border-rule">
      {tools.map((tool) => (
        <li key={tool.slug}>
          <Link
            href={`/tools/${tool.slug}`}
            className="group grid gap-x-8 gap-y-3 py-7 transition-colors hover:bg-mist/50 sm:grid-cols-[11rem_1fr_auto] sm:px-3"
          >
            <span className="text-sm text-ink-soft sm:pt-1">{tool.category}</span>
            <span className="min-w-0">
              <span className="block text-xl font-semibold tracking-tight group-hover:text-serp">
                {tool.name}
              </span>
              <span className="mt-1.5 block max-w-2xl text-[0.975rem] leading-relaxed text-ink-soft">
                {tool.tagline}
              </span>
              <span className="mt-3.5 flex flex-wrap gap-1.5">
                {tool.signals.map((s) => (
                  <span key={s} className="rounded-md bg-mist px-2 py-0.5 text-[0.8rem] text-ink-soft">
                    {s}
                  </span>
                ))}
              </span>
            </span>
            <span className="self-start text-sm sm:pt-1">
              <span
                className={
                  tool.status === "live"
                    ? "inline-flex items-center gap-1.5 text-pass"
                    : "inline-flex items-center gap-1.5 text-ink-soft"
                }
              >
                <span
                  className={
                    tool.status === "live" ? "h-1.5 w-1.5 rounded-full bg-pass" : "h-1.5 w-1.5 rounded-full bg-warn"
                  }
                />
                {statusLabel[tool.status]}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
