// Finds a site's sitemap and returns its page URLs, with the name of the sitemap file each came from
// (Shopify, WordPress and most SEO plugins split sitemaps by page type, which helps grouping).
import { gunzipSync } from "node:zlib";
import * as cheerio from "cheerio";
import { FetchError, fetchPage, rateLimited } from "@/lib/safe-fetch";

const MAX_URLS = 5000;
const MAX_CHILDREN = 10;

type Found = { loc: string; source: string };

function ipOf(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

async function getXml(url: string): Promise<string> {
  const page = await fetchPage(url, { accept: "any", timeoutMs: 12_000 });
  if (page.status >= 400) throw new FetchError(`${new URL(url).pathname} returned HTTP ${page.status}.`, 422);
  const gz = page.body && page.body[0] === 0x1f && page.body[1] === 0x8b;
  return gz ? gunzipSync(page.body!).toString("utf8") : page.html;
}

function parse(xml: string) {
  const $ = cheerio.load(xml, { xml: true });
  const children = $("sitemapindex > sitemap > loc, sitemapindex sitemap loc").map((_, e) => $(e).text().trim()).get();
  const urls = $("urlset > url > loc, urlset url loc").map((_, e) => $(e).text().trim()).get();
  return { children: [...new Set(children)], urls: [...new Set(urls)] };
}

/** Prefer one sitemap per page type (products, categories, posts, pages) over many of the same kind. */
function pickChildren(children: string[]) {
  const kind = (u: string) => {
    let name = u.toLowerCase();
    try {
      name = new URL(u).pathname.toLowerCase();
    } catch {
      /* not a URL */
    }
    name = name.split("/").pop() ?? name;
    // sitemap_products_3.xml, post-sitemap2.xml, sitemap-pages-1.xml.gz -> one kind per type
    return name.replace(/\.xml(\.gz)?$/, "").replace(/[-_]?\d+$/, "");
  };
  const seen = new Map<string, string[]>();
  for (const c of children) {
    const k = kind(c);
    seen.set(k, [...(seen.get(k) ?? []), c]);
  }
  const first = [...seen.values()].map((v) => v[0]);
  const rest = [...seen.values()].flatMap((v) => v.slice(1));
  return [...first, ...rest].slice(0, MAX_CHILDREN);
}

const sourceName = (u: string) => {
  try {
    return new URL(u).pathname.split("/").pop() || u;
  } catch {
    return u;
  }
};

async function fromSitemap(url: string): Promise<{ sitemap: string; found: Found[]; total: number; skipped: number }> {
  const xml = await getXml(url);
  const { children, urls } = parse(xml);
  if (urls.length) return { sitemap: url, found: urls.slice(0, MAX_URLS).map((loc) => ({ loc, source: sourceName(url) })), total: urls.length, skipped: 0 };
  if (!children.length) throw new FetchError("That file isn't a sitemap: it has no <url> or <sitemap> entries.", 422);
  const picked = pickChildren(children);
  const parts = await Promise.allSettled(
    picked.map(async (c) => {
      const inner = parse(await getXml(c));
      // A nested index: read its first child only.
      if (!inner.urls.length && inner.children.length) return { c, urls: parse(await getXml(inner.children[0])).urls };
      return { c, urls: inner.urls };
    }),
  );
  const found: Found[] = [];
  let total = 0;
  const per = Math.max(200, Math.floor(MAX_URLS / Math.max(1, picked.length)));
  for (const p of parts) {
    if (p.status !== "fulfilled") continue;
    total += p.value.urls.length;
    for (const loc of p.value.urls.slice(0, per)) found.push({ loc, source: sourceName(p.value.c) });
  }
  if (!found.length) throw new FetchError("The sitemap index was found, but none of its sitemaps could be read.", 422);
  return { sitemap: url, found, total, skipped: Math.max(0, children.length - picked.length) };
}

export async function POST(request: Request) {
  if (rateLimited(`sitemap:${ipOf(request)}`, 10)) return Response.json({ error: "Too many requests in a minute. Wait a moment and try again." }, { status: 429 });
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request wasn't valid JSON." }, { status: 400 });
  }
  let input = String(body.url ?? "").trim();
  if (!input) return Response.json({ error: "Enter a website or sitemap URL." }, { status: 400 });
  if (!/^https?:\/\//i.test(input)) input = `https://${input}`;
  try {
    const url = new URL(input);
    const looksLikeSitemap = /\.xml(\.gz)?$/i.test(url.pathname) || /sitemap/i.test(url.pathname);
    if (looksLikeSitemap) return Response.json(await fromSitemap(url.href));

    // Website given: sitemaps listed in robots.txt first, then the usual places.
    const candidates: string[] = [];
    try {
      const robots = await fetchPage(`${url.origin}/robots.txt`, { accept: "any", timeoutMs: 8_000 });
      if (robots.status < 400) for (const m of robots.html.matchAll(/^\s*sitemap:\s*(\S+)/gim)) candidates.push(m[1]);
    } catch {
      /* no robots.txt */
    }
    candidates.push(`${url.origin}/sitemap.xml`, `${url.origin}/sitemap_index.xml`, `${url.origin}/wp-sitemap.xml`);
    let lastError = "";
    for (const c of [...new Set(candidates)].slice(0, 6)) {
      try {
        return Response.json(await fromSitemap(c));
      } catch (e) {
        lastError = e instanceof Error ? e.message : "";
        // The site isn't answering at all (often bot protection): don't wait on every other location too.
        if (e instanceof FetchError && e.status === 504) break;
      }
    }
    return Response.json({ error: `Couldn't find a readable sitemap for ${url.host}${lastError ? ` (${lastError})` : ""}. Enter the sitemap URL, or paste page URLs instead.` }, { status: 404 });
  } catch (e) {
    if (e instanceof FetchError) return Response.json({ error: `${e.message} Some sites block tools like this one; paste page URLs instead.` }, { status: e.status });
    if (e instanceof TypeError) return Response.json({ error: "That doesn't look like a valid URL." }, { status: 400 });
    console.error("sitemap", e);
    return Response.json({ error: "Couldn't read the sitemap. Paste page URLs instead." }, { status: 500 });
  }
}
