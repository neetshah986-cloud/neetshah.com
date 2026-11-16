import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import Link from "next/link";
import { nav, site } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name} | Free SEO Tools & Guides`, template: `%s | ${site.name}` },
  description: site.description,
  applicationName: site.name,
  authors: [{ name: site.author }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: site.name,
    url: site.url,
    title: site.name,
    description: site.description,
    locale: "en_IN",
  },
  twitter: { card: "summary_large_image", title: site.name, description: site.description },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line">
          <div className="container-x flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-bold text-white">
                S
              </span>
              {site.name}
            </Link>
            <nav aria-label="Main" className="flex items-center gap-6 text-sm">
              {nav.map((item) => (
                <Link key={item.href} href={item.href} className="text-muted hover:text-foreground">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="mt-24 border-t border-line">
          <div className="container-x flex flex-col gap-2 py-8 text-sm text-muted sm:flex-row sm:justify-between">
            <p>
              © 2026 {site.name}. Built by {site.author}.
            </p>
            <nav aria-label="Footer" className="flex gap-5">
              <Link href="/tools" className="hover:text-foreground">Tools</Link>
              <Link href="/blog" className="hover:text-foreground">Blog</Link>
              <Link href="/about" className="hover:text-foreground">About</Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
