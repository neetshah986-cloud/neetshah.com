import type { Metadata } from "next";
import Link from "next/link";
import { formatDate, getAllPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "SEO Blog",
  description: "Guides on technical SEO, Core Web Vitals, structured data and JavaScript rendering.",
  alternates: { canonical: "/blog" },
};

export default function BlogIndex() {
  const posts = getAllPosts();
  return (
    <section className="container-x pt-16">
      <h1 className="text-3xl font-bold tracking-tight">Blog</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Guides on technical SEO, Core Web Vitals, structured data and JavaScript rendering.
      </p>
      <ul className="mt-10 divide-y divide-line border-y border-line">
        {posts.map((p) => (
          <li key={p.slug} className="py-5">
            <Link href={`/blog/${p.slug}`} className="text-lg font-medium hover:text-accent">
              {p.title}
            </Link>
            <p className="mt-1 text-sm text-muted">
              <time dateTime={p.date}>{formatDate(p.date)}</time> · {p.description}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
