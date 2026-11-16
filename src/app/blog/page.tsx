import type { Metadata } from "next";
import { PostList } from "@/components/PostList";
import { getAllPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Technical SEO Guides",
  description: "Guides on technical SEO, Core Web Vitals, structured data and JavaScript rendering.",
  alternates: { canonical: "/blog" },
};

export default function BlogIndex() {
  const posts = getAllPosts();
  return (
    <section className="container-x pt-16 sm:pt-24">
      <h1 className="display max-w-[16ch] text-5xl sm:text-6xl">Guides</h1>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">
        Practical write-ups on technical SEO: Core Web Vitals, structured data, JavaScript rendering and
        crawling, with the reasoning behind each recommendation.
      </p>
      <div className="mt-14">
        <PostList posts={posts} />
      </div>
    </section>
  );
}
