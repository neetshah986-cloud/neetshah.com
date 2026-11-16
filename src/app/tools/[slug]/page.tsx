import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { site } from "@/lib/site";
import { getTool, tools } from "@/lib/tools";

export function generateStaticParams() {
  return tools.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: PageProps<"/tools/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool) return {};
  return {
    title: tool.name,
    description: tool.description,
    alternates: { canonical: `/tools/${tool.slug}` },
  };
}

export default async function ToolPage({ params }: PageProps<"/tools/[slug]">) {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool) notFound();

  return (
    <section className="container-x pt-16">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: tool.name,
          description: tool.description,
          url: `${site.url}/tools/${tool.slug}`,
          applicationCategory: "SEO tool",
          operatingSystem: "Any",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }}
      />
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted">
        <Link href="/tools" className="hover:text-foreground">Tools</Link> / {tool.name}
      </nav>
      <p className="text-sm font-medium uppercase tracking-wide text-muted">{tool.category}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">{tool.name}</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted">{tool.description}</p>

      {tool.status === "coming-soon" && (
        <div className="mt-10 rounded-xl border border-dashed border-line bg-surface p-8 text-center">
          <p className="font-medium">This tool is being built.</p>
          <p className="mt-1 text-sm text-muted">Check back soon.</p>
        </div>
      )}
    </section>
  );
}
