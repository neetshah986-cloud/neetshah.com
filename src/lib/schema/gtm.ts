// Looks inside a page's Google Tag Manager containers for structured data tags.
// Containers are public JavaScript (googletagmanager.com/gtm.js?id=GTM-XXXX), so this can be checked directly.
import { fetchPage } from "@/lib/safe-fetch";

export type GtmContainer = { id: string; checked: boolean; schemaTags: number; types: string[] };

export function gtmIds(html: string): string[] {
  return [...new Set([...html.matchAll(/GTM-[A-Z0-9]{4,10}\b/g)].map((m) => m[0]))].slice(0, 5);
}

const unescapeJs = (s: string) =>
  s
    .replace(/\\x([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\(["'/\\])/g, "$1");

export function schemaInContainer(js: string): { schemaTags: number; types: string[] } {
  const text = unescapeJs(js);
  const tags = text.match(/application\/ld\+json/gi)?.length ?? 0;
  if (!tags) return { schemaTags: 0, types: [] };
  // Types declared inside those tags, e.g. "@type":"Organization"
  const types = new Set<string>();
  for (const m of text.matchAll(/application\/ld\+json[\s\S]{0,20000}?<\/script>/gi))
    for (const t of m[0].matchAll(/"@type"\s*:\s*"([A-Za-z]+)"/g)) types.add(t[1]);
  return { schemaTags: tags, types: [...types].slice(0, 12) };
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
