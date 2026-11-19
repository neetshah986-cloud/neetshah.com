import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { site } from "@/lib/site";
import { getTool, tools } from "@/lib/tools";

export function generateStaticParams() {
  // Live tools have their own route (e.g. /tools/schema-validator).
  return tools.filter((t) => t.status !== "live").map((t) => ({ slug: t.slug }));
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
  const others = tools.filter((t) => t.slug !== tool.slug).slice(0, 3);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: tool.name,
          description: tool.description,
          url: `${site.url}/tools/${tool.slug}`,
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Any",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Tools", item: `${site.url}/tools` },
            { "@type": "ListItem", position: 2, name: tool.name, item: `${site.url}/tools/${tool.slug}` },
          ],
        }}
      />

      <section className="container-x pt-12 sm:pt-16">
        <nav aria-label="Breadcrumb" className="text-sm text-ink-soft">
          <ol className="flex items-center gap-2">
            <li><Link href="/tools" className="hover:text-ink">Tools</Link></li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-ink">{tool.name}</li>
          </ol>
        </nav>

        <div className="mt-10 grid gap-12 lg:grid-cols-[1.4fr_1fr] lg:gap-20">
          <div>
            <p className="text-ink-soft">{tool.category}</p>
            <h1 className="display mt-2 text-5xl sm:text-6xl">{tool.name}</h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">{tool.description}</p>

            {tool.status === "in-development" && (
              <div className="mt-10 rounded-xl border border-rule bg-white p-6">
                <p className="flex items-center gap-2 font-semibold">
                  <span className="h-2 w-2 rounded-full bg-warn" />
                  In development
                </p>
                <p className="mt-2 leading-relaxed text-ink-soft">
                  This tool is being built now. The checks it will run are listed here, and the guides cover the
                  same topics in the meantime.
                </p>
                <Link href="/blog" className="mt-4 inline-block font-medium text-serp hover:underline">
                  Read the guides
                </Link>
              </div>
            )}
          </div>

          <aside aria-labelledby="checks-heading" className="lg:pt-10">
            <h2 id="checks-heading" className="font-semibold">What it checks</h2>
            <ul className="mt-4 divide-y divide-rule border-y border-rule">
              {tool.signals.map((s) => (
                <li key={s} className="flex items-center gap-3 py-3">
                  <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-serp" aria-hidden="true">
                    <path d="M5 10.4l3 3L15 6.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {s}
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <section aria-labelledby="more-heading" className="container-x mt-28">
        <h2 id="more-heading" className="text-2xl font-semibold tracking-tight">More tools</h2>
        <ul className="mt-6 grid gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-3">
          {others.map((t) => (
            <li key={t.slug} className="bg-paper">
              <Link href={`/tools/${t.slug}`} className="group block h-full p-6 hover:bg-white">
                <span className="text-sm text-ink-soft">{t.category}</span>
                <span className="mt-1 block text-lg font-semibold tracking-tight group-hover:text-serp">{t.name}</span>
                <span className="mt-2 block text-[0.95rem] leading-relaxed text-ink-soft">{t.tagline}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
