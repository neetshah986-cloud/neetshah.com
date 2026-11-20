// Fetches a public web page for the tools, refusing anything on a private network.
import { lookup } from "node:dns/promises";
import net from "node:net";

export const BOT_UA = "Mozilla/5.0 (compatible; SEOPeopleHub/1.0; +https://neetshah.com/tools)";
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 15_000;

export class FetchError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("ff");
}

async function assertPublic(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchError("Only http:// and https:// URLs can be checked.");
  if (url.username || url.password) throw new FetchError("URLs with a username or password can't be checked.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal"))
    throw new FetchError("That address is on a private network, so it can't be checked from here.");
  let addresses: string[];
  try {
    addresses = net.isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  } catch {
    throw new FetchError(`Couldn't find ${host}. Check the domain is spelled correctly.`, 422);
  }
  if (!addresses.length || addresses.some(isPrivateIp)) throw new FetchError("That address is on a private network, so it can't be checked from here.");
}

export type FetchedPage = { finalUrl: string; status: number; html: string; bytes: number; ms: number; redirects: string[] };

export async function fetchPage(input: string, opts: { accept?: "html" | "script" } = {}): Promise<FetchedPage> {
  if (/^[a-z][a-z0-9+.-]*:/i.test(input.trim()) && !/^https?:\/\//i.test(input.trim()))
    throw new FetchError("Only http:// and https:// URLs can be checked.");
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  } catch {
    throw new FetchError("That doesn't look like a URL. Try something like https://example.com/page.");
  }

  const started = Date.now();
  const redirects: string[] = [];
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "user-agent": BOT_UA, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "accept-language": "en" },
      });
    } catch (e) {
      const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      throw new FetchError(timeout ? "The page took longer than 15 seconds to respond." : `Couldn't connect to ${url.hostname}.`, 504);
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      redirects.push(`${res.status} ${url.href}`);
      url = new URL(res.headers.get("location")!, url);
      continue;
    }

    const type = res.headers.get("content-type") ?? "";
    const okType = opts.accept === "script" ? /javascript|ecmascript|text\/plain/i : /html|xml/i;
    if (type && !okType.test(type)) throw new FetchError(`That URL returned ${type.split(";")[0]}, not an HTML page.`, 422);

    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BYTES) {
          await reader.cancel();
          throw new FetchError("The page is larger than 5 MB, which is more than this tool reads.", 413);
        }
        chunks.push(value);
      }
    }
    const charset = /charset=([^;]+)/i.exec(type)?.[1]?.trim().toLowerCase() ?? "utf-8";
    let decoder: TextDecoder;
    try {
      decoder = new TextDecoder(charset);
    } catch {
      decoder = new TextDecoder("utf-8");
    }
    const buf = new Uint8Array(bytes);
    let off = 0;
    for (const c of chunks) {
      buf.set(c, off);
      off += c.byteLength;
    }
    return { finalUrl: url.href, status: res.status, html: decoder.decode(buf), bytes, ms: Date.now() - started, redirects };
  }
  throw new FetchError(`The URL redirected more than ${MAX_REDIRECTS} times.`, 508);
}

// Simple per-IP rate limit for the tool APIs (per server process).
const hits = new Map<string, number[]>();
export function rateLimited(ip: string, limit = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v[v.length - 1] > windowMs) hits.delete(k);
  return recent.length > limit;
}
