import Link from "next/link";

export default function NotFound() {
  return (
    <section className="container-x pt-24 sm:pt-32">
      <p className="font-mono text-sm text-warn">HTTP 404</p>
      <h1 className="display mt-3 max-w-[14ch] text-5xl sm:text-6xl">This page isn&apos;t here.</h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
        The address may be mistyped, or the page may have moved. It returns a real 404, so search engines
        won&apos;t index it.
      </p>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/" className="rounded-lg bg-ink px-5 py-3 font-medium text-paper hover:bg-serp">
          Go to the homepage
        </Link>
        <Link href="/tools" className="rounded-lg border border-rule bg-white px-5 py-3 font-medium hover:border-ink">
          Browse the tools
        </Link>
      </div>
    </section>
  );
}
