import type { Metadata } from "next";
import { ToolList } from "@/components/ToolList";
import { tools } from "@/lib/tools";

export const metadata: Metadata = {
  title: "Technical SEO Tools",
  description:
    "Free technical SEO tools: page speed test, schema validator, SSR vs CSR checker, meta tag analyzer, robots.txt tester and redirect checker.",
  alternates: { canonical: "/tools" },
};

export default function ToolsPage() {
  return (
    <section className="container-x pt-16 sm:pt-24">
      <h1 className="display max-w-[16ch] text-5xl sm:text-6xl">Technical SEO tools</h1>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">
        Each tool answers one question about how search engines crawl, render and understand a page. They are
        free, and none of them needs an account.
      </p>
      <div className="mt-14">
        <ToolList tools={tools} />
      </div>
    </section>
  );
}
