// Calls Google's PageSpeed Insights API (Lighthouse on Google's servers, plus Chrome UX Report field data).
import { htmlTags } from "./tags";
import * as cheerio from "cheerio";
import { FetchError, fetchPage } from "@/lib/safe-fetch";
import { htmlHints } from "./platform";
import type { RawHtml } from "./report";
import type { Strategy } from "./types";

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const TIMEOUT_MS = 170_000;

const LIGHTHOUSE_ERRORS: [RegExp, string][] = [
  [/NO_FCP/, "The page didn't show any content while Google was testing it. It may be blank, very slow, or blocking Google's test browser."],
  [/FAILED_DOCUMENT_REQUEST|ERRORED_DOCUMENT_REQUEST/, "Google's test browser couldn't load the page. Check the URL opens in your browser and isn't blocking Google (Lighthouse uses a Chrome user agent)."],
  [/DNS_FAILURE/, "Google couldn't find that domain. Check it's spelled correctly."],
  [/NOT_HTML/, "That URL isn't an HTML page, so it can't be speed-tested."],
  [/PROTOCOL_TIMEOUT|PAGE_HUNG|TIMEOUT/, "The page took too long to load in Google's test, so Lighthouse gave up. Try again; if it keeps happening, the page is extremely slow or keeps loading in the background."],
  [/INSECURE_DOCUMENT_REQUEST|CERT/, "The page's SSL certificate isn't valid, so Google's test browser refused to load it."],
  [/ERRORED_REQUIRED_ARTIFACT|NO_SPEEDLINE_FRAMES|NO_SCREENSHOTS/, "Lighthouse couldn't finish measuring this page. Running the test again usually works."],
];

export async function runPsi(url: string, strategy: Strategy): Promise<unknown> {
  const params = new URLSearchParams({ url, strategy, category: "performance" });
  const key = process.env.PSI_API_KEY;
  if (key) params.set("key", key);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}?${params}`, { signal: ctrl.signal, cache: "no-store" });
  } catch {
    throw new FetchError("Google's test didn't finish in time. Try again in a minute.", 504);
  } finally {
    clearTimeout(timer);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg: string = body?.error?.message ?? "";
    if (res.status === 429) throw new FetchError("Google's test service is busy (quota reached). Try again in a minute.", 429);
    const known = LIGHTHOUSE_ERRORS.find(([re]) => re.test(msg));
    if (known) throw new FetchError(known[1], 422);
    if (/status code: (\d+)/i.test(msg)) {
      const code = msg.match(/status code: (\d+)/i)![1];
      throw new FetchError(`The page returned HTTP ${code} to Google's test browser, so it couldn't be measured.`, 422);
    }
    throw new FetchError(msg ? `Google's test failed: ${msg.replace(/^Lighthouse returned error: /, "")}` : "Google's test failed. Try again in a minute.", 502);
  }
  const err = body?.lighthouseResult?.runtimeError;
  if (err?.code && err.code !== "NO_ERROR") {
    const known = LIGHTHOUSE_ERRORS.find(([re]) => re.test(err.code));
    throw new FetchError(known ? known[1] : `Lighthouse couldn't test the page: ${err.message ?? err.code}`, 422);
  }
  return body;
}

/** What a crawler that doesn't run JavaScript gets: the raw HTML. */
export async function rawHtml(url: string): Promise<RawHtml> {
  try {
    const page = await fetchPage(url, { timeoutMs: 10_000 });
    const hints = htmlHints(page.html);
    const tags = htmlTags(page.html);
    const $ = cheerio.load(page.html);
    const title = $("title").first().text().trim();
    const hasH1 = $("h1").length > 0;
    $("script, style, noscript, template, svg").remove();
    const text = $("body").text().replace(/\s+/g, " ").trim();
    const words = text ? text.split(" ").length : 0;
    const scripts = (page.html.match(/<script\b/gi) ?? []).length;
    const appShell = words < 60 && scripts >= 3;
    if (page.status >= 400) return { words, hasH1, title, appShell, hints, tags, error: `The server returned HTTP ${page.status} to a plain request.` };
    return { words, hasH1, title, appShell, hints, tags };
  } catch (e) {
    return { words: 0, hasH1: false, title: "", appShell: false, error: e instanceof Error ? e.message : "Couldn't fetch the raw HTML." };
  }
}
