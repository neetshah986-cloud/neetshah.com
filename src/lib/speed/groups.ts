// Groups a site's URLs into page types (templates), so a few samples can stand for each type.

export type PageGroup = { key: string; label: string; urls: string[]; samples: string[] };

type Rule = { key: string; label: string; path?: RegExp; source?: RegExp };

// Order matters: the first match wins.
const RULES: Rule[] = [
  { key: "product", label: "Product pages", source: /product(?![-_]?(cat|categor|tag|brand))/i, path: /\/(products?|p|dp|item|items|prod)\/|-p-\d+|\/pd\//i },
  { key: "category", label: "Category pages", source: /collection|categor|product[-_]?cat|taxonom|department|catalog/i, path: /\/(collections?|categor(y|ies)|product-category|c|shop|catalog|catalogue|department|range|browse)\//i },
  { key: "blog", label: "Blog posts", source: /post|blog|article|news/i, path: /\/(blogs?|news|articles?|posts?|guides?|insights|stories|journal|magazine)\/|\/\d{4}\/\d{2}\//i },
  { key: "tag", label: "Tag pages", source: /tag/i, path: /\/tags?\//i },
  { key: "author", label: "Author pages", source: /author|user/i, path: /\/(author|authors)\//i },
  { key: "brand", label: "Brand pages", source: /brand|vendor|manufacturer/i, path: /\/(brands?|vendors?)\//i },
  { key: "location", label: "Location pages", source: /location|store|city/i, path: /\/(locations?|stores?|store-locator|cities)\//i },
  { key: "info", label: "Information pages", source: /^(page|pages)[-_.]|[-_]pages?[-_.]|^pages?\.xml/i, path: /\/(pages?|about|contact|policies|legal|help|faq)(\/|$)/i },
];

function pathOf(u: string) {
  try {
    return new URL(u).pathname;
  } catch {
    return "";
  }
}

function classify(url: string, source?: string): { key: string; label: string } {
  const path = pathOf(url);
  if (path === "/" || path === "") return { key: "home", label: "Home page" };
  // Path patterns are the most reliable; the sitemap file name helps when paths are flat (/my-product-name).
  for (const r of RULES) if (r.path?.test(path)) return { key: r.key, label: r.label };
  if (source) for (const r of RULES) if (r.source?.test(source)) return { key: r.key, label: r.label };
  const seg = path.split("/").filter(Boolean);
  if (seg.length > 1) return { key: `seg:${seg[0]}`, label: `/${seg[0]}/ pages` };
  return { key: "flat", label: "Other pages" };
}

/** Spread samples through the group (not just the first entries), skipping paginated and parameter URLs. */
function sample(urls: string[], n: number): string[] {
  const clean = urls.filter((u) => !/[?&](page|p|sort|filter)=|\/page\/\d+/i.test(u));
  const pool = clean.length >= n ? clean : urls;
  if (pool.length <= n) return pool.slice();
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(pool[Math.floor((i * pool.length) / n + pool.length / (2 * n))]);
  return [...new Set(out)];
}

export function groupUrls(items: { loc: string; source?: string }[], perGroup = 2, maxGroups = 8): PageGroup[] {
  const map = new Map<string, PageGroup>();
  for (const it of items) {
    const c = classify(it.loc, it.source);
    const g = map.get(c.key) ?? { key: c.key, label: c.label, urls: [], samples: [] };
    g.urls.push(it.loc);
    map.set(c.key, g);
  }
  // Small path groups (fewer than 3 URLs) join "Other pages".
  const other = map.get("flat") ?? { key: "flat", label: "Other pages", urls: [], samples: [] };
  for (const [k, g] of [...map]) {
    if (k.startsWith("seg:") && g.urls.length < 3) {
      other.urls.push(...g.urls);
      map.delete(k);
    }
  }
  if (other.urls.length) map.set("flat", other);
  const order = ["home", "category", "product", "blog"];
  const groups = [...map.values()].sort((a, b) => {
    const ia = order.indexOf(a.key);
    const ib = order.indexOf(b.key);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return b.urls.length - a.urls.length;
  });
  return groups.slice(0, maxGroups).map((g) => ({ ...g, samples: sample(g.urls, g.key === "home" ? 1 : perGroup) }));
}

/** Pulls URLs out of pasted text (one per line, or anywhere in the text). */
export function urlsFromText(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s"'<>,]+/gi) ?? [];
  return [...new Set(found.map((u) => u.replace(/[).;]+$/, "")))];
}
