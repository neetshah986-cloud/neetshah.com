import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { Initials, LinkedInLink } from "@/components/Person";
import { person, personJsonLd, site } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "Neet Shah, SEO Specialist | SEO People Hub" },
  description:
    "Neet Shah is an SEO specialist building free technical SEO tools and guides for page speed, structured data and JavaScript rendering.",
  alternates: { canonical: "/about" },
  openGraph: { type: "profile", title: "Neet Shah, SEO Specialist" },
};

const focus = [
  { title: "Technical SEO", body: "Crawling, indexing, canonicals, redirects and robots rules." },
  { title: "Core Web Vitals", body: "LCP, INP and CLS, and the fixes that move them." },
  { title: "Structured data", body: "Schema.org markup that is valid and earns rich results." },
  { title: "JavaScript SEO", body: "Making sure content and links exist before rendering." },
];

export default function About() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          url: `${site.url}/about`,
          mainEntity: personJsonLd,
        }}
      />

      <section className="container-x pt-16 sm:pt-24">
        <div className="grid gap-12 lg:grid-cols-[1.5fr_1fr] lg:gap-20">
          <div>
            <Initials className="h-20 w-20 text-2xl" />
            <h1 className="display mt-8 text-5xl sm:text-7xl">{person.name}</h1>
            <p className="mt-4 text-xl text-ink-soft">{person.role}</p>

            <div className="prose-post mt-10">
              <p>
                I&apos;m Neet Shah, and I work in SEO. Most of my days are spent on the technical side: working
                out why a page isn&apos;t indexed, why it&apos;s slow, or why the content Google sees isn&apos;t
                the content users see.
              </p>
              <p>
                The checks that answer those questions often take three different tools and a browser extension.
                So I started building my own, and {site.hub} is where I share them. Every tool looks at a page
                the way a crawler does, starting from the raw HTML the server sends, and explains each result in
                terms of crawling, indexing and ranking.
              </p>
              <p>
                The tools are free and need no account. Alongside them I write guides that explain the reasoning
                behind each check, so you can fix the problem, not just see it.
              </p>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
              <LinkedInLink />
              <Link href="/tools" className="font-medium text-serp hover:underline">
                See the tools
              </Link>
            </div>
          </div>

          <aside aria-labelledby="focus-heading" className="lg:pt-32">
            <h2 id="focus-heading" className="font-semibold">What I work on</h2>
            <dl className="mt-4 divide-y divide-rule border-y border-rule">
              {focus.map((f) => (
                <div key={f.title} className="py-4">
                  <dt className="font-medium">{f.title}</dt>
                  <dd className="mt-1 text-[0.95rem] leading-relaxed text-ink-soft">{f.body}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </section>
    </>
  );
}
