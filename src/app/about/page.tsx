import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { Avatar, LinkedInLink } from "@/components/Person";
import { person, personJsonLd, site } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "About Neet Shah | SEO People Hub" },
  description:
    "Neet Shah has worked in SEO since 2022 at Infidigit, Incubeta and Jellyfish, and builds free technical SEO tools and guides at SEO People Hub.",
  alternates: { canonical: "/about" },
  openGraph: { type: "profile", title: "About Neet Shah", images: [person.photo] },
};

// Career in order, newest first. No job titles, by Neet's choice.
const career = [
  {
    years: "2025 to now",
    company: "Jellyfish",
    place: "",
    body: "Working on SEO at Jellyfish, the global digital marketing partner, since May 2025.",
  },
  {
    years: "2024 to 2025",
    company: "Incubeta",
    place: "Dubai",
    body: "International SEO for the Middle East: Arabic SEO, content strategy and technical fixes for crawling, indexing and Core Web Vitals across six brands in healthcare, insurance, energy, wellness and education. Also wrote the SEO proposals that won new business.",
  },
  {
    years: "2022 to 2024",
    company: "Infidigit",
    place: "Mumbai",
    body: "On-page and technical SEO, site audits and reporting for clients across industries. Led a team on an automotive project that went on to win 6+ industry awards, and built proposals that helped win two major life insurance clients.",
  },
  {
    years: "2020 to 2021",
    company: "Akruti Jewellery",
    place: "",
    body: "Where it started: building the business's online sales through Facebook and Instagram.",
  },
];

const highlights = [
  { figure: "+150%", label: "Non-brand clicks for a client, from 6,000 to 15,000+" },
  { figure: "6,000+", label: "Keywords optimised in a single engagement" },
  { figure: "6+", label: "Industry awards won by a project I worked on" },
  { figure: "2024", label: "Rising Star Award at Infidigit" },
];

const toolkit = [
  "Google Search Console",
  "Google Analytics",
  "Looker Studio",
  "Screaming Frog",
  "Semrush",
  "Ahrefs",
  "Keyword Planner",
  "Serpstat",
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
        <div className="grid items-end gap-10 lg:grid-cols-[auto_1fr] lg:gap-14">
          <Avatar size={160} className="h-32 w-32 sm:h-40 sm:w-40" />
          <div>
            <h1 className="display text-5xl sm:text-7xl">{person.name}</h1>
            <p className="mt-4 text-xl text-ink-soft">{person.tagline}</p>
          </div>
        </div>

        <div className="mt-14 grid gap-14 lg:grid-cols-[1.5fr_1fr] lg:gap-20">
          <div>
            <div className="prose-post">
              <p>
                I&apos;m Neet Shah. I&apos;ve worked in SEO since 2022, first at Infidigit in Mumbai, then at
                Incubeta in Dubai, and now at Jellyfish. Along the way I&apos;ve worked on sites in automotive,
                healthcare, insurance and energy, for audiences in India and across the Middle East, including SEO
                in Arabic.
              </p>
              <p>
                Most of my days go on the technical side: working out why a page isn&apos;t indexed, why it&apos;s
                slow, or why the content Google sees isn&apos;t the content users see. The checks that answer those
                questions often take three different tools and a browser extension, so I started building my own.
                {" "}{site.hub} is where I share them.
              </p>
              <p>
                Every tool here looks at a page the way a crawler does, starting from the raw HTML the server
                sends, and explains each result in terms of crawling, indexing and ranking. They&apos;re free and
                need no account. Alongside them I write guides that explain the reasoning behind each check.
              </p>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
              <LinkedInLink />
              <Link href="/tools" className="font-medium text-serp hover:underline">
                See the tools
              </Link>
            </div>
          </div>

          <aside aria-labelledby="highlights-heading">
            <h2 id="highlights-heading" className="font-semibold">Highlights</h2>
            <dl className="mt-4 divide-y divide-rule border-y border-rule">
              {highlights.map((h) => (
                <div key={h.label} className="grid grid-cols-[5.5rem_1fr] items-baseline gap-4 py-4">
                  <dt className="text-2xl font-semibold tracking-tight">{h.figure}</dt>
                  <dd className="leading-snug text-ink-soft">{h.label}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </section>

      <section aria-labelledby="career-heading" className="container-x mt-28">
        <h2 id="career-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">Career</h2>
        <ol className="mt-10 border-l-2 border-rule">
          {career.map((c, i) => (
            <li key={c.company} className="relative pb-12 pl-8 last:pb-0 sm:pl-10">
              <span
                aria-hidden="true"
                className={`absolute -left-[7px] top-1.5 h-3 w-3 rounded-full ring-4 ring-paper ${
                  i === 0 ? "bg-serp" : "bg-ink-soft"
                }`}
              />
              <div className="grid gap-2 sm:grid-cols-[10rem_1fr] sm:gap-8">
                <p className="text-sm text-ink-soft sm:pt-1">{c.years}</p>
                <div>
                  <h3 className="text-xl font-semibold tracking-tight">
                    {c.company}
                    {c.place && <span className="font-normal text-ink-soft">, {c.place}</span>}
                  </h3>
                  <p className="mt-2 max-w-2xl leading-relaxed text-ink-soft">{c.body}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="toolkit-heading" className="container-x mt-28 grid gap-8 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <h2 id="toolkit-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">Daily toolkit</h2>
          <p className="mt-4 max-w-sm leading-relaxed text-ink-soft">
            The tools I use alongside my own. Education: Bachelor of Management Studies, University of Mumbai, 2020.
          </p>
        </div>
        <ul className="flex flex-wrap content-start gap-2">
          {toolkit.map((t) => (
            <li key={t} className="rounded-lg border border-rule bg-white px-3.5 py-2 text-[0.95rem]">
              {t}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
