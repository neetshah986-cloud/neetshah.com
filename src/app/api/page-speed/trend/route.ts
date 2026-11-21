import { assertPublicUrl, FetchError, rateLimited } from "@/lib/safe-fetch";
import { fetchTrend } from "@/lib/speed/crux";
import type { Trend } from "@/lib/speed/types";

// CrUX history updates weekly, so a few hours of caching is safe.
const cache = new Map<string, { at: number; trend: Trend | null }>();
const TTL = 6 * 60 * 60_000;

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  if (rateLimited(`trend:${ip}`, 20)) return Response.json({ error: "Too many requests in a minute. Wait a moment and try again." }, { status: 429 });
  let body: { url?: string; strategy?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request wasn't valid JSON." }, { status: 400 });
  }
  const strategy = body.strategy === "desktop" ? "desktop" : "mobile";
  try {
    const url = new URL(String(body.url ?? ""));
    url.hash = "";
    await assertPublicUrl(url);
    const key = `${strategy}|${url.href}`;
    const now = Date.now();
    for (const [k, v] of cache) if (now - v.at > TTL) cache.delete(k);
    const hit = cache.get(key);
    if (hit) return Response.json({ trend: hit.trend });
    const trend = await fetchTrend(url.href, strategy);
    cache.set(key, { at: now, trend });
    return Response.json({ trend });
  } catch (e) {
    if (e instanceof FetchError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof TypeError) return Response.json({ error: "That doesn't look like a valid URL." }, { status: 400 });
    console.error("crux-history", e);
    return Response.json({ error: "Couldn't load the real-visitor history." }, { status: 500 });
  }
}
