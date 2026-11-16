import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description: `About ${site.name}: free technical SEO tools and guides built by ${site.author}.`,
  alternates: { canonical: "/about" },
};

export default function About() {
  return (
    <section className="container-x pt-16 sm:pt-24">
      <h1 className="display max-w-[14ch] text-5xl sm:text-6xl">Tools I wanted, built for everyone</h1>
      <div className="prose-post mt-10">
        <p>
          {site.name} is a set of free technical SEO tools and guides, built by {site.author}. It started with a
          simple frustration: the checks that matter most in technical SEO, like how a page renders without
          JavaScript or whether its structured data is valid, often take three different tools and a browser
          extension to answer.
        </p>
        <p>
          Every tool here looks at a page the way a crawler does, starting from the raw HTML your server sends,
          and explains each result in terms of what it means for crawling, indexing and ranking.
        </p>
        <p>
          The first tools cover page speed, schema validation and SSR vs CSR rendering. More are on the way.
        </p>
        <p>
          <Link href="/tools">See the tools</Link>
        </p>
      </div>
    </section>
  );
}
