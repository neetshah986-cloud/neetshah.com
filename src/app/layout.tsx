import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "@fontsource-variable/schibsted-grotesk";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import { LogoMark } from "@/components/Logo";
import { LinkedInLink } from "@/components/Person";
import { nav, person, site } from "@/lib/site";
import { tools } from "@/lib/tools";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: site.homeTitle, template: `%s | ${site.name}` },
  description: site.description,
  applicationName: site.name,
  authors: [{ name: person.name, url: person.linkedin }],
  creator: person.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: site.name,
    url: site.url,
    title: site.homeTitle,
    description: site.description,
    locale: "en_IN",
  },
  twitter: { card: "summary_large_image", title: site.homeTitle, description: site.description },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#FBFCFD" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
        >
          Skip to content
        </a>

        <header className="sticky top-0 z-40 border-b border-rule/80 bg-paper/85 backdrop-blur-md">
          <div className="container-x flex h-16 items-center justify-between gap-6">
            <Link href="/" className="flex items-center gap-2.5 whitespace-nowrap text-[1.05rem] font-semibold tracking-tight">
              <LogoMark />
              <span>{site.name}</span>
              <span className="hidden border-l border-rule pl-2.5 font-normal text-ink-soft md:inline">{site.hub}</span>
            </Link>
            <nav aria-label="Main" className="flex items-center gap-1 text-[0.95rem]">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="whitespace-nowrap rounded-md px-2.5 py-2 text-ink-soft transition-colors hover:bg-mist hover:text-ink sm:px-3"
                >
                  {item.short ? (
                    <>
                      <span className="sm:hidden">{item.short}</span>
                      <span className="hidden sm:inline">{item.label}</span>
                    </>
                  ) : (
                    item.label
                  )}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main id="main" className="flex-1">
          {children}
        </main>

        <footer className="mt-32 border-t border-rule bg-mist/60">
          <div className="container-x grid gap-10 py-14 sm:grid-cols-[1.4fr_1fr_1fr]">
            <div className="max-w-sm">
              <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
                <LogoMark className="h-6 w-6" />
                {site.name}
              </Link>
              <p className="mt-4 text-[0.95rem] leading-relaxed text-ink-soft">
                {person.role} building {site.hub}: free technical SEO tools and guides, no sign-up.
              </p>
              <LinkedInLink className="mt-5 text-[0.95rem]" />
            </div>
            <nav aria-label="Tools">
              <h2 className="text-sm font-semibold">Tools</h2>
              <ul className="mt-4 space-y-2.5 text-[0.95rem] text-ink-soft">
                {tools.map((t) => (
                  <li key={t.slug}>
                    <Link href={`/tools/${t.slug}`} className="hover:text-ink">{t.name}</Link>
                  </li>
                ))}
              </ul>
            </nav>
            <nav aria-label="Site">
              <h2 className="text-sm font-semibold">Site</h2>
              <ul className="mt-4 space-y-2.5 text-[0.95rem] text-ink-soft">
                <li><Link href="/blog" className="hover:text-ink">Guides</Link></li>
                <li><Link href="/about" className="hover:text-ink">About Neet</Link></li>
                <li><a href="/sitemap.xml" className="hover:text-ink">Sitemap</a></li>
              </ul>
            </nav>
          </div>
          <div className="container-x border-t border-rule py-6 text-sm text-ink-soft">
            © 2026 {person.name}. {site.hub}.
          </div>
        </footer>
      </body>
    </html>
  );
}
