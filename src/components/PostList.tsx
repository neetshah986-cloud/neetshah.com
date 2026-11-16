import Link from "next/link";
import { formatDate, type PostMeta } from "@/lib/blog";

export function PostList({ posts }: { posts: PostMeta[] }) {
  return (
    <ul className="divide-y divide-rule border-y border-rule">
      {posts.map((p) => (
        <li key={p.slug}>
          <Link
            href={`/blog/${p.slug}`}
            className="group grid gap-2 py-6 sm:grid-cols-[11rem_1fr] sm:gap-8 sm:px-3"
          >
            <time dateTime={p.date} className="text-sm text-ink-soft sm:pt-1">
              {formatDate(p.date)}
            </time>
            <span>
              <span className="block text-xl font-semibold tracking-tight group-hover:text-serp">{p.title}</span>
              <span className="mt-1.5 block max-w-2xl leading-relaxed text-ink-soft">{p.description}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
