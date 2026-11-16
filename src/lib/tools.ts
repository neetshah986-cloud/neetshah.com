export type ToolStatus = "live" | "coming-soon";

export type Tool = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: "Performance" | "Structured data" | "Rendering" | "On-page" | "Crawling";
  status: ToolStatus;
};

// Add a tool here and it appears on the homepage, /tools, its own page and the sitemap.
export const tools: Tool[] = [
  {
    slug: "page-speed-test",
    name: "Page Speed Test",
    tagline: "Core Web Vitals and Lighthouse scores for any URL.",
    description:
      "Run a mobile and desktop performance test, see LCP, INP and CLS, and get a prioritised list of fixes.",
    category: "Performance",
    status: "coming-soon",
  },
  {
    slug: "schema-validator",
    name: "Schema Validator",
    tagline: "Extract and validate JSON-LD, Microdata and RDFa.",
    description:
      "Paste a URL or code to see every structured data item on the page, with errors, warnings and rich result eligibility.",
    category: "Structured data",
    status: "coming-soon",
  },
  {
    slug: "ssr-vs-csr-checker",
    name: "SSR vs CSR Checker",
    tagline: "Compare the raw HTML with the rendered page.",
    description:
      "See which content, links and meta tags exist before JavaScript runs, and what only appears after client-side rendering.",
    category: "Rendering",
    status: "coming-soon",
  },
  {
    slug: "meta-tag-analyzer",
    name: "Meta Tag Analyzer",
    tagline: "Titles, descriptions, canonicals and Open Graph at a glance.",
    description:
      "Check title and description length, canonical and hreflang tags, robots directives and social previews.",
    category: "On-page",
    status: "coming-soon",
  },
  {
    slug: "robots-txt-tester",
    name: "Robots.txt Tester",
    tagline: "Test whether a URL is allowed for a given crawler.",
    description:
      "Fetch a site's robots.txt, test paths against any user-agent, and spot conflicting or unreachable rules.",
    category: "Crawling",
    status: "coming-soon",
  },
  {
    slug: "redirect-checker",
    name: "Redirect Checker",
    tagline: "Trace every hop in a redirect chain.",
    description:
      "Follow 301, 302, meta refresh and JavaScript redirects and see status codes, headers and chain length.",
    category: "Crawling",
    status: "coming-soon",
  },
];

export function getTool(slug: string) {
  return tools.find((t) => t.slug === slug);
}
