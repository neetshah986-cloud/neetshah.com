// Looks inside a page's Google Tag Manager containers for structured data tags.
// Containers are public JavaScript (googletagmanager.com/gtm.js?id=GTM-XXXX), so this can be checked directly.
import { fetchPage } from "@/lib/safe-fetch";

export type GtmContainer = { id: string; checked: boolean; schemaTags: number; types: string[] };

// Container IDs from the gtm.js URLs and inline scripts only, never from visible text.
export function gtmIds(html: string): string[] {
  const sources = [
    ...[...html.matchAll(/googletagmanager\.com\/(?:gtm\.js|ns\.html)\?id=(GTM-[A-Z0-9]{4,10})/g)].map((m) => m[1]),
    // The standard snippet builds the URL in code: ...gtm.js?id='+i ... 'dataLayer','GTM-XXXX'
    ...[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
      .filter((m) => m[1].includes("googletagmanager.com/gtm.js"))
      .flatMap((m) => [...m[1].matchAll(/GTM-[A-Z0-9]{4,10}\b/g)].map((x) => x[0])),
  ];
  return [...new Set(sources)].slice(0, 5);
}

const unescapeJs = (s: string) =>
  s
    .replace(/\\x([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\(["'/\\])/g, "$1");

// Reads the value that follows `"vtp_html":` in the container: a string, or a ["template", ...] array of
// strings and macros. Returns the concatenated string literals.
function readHtmlValue(js: string, start: number): string {
  let i = start;
  while (/\s/.test(js[i] ?? "")) i++;
  const readString = (): string => {
    const quote = js[i++];
    let out = "";
    while (i < js.length && js[i] !== quote) {
      if (js[i] === "\\") {
        out += js[i] + (js[i + 1] ?? "");
        i += 2;
      } else out += js[i++];
    }
    i++;
    return out;
  };
  if (js[i] === '"' || js[i] === "'") return readString();
  if (js[i] !== "[") return "";
  let depth = 0;
  let out = "";
  const limit = Math.min(js.length, start + 200_000);
  while (i < limit) {
    const c = js[i];
    if (c === '"' || c === "'") out += readString();
    else {
      if (c === "[") depth++;
      if (c === "]" && --depth === 0) break;
      i++;
    }
  }
  return out;
}

// Only JSON-LD inside Custom HTML tags counts. GTM's own runtime also mentions application/ld+json
// (it reads existing markup for ecommerce), which is not structured data added through GTM.
export function schemaInContainer(js: string): { schemaTags: number; types: string[] } {
  let schemaTags = 0;
  const types = new Set<string>();
  for (const m of js.matchAll(/"vtp_html"\s*:/g)) {
    const html = unescapeJs(readHtmlValue(js, m.index! + m[0].length));
    if (!/application\/ld\+json/i.test(html)) continue;
    schemaTags++;
    for (const t of html.matchAll(/"@type"\s*:\s*"([A-Za-z]+)"/g)) types.add(t[1]);
  }
  return { schemaTags, types: [...types].slice(0, 12) };
}

export async function inspectGtm(html: string): Promise<GtmContainer[]> {
  const ids = gtmIds(html);
  return Promise.all(
    ids.map(async (id) => {
      try {
        const res = await fetchPage(`https://www.googletagmanager.com/gtm.js?id=${id}`, { accept: "script" });
        if (res.status >= 400) return { id, checked: false, schemaTags: 0, types: [] };
        return { id, checked: true, ...schemaInContainer(res.html) };
      } catch {
        return { id, checked: false, schemaTags: 0, types: [] };
      }
    }),
  );
}
