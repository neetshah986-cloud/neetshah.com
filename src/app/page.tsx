import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { ToolCard } from "@/components/ToolCard";
import { formatDate, getAllPosts } from "@/lib/blog";
import { site } from "@/lib/site";
import { tools } from "@/lib/tools";

export default function Home() {
  const posts = getAllPosts().slice(0, 3);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: site.name,
          url: site.url,
          description: site.description,
          author: { "@type": "Person", name: site.author },
        }}
      />

      <section className="container-x pt-20 pb-16">
        <p className="mb-4 text-sm font-medium text-accent">For SEO professionals</p>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Free SEO tools to test speed, schema and rendering.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">{site.description}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/tools" className="rounded-lg bg-accent px-5 py-2.5 font-medium text-white hover:opacity-90">
            Browse tools
          </Link>
          <Link href="/blog" className="rounded-lg border border-line px-5 py-2.5 font-medium hover:border-accent">
            Read the blog
          </Link>
        </div>
      </section>

      <section className="container-x" aria-labelledby="tools-heading">
        <div className="mb-6 flex items-end justify-between">
          <h2 id="tools-heading" className="text-2xl font-semibold">Tools</h2>
          <Link href="/tools" className="text-sm text-accent hover:underline">All tools →</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <ToolCard key={tool.slug} tool={tool} />
          ))}
        </div>
      </section>

      {posts.length > 0 && (
        <section className="container-x mt-20" aria-labelledby="blog-heading">
          <div className="mb-6 flex items-end justify-between">
            <h2 id="blog-heading" className="text-2xl font-semibold">Latest from the blog</h2>
            <Link href="/blog" className="text-sm text-accent hover:underline">All posts →</Link>
          </div>
          <ul className="divide-y divide-line border-y border-line">
            {posts.map((p) => (
              <li key={p.slug} className="py-4">
                <Link href={`/blog/${p.slug}`} className="font-medium hover:text-accent">{p.title}</Link>
                <p className="mt-1 text-sm text-muted">
                  {formatDate(p.date)} · {p.description}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
