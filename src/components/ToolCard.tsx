import Link from "next/link";
import type { Tool } from "@/lib/tools";

export function ToolCard({ tool }: { tool: Tool }) {
  return (
    <Link
      href={`/tools/${tool.slug}`}
      className="group flex flex-col rounded-xl border border-line bg-surface p-5 transition hover:border-accent"
    >
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="font-medium uppercase tracking-wide text-muted">{tool.category}</span>
        {tool.status === "coming-soon" ? (
          <span className="rounded-full border border-line px-2 py-0.5 text-muted">Coming soon</span>
        ) : (
          <span className="rounded-full bg-accent px-2 py-0.5 text-white">Live</span>
        )}
      </div>
      <h3 className="font-semibold group-hover:text-accent">{tool.name}</h3>
      <p className="mt-1 text-sm text-muted">{tool.tagline}</p>
    </Link>
  );
}
