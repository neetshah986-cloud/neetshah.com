import Link from "next/link";
import { HeroAudit } from "@/components/HeroAudit";
import { JsonLd } from "@/components/JsonLd";
import { Byline, Initials } from "@/components/Person";
import { PostList } from "@/components/PostList";
import { ToolList } from "@/components/ToolList";
import { getAllPosts } from "@/lib/blog";
import { person, personJsonLd, site } from "@/lib/site";
import { tools } from "@/lib/tools";

const principles = [
  {
    title: "Raw HTML first",
    body: "Every check starts with the HTML your server sends, because that is what a crawler reads before it renders anything.",
  },
  {
    title: "Every result explained",
    body: "Each finding says what it means for crawling, indexing or ranking, and exactly what to change.",
  },
  {
    title: "Built for daily use",
    body: "No account and no paywall. Open a tool, paste a URL, get an answer you can send to a developer.",
  },
];

export default function Home() {
  const posts = getAllPosts().slice(0, 3);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebSite",
              "@id": `${site.url}/#website`,
              name: site.name,
              alternateName: site.hub,
              url: site.url,
              description: site.description,
              author: { "@id": person.id },
              publisher: { "@id": person.id },
            },
            personJsonLd,
          ],
        }}
      />

      <section className="container-x grid items-center gap-14 pt-16 pb-24 sm:pt-24 lg:grid-cols-[1.15fr_1fr] lg:gap-20">
        <div>
          <h1 className="display max-w-[12ch] text-[3.1rem] sm:text-[4.4rem] lg:text-[5.1rem]">
            See your pages the way search engines do.
          </h1>
          <p className="mt-7 max-w-[34rem] text-lg leading-relaxed text-ink-soft sm:text-xl">
            Free technical SEO tools for page speed, structured data and JavaScript rendering, built by Neet
            Shah for people who fix sites for a living.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/tools"
              className="rounded-lg bg-ink px-5 py-3 font-medium text-paper transition-colors hover:bg-serp"
            >
              Browse the tools
            </Link>
            <Link
              href="/blog"
              className="rounded-lg border border-rule bg-white px-5 py-3 font-medium transition-colors hover:border-ink"
            >
              Read the guides
            </Link>
          </div>
          <div className="mt-12 border-t border-rule pt-6">
            <Byline />
          </div>
        </div>
        <HeroAudit />
      </section>

      <section aria-labelledby="tools-heading" className="container-x">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <h2 id="tools-heading" className="max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Six tools for the checks that decide rankings
          </h2>
          <Link href="/tools" className="font-medium text-serp hover:underline">
            All tools
          </Link>
        </div>
        <ToolList tools={tools} />
      </section>

      <section aria-labelledby="approach-heading" className="container-x mt-32 grid gap-12 lg:grid-cols-[1fr_1.6fr]">
        <h2 id="approach-heading" className="max-w-sm text-3xl font-semibold tracking-tight sm:text-4xl">
          How the tools work
        </h2>
        <dl className="grid gap-10 sm:grid-cols-3 sm:gap-8">
          {principles.map((p) => (
            <div key={p.title} className="border-t-2 border-ink pt-5">
              <dt className="text-lg font-semibold tracking-tight">{p.title}</dt>
              <dd className="mt-2 leading-relaxed text-ink-soft">{p.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        aria-labelledby="neet-heading"
        className="container-x mt-32"
      >
        <div className="grid gap-10 rounded-2xl bg-ink p-8 text-paper sm:p-12 lg:grid-cols-[auto_1fr] lg:gap-14">
          <Initials light className="h-24 w-24 text-3xl" />
          <div>
            <h2 id="neet-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Hi, I&apos;m {person.name}.
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[#C8D2E1]">
              I&apos;m an SEO specialist, and I build the tools on this site because I use these checks every day:
              how a page renders without JavaScript, whether its structured data is valid, and what is slowing it
              down. {site.hub} is where I share them, free, along with guides that explain the reasoning behind
              each result.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
              <Link href="/about" className="rounded-lg bg-paper px-5 py-3 font-medium text-ink hover:bg-white">
                More about me
              </Link>
              <a
                href={person.linkedin}
                target="_blank"
                rel="me noopener"
                className="font-medium text-[#A9BBFF] hover:underline"
              >
                Connect on LinkedIn
              </a>
            </div>
          </div>
        </div>
      </section>

      {posts.length > 0 && (
        <section aria-labelledby="guides-heading" className="container-x mt-32">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <h2 id="guides-heading" className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Latest guides
            </h2>
            <Link href="/blog" className="font-medium text-serp hover:underline">
              All guides
            </Link>
          </div>
          <PostList posts={posts} />
        </section>
      )}
    </>
  );
}
