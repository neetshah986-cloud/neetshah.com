export type ToolStatus = "live" | "in-development";

export type Tool = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: "Performance" | "Structured data" | "Rendering" | "On-page" | "Crawling";
  signals: string[];
  status: ToolStatus;
};

// Add a tool here and it appears on the homepage, /tools, its own page and the sitemap.
export const tools: Tool[] = [
  {
    slug: "page-speed-test",
    name: "Page Speed Test",
    tagline: "Core Web Vitals and Lighthouse results for any URL, mobile and desktop.",
    description:
      "Run a mobile and desktop performance test, see field and lab Core Web Vitals, and get fixes ordered by how much time they save.",
    category: "Performance",
    signals: ["LCP", "INP", "CLS", "TTFB", "Render-blocking resources", "Image weight"],
    status: "in-development",
  },
  {
    slug: "schema-validator",
    name: "Schema Validator",
    tagline: "Every JSON-LD, Microdata and RDFa item on a page, checked against schema.org.",
    description:
      "Paste a URL or code to extract all structured data, see required and recommended properties, and check rich result eligibility.",
    category: "Structured data",
    signals: ["JSON-LD", "Microdata", "RDFa", "Required properties", "Rich result types"],
    status: "in-development",
  },
  {
    slug: "ssr-vs-csr-checker",
    name: "SSR vs CSR Checker",
    tagline: "The raw HTML a crawler receives, compared with the page after JavaScript runs.",
    description:
      "See which content, links and meta tags exist before JavaScript runs, and what only appears after client-side rendering.",
    category: "Rendering",
    signals: ["Raw vs rendered text", "Links added by JS", "Meta tags changed by JS", "Hydration size"],
    status: "in-development",
  },
  {
    slug: "meta-tag-analyzer",
    name: "Meta Tag Analyzer",
    tagline: "Title, description, canonical, robots and social tags with length checks.",
    description:
      "Check title and description length in pixels and characters, canonical and hreflang tags, robots directives and social previews.",
    category: "On-page",
    signals: ["Title width", "Meta description", "Canonical", "hreflang", "Open Graph", "Robots meta"],
    status: "in-development",
  },
  {
    slug: "robots-txt-tester",
    name: "Robots.txt Tester",
    tagline: "Test any path against any crawler and see which rule decides it.",
    description:
      "Fetch a site's robots.txt, test paths against any user-agent, and find conflicting, unreachable or overly broad rules.",
    category: "Crawling",
    signals: ["Allow and disallow matching", "User-agent groups", "Sitemap lines", "Syntax errors"],
    status: "in-development",
  },
  {
    slug: "redirect-checker",
    name: "Redirect Checker",
    tagline: "Every hop in a redirect chain, with status codes and headers.",
    description:
      "Follow 301, 302, meta refresh and JavaScript redirects and see status codes, response headers and total chain length.",
    category: "Crawling",
    signals: ["301 and 302 hops", "Meta refresh", "Redirect loops", "Chain length"],
    status: "in-development",
  },
];

export function getTool(slug: string) {
  return tools.find((t) => t.slug === slug);
}

export const statusLabel: Record<ToolStatus, string> = {
  live: "Live",
  "in-development": "In development",
};
