import Link from "next/link";

export default function NotFound() {
  return (
    <section className="container-x pt-24 text-center">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="mt-3 text-muted">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link href="/" className="mt-6 inline-block text-accent hover:underline">Go to the homepage</Link>
    </section>
  );
}
