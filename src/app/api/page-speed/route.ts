import { assertPublicUrl, FetchError, rateLimited } from "@/lib/safe-fetch";
import { rawHtml, runPsi } from "@/lib/speed/psi";
import { buildRun, type RawHtml } from "@/lib/speed/report";
import type { SpeedRun, Strategy } from "@/lib/speed/types";

// Results are kept for 10 minutes so a refresh or the other device tab doesn't spend Google quota again.
const cache = new Map<string, { at: number; run: SpeedRun }>();
const rawCache = new Map<string, { at: number; raw: Promise<RawHtml> }>();
const TTL = 10 * 60_000;

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  if (rateLimited(`speed:${ip}`, 12)) return Response.json({ error: "Too many tests in a minute. Wait a moment and try again." }, { status: 429 });

  let body: { url?: string; strategy?: string; fresh?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request wasn't valid JSON." }, { status: 400 });
  }
  const strategy: Strategy = body.strategy === "desktop" ? "desktop" : "mobile";
  let input = String(body.url ?? "").trim();
  if (!input) return Response.json({ error: "Enter a URL to test." }, { status: 400 });
  if (!/^https?:\/\//i.test(input)) input = `https://${input}`;

  try {
    const url = new URL(input);
    url.hash = "";
    await assertPublicUrl(url);
    const key = `${strategy}|${url.href}`;
    const now = Date.now();
    for (const [k, v] of cache) if (now - v.at > TTL) cache.delete(k);
    for (const [k, v] of rawCache) if (now - v.at > TTL) rawCache.delete(k);
    const hit = cache.get(key);
    if (hit && !body.fresh) return Response.json(hit.run);

    let raw = rawCache.get(url.href);
    if (!raw) {
      raw = { at: now, raw: rawHtml(url.href) };
      rawCache.set(url.href, raw);
    }
    const [psi, rawInfo] = await Promise.all([runPsi(url.href, strategy), raw.raw]);
    const run = buildRun(psi, strategy, url.href, rawInfo);
    cache.set(key, { at: Date.now(), run });
    return Response.json(run);
  } catch (e) {
    if (e instanceof FetchError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof TypeError) return Response.json({ error: "That doesn't look like a valid URL." }, { status: 400 });
    console.error("page-speed", e);
    return Response.json({ error: "Something went wrong running the test. Try again." }, { status: 500 });
  }
}
