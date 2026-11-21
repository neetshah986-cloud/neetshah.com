import { assertPublicUrl, FetchError, rateLimited } from "@/lib/safe-fetch";
import { rawHtml, runPsi } from "@/lib/speed/psi";
import { buildRun, type RawHtml } from "@/lib/speed/report";
import type { SpeedRun, Strategy } from "@/lib/speed/types";

// Google can take over a minute on heavy pages, longer than the CDN in front of the site keeps a request open.
// So a test runs as a background job: POST starts it, and the browser polls GET ?job=… with short requests.

type Job = { key: string; started: number; finished?: number; run?: SpeedRun; error?: { message: string; status: number } };

const results = new Map<string, { at: number; run: SpeedRun }>();
const rawCache = new Map<string, { at: number; raw: Promise<RawHtml> }>();
const jobs = new Map<string, Job>();
const RESULT_TTL = 10 * 60_000;
const JOB_TTL = 15 * 60_000;

function tidy() {
  const now = Date.now();
  for (const [k, v] of results) if (now - v.at > RESULT_TTL) results.delete(k);
  for (const [k, v] of rawCache) if (now - v.at > RESULT_TTL) rawCache.delete(k);
  for (const [k, v] of jobs) if (now - v.started > JOB_TTL) jobs.delete(k);
}

function start(id: string, key: string, url: string, strategy: Strategy) {
  const job: Job = { key, started: Date.now() };
  jobs.set(id, job);
  let raw = rawCache.get(url);
  if (!raw) {
    raw = { at: Date.now(), raw: rawHtml(url) };
    rawCache.set(url, raw);
  }
  const rawP = raw.raw;
  (async () => {
    try {
      const [psi, info] = await Promise.all([runPsi(url, strategy), rawP]);
      const run = buildRun(psi, strategy, url, info);
      results.set(key, { at: Date.now(), run });
      job.run = run;
    } catch (e) {
      if (!(e instanceof FetchError)) console.error("page-speed", e);
      job.error = e instanceof FetchError ? { message: e.message, status: e.status } : { message: "Something went wrong running the test. Try again.", status: 500 };
    } finally {
      job.finished = Date.now();
    }
  })();
}

function ipOf(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: Request) {
  if (rateLimited(`speed:${ipOf(request)}`, 24)) return Response.json({ error: "Too many tests in a minute. Wait a moment and try again." }, { status: 429 });

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
    tidy();
    const key = `${strategy}|${url.href}`;
    const hit = results.get(key);
    if (hit && !body.fresh) return Response.json({ run: hit.run });

    // Reuse a test that's already running for the same page and device.
    for (const [id, j] of jobs) if (j.key === key && !j.finished) return Response.json({ job: id });

    const id = crypto.randomUUID();
    if (body.fresh) results.delete(key);
    start(id, key, url.href, strategy);
    return Response.json({ job: id }, { status: 202 });
  } catch (e) {
    if (e instanceof FetchError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof TypeError) return Response.json({ error: "That doesn't look like a valid URL." }, { status: 400 });
    console.error("page-speed", e);
    return Response.json({ error: "Something went wrong running the test. Try again." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("job") ?? "";
  const job = jobs.get(id);
  if (!job) return Response.json({ error: "lost" }, { status: 404 });
  if (job.error) return Response.json({ error: job.error.message }, { status: job.error.status });
  if (job.run) return Response.json({ run: job.run });
  return Response.json({ running: true, secs: Math.round((Date.now() - job.started) / 1000) }, { headers: { "cache-control": "no-store" } });
}
