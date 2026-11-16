import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { formatDate, getAllPosts, getPost } from "@/lib/blog";
import { site } from "@/lib/site";

export function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: post.meta.title,
    description: post.meta.description,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: { type: "article", title: post.meta.title, description: post.meta.description, publishedTime: post.meta.date },
  };
}

export default async function BlogPost({ params }: PageProps<"/blog/[slug]">) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();
  const { meta, html } = post;

  return (
    <article className="container-x pt-12 sm:pt-16">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: meta.title,
          description: meta.description,
          datePublished: meta.date,
          author: { "@type": "Person", name: site.author },
          publisher: { "@type": "Organization", name: site.name },
          mainEntityOfPage: `${site.url}/blog/${slug}`,
        }}
      />
      <nav aria-label="Breadcrumb" className="text-sm text-ink-soft">
        <Link href="/blog" className="hover:text-ink">Guides</Link>
      </nav>
      <header className="mt-10 max-w-4xl">
        <h1 className="display text-[2.6rem] sm:text-6xl">{meta.title}</h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">{meta.description}</p>
        <p className="mt-8 flex flex-wrap gap-x-6 gap-y-1 border-t border-rule pt-5 text-sm text-ink-soft">
          <span>By {site.author}</span>
          <time dateTime={meta.date}>{formatDate(meta.date)}</time>
        </p>
      </header>
      <div className="prose-post mt-12" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
