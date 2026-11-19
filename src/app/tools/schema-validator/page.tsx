import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { SchemaValidator } from "@/components/schema/SchemaValidator";
import { VOCAB_VERSION } from "@/lib/schema/vocab";
import { person, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Schema Validator: Test Structured Data and Rich Results",
  description:
    "Free schema markup validator. Checks JSON-LD, Microdata and RDFa against schema.org and Google's rich result rules, and flags values that aren't on the page.",
  alternates: { canonical: "/tools/schema-validator" },
};

const sameAsSchemaOrg = [
  "JSON-LD, Microdata and RDFa, from a URL or pasted code",
  `Every type and property in schema.org ${VOCAB_VERSION}`,
  "Properties used on the wrong type, with where they belong",
  "Values of the wrong type, and invalid enumeration values",
  "Superseded and pending terms",
  "JSON syntax errors, with the line and the likely cause",
];

const beyond = [
  { title: "Google rich result eligibility", body: "Required and recommended fields for 19 Google features, with features Google has retired (FAQ, HowTo, Course info and others) marked clearly." },
  { title: "Visible content match", body: "Compares names, prices, ratings and answers in your markup with the page text, because Google requires structured data to describe what visitors can see." },
  { title: "Value formats", body: "Prices with currency symbols, currency symbols instead of ISO codes, non-ISO dates and durations, ratings above bestRating, end dates before start dates." },
  { title: "Entity graph", body: "How entities link through @id, and references that point to an @id that isn't on the page." },
  { title: "Duplicates and conflicts", body: "The same entity marked up in two formats, one @id used for different types, and competing Organization or Article items." },
  { title: "A report you can hand over", body: "Copy every issue as plain text for a developer, or download the full report as JSON." },
];

const faqs = [
  {
    q: "How is this different from Google's Rich Results Test?",
    a: "The Rich Results Test only checks the features Google supports, and it hides schema.org errors that don't affect them. This tool checks the full schema.org vocabulary, the way validator.schema.org does, and Google's requirements on top, so you see both in one place. It also checks your markup against the visible page text, which neither tool does.",
  },
  {
    q: "Does it run JavaScript on the page?",
    a: "No. It reads the raw HTML your server sends, which is what search engines see first. If your structured data is added by JavaScript, for example through Google Tag Manager, it won't appear here. Google can still pick it up after rendering, but server-rendered markup is the more reliable choice, and the tool tells you when a page looks like it relies on JavaScript.",
  },
  {
    q: "Why does it say my FAQ markup won't show in Google?",
    a: "Google stopped showing FAQ rich results on 7 May 2026, after limiting them to government and health sites in 2023. FAQPage is still valid schema.org and can help search engines understand the page, so there's no need to remove it, but it won't produce a rich result.",
  },
  {
    q: "Does a valid result guarantee rich results?",
    a: "No. Valid, eligible markup is the requirement, not a guarantee. Google decides whether to show a rich result based on the query, the page's quality and its own guidelines.",
  },
];

export default function SchemaValidatorPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebApplication",
              name: "Schema Validator",
              url: `${site.url}/tools/schema-validator`,
              description: metadata.description,
              applicationCategory: "DeveloperApplication",
              operatingSystem: "Any",
              isAccessibleForFree: true,
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              creator: { "@id": person.id },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Tools", item: `${site.url}/tools` },
                { "@type": "ListItem", position: 2, name: "Schema Validator", item: `${site.url}/tools/schema-validator` },
              ],
            },
          ],
        }}
      />

      <section className="container-x pt-12 sm:pt-16">
        <nav aria-label="Breadcrumb" className="text-sm text-ink-soft">
          <ol className="flex items-center gap-2">
            <li><Link href="/tools" className="hover:text-ink">Tools</Link></li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-ink">Schema Validator</li>
          </ol>
        </nav>
        <h1 className="display mt-8 text-5xl sm:text-6xl">Schema Validator</h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-ink-soft">
          Check structured data against all of schema.org and Google&apos;s rich result rules in one pass, and see whether your markup matches what&apos;s actually on the page.
        </p>
        <div className="mt-10">
          <SchemaValidator />
        </div>
      </section>

      <section aria-labelledby="checks-heading" className="container-x mt-28">
        <h2 id="checks-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">What it checks</h2>
        <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_2fr] lg:gap-16">
          <div>
            <h3 className="font-semibold">Everything the schema.org validator checks</h3>
            <ul className="mt-4 divide-y divide-rule border-y border-rule">
              {sameAsSchemaOrg.map((s) => (
                <li key={s} className="flex gap-3 py-3 leading-snug">
                  <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-pass" aria-hidden="true">
                    <path d="M5 10.4l3 3L15 6.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold">And what it doesn&apos;t</h3>
            <dl className="mt-4 grid gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-2">
              {beyond.map((b) => (
                <div key={b.title} className="bg-paper p-5">
                  <dt className="font-semibold tracking-tight">{b.title}</dt>
                  <dd className="mt-1.5 text-[0.95rem] leading-relaxed text-ink-soft">{b.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section aria-labelledby="faq-heading" className="container-x mt-28">
        <h2 id="faq-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">Questions</h2>
        <div className="mt-8 max-w-3xl divide-y divide-rule border-y border-rule">
          {faqs.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold tracking-tight">
                {f.q}
                <span aria-hidden="true" className="text-ink-soft transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 leading-relaxed text-ink-soft">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
