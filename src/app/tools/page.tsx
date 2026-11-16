import type { Metadata } from "next";
import { ToolCard } from "@/components/ToolCard";
import { tools } from "@/lib/tools";

export const metadata: Metadata = {
  title: "SEO Tools",
  description:
    "Free SEO tools: page speed test, schema validator, SSR vs CSR checker, meta tag analyzer, robots.txt tester and redirect checker.",
  alternates: { canonical: "/tools" },
};

export default function ToolsPage() {
  return (
    <section className="container-x pt-16">
      <h1 className="text-3xl font-bold tracking-tight">SEO Tools</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Technical SEO checks you can run on any URL. More tools are added regularly.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => (
          <ToolCard key={tool.slug} tool={tool} />
        ))}
      </div>
    </section>
  );
}
