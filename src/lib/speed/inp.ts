// Reads the results copied from the INP finder script and explains them in plain words.
import type { CodeBlock } from "./types";

export type InpScript = { url: string; fn: string; invoker: string; type: string; ms: number; layout: number };
export type InpInteraction = {
  type: string;
  target: string;
  text: string;
  start: number;
  duration: number;
  inputDelay: number;
  processing: number;
  presentation: number;
  scripts: InpScript[];
};
export type InpResults = { url: string; when: string; ua: string; inp: number; interactions: InpInteraction[] };

export type Phase = "wait" | "code" | "draw";
export type ScriptSummary = { url: string; fn: string; ms: number; count: number; owner: string; thirdParty: boolean };
export type InpAdvice = { phase: Phase; title: string; why: string; steps: string[]; code?: CodeBlock };
export type InpAnalysis = {
  results: InpResults;
  rating: "good" | "ni" | "poor";
  worst?: InpInteraction;
  slow: InpInteraction[];
  phase?: Phase;
  advice?: InpAdvice;
  scripts: ScriptSummary[];
  mobileNote: boolean;
};

export function parseInp(text: string): InpResults {
  let data: unknown;
  try {
    data = JSON.parse(text.trim());
  } catch {
    throw new Error("That isn't the INP finder's result. In the panel on your page, click Copy results, then paste here.");
  }
  const d = data as Partial<InpResults> & { tool?: string };
  if (d.tool !== "neetshah-inp-finder" || !Array.isArray(d.interactions)) throw new Error("That isn't the INP finder's result. In the panel on your page, click Copy results, then paste here.");
  return { url: String(d.url ?? ""), when: String(d.when ?? ""), ua: String(d.ua ?? ""), inp: Number(d.inp) || 0, interactions: d.interactions as InpInteraction[] };
}

export const inpRating = (ms: number) => (ms <= 200 ? "good" : ms <= 500 ? "ni" : "poor") as "good" | "ni" | "poor";

/** Who owns a script, from its URL: the site, a WordPress plugin, a Shopify app, or another company. */
export function scriptOwner(url: string, pageUrl: string): { owner: string; thirdParty: boolean } {
  if (!/^https?:/.test(url)) return { owner: "Code in the page HTML", thirdParty: false };
  let u: URL;
  let page: URL | null = null;
  try {
    u = new URL(url);
    page = new URL(pageUrl);
  } catch {
    return { owner: "Unknown", thirdParty: false };
  }
  const plugin = u.pathname.match(/\/wp-content\/plugins\/([^/]+)\//)?.[1];
  if (plugin) return { owner: `WordPress plugin "${plugin}"`, thirdParty: false };
  if (/\/wp-content\/themes\/([^/]+)\//.test(u.pathname)) return { owner: `WordPress theme "${u.pathname.match(/\/wp-content\/themes\/([^/]+)\//)![1]}"`, thirdParty: false };
  const app = u.pathname.match(/\/extensions\/[0-9a-f-]{8,}\/([^/]+)\//)?.[1];
  if (app) return { owner: `Shopify app "${app.replace(/-\d+$/, "")}"`, thirdParty: true };
  if (/cdn\.shopify\.com|\/cdn\/shop\//.test(url) && /\/t\/\d+\/assets\//.test(u.pathname)) return { owner: "Your Shopify theme", thirdParty: false };
  if (/cdn\.shopify\.com\/shopifycloud|\/cdn\/shopifycloud\//.test(url)) return { owner: "Shopify", thirdParty: false };
  const host = u.hostname.replace(/^www\./, "");
  const pageHost = page?.hostname.replace(/^www\./, "") ?? "";
  if (host === pageHost || host.endsWith(`.${pageHost}`) || pageHost.endsWith(`.${host}`)) return { owner: "Your site's code", thirdParty: false };
  return { owner: host, thirdParty: true };
}

const YIELD: CodeBlock = {
  label: "Show feedback first, then do the work (JavaScript)",
  lang: "js",
  code: `button.addEventListener("click", async () => {
  button.classList.add("is-loading"); // 1. visible feedback straight away
  await yieldToMain();                // 2. let the browser paint it
  updateCartAndTrack();               // 3. then the heavy work
});

function yieldToMain() {
  if (globalThis.scheduler?.yield) return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}`,
};

export function analyseInp(results: InpResults): InpAnalysis {
  const list = [...results.interactions].sort((a, b) => b.duration - a.duration);
  const worst = list[0];
  const slow = list.filter((i) => i.duration > 200);
  // Scripts behind the slow interactions (or the worst one, if none is slow), added up.
  const pool = slow.length ? slow : worst ? [worst] : [];
  const map = new Map<string, ScriptSummary>();
  for (const it of pool) {
    for (const s of it.scripts ?? []) {
      const key = `${s.url}|${s.fn}`;
      const o = scriptOwner(s.url, results.url);
      const m = map.get(key) ?? { url: s.url, fn: s.fn, ms: 0, count: 0, ...o };
      m.ms += s.ms;
      m.count++;
      map.set(key, m);
    }
  }
  const scripts = [...map.values()].sort((a, b) => b.ms - a.ms).slice(0, 8);

  let phase: Phase | undefined;
  let advice: InpAdvice | undefined;
  if (worst && worst.duration > 200) {
    const parts: [Phase, number][] = [
      ["wait", worst.inputDelay],
      ["code", worst.processing],
      ["draw", worst.presentation],
    ];
    phase = parts.sort((a, b) => b[1] - a[1])[0][0];
    const what = `${worst.type === "tap" ? "tapping" : worst.type === "keydown" || worst.type === "keypress" ? "typing in" : "clicking"} ${worst.text ? `"${worst.text}"` : worst.target}`;
    const top = worst.scripts?.[0];
    const topText = top ? `${top.fn ? `${top.fn}() in ` : ""}${top.url.split("/").pop() || top.url}` : "";
    if (phase === "wait") {
      const others = (worst.scripts ?? []).filter((s) => s.type !== "event-listener");
      advice = {
        phase,
        title: `The page was busy when the visitor was ${what}`,
        why: `The browser waited ${worst.inputDelay} ms before it could even start handling the ${worst.type}, because other JavaScript was already running${others[0] ? ` (${others[0].url.split("/").pop()}${others[0].fn ? `, ${others[0].fn}` : ""})` : ""}. This is usually third-party tags, timers, or the page still starting up.`,
        steps: [
          "Delay third-party scripts (chat, analytics, session recording, ads) until after the page has loaded or the first interaction.",
          "Split long JavaScript tasks into smaller pieces so the browser can respond in between (yield to the main thread).",
          "Check the Third parties tab: the companies listed there run code that can block taps.",
        ],
        code: YIELD,
      };
    } else if (phase === "code") {
      advice = {
        phase,
        title: `The code that runs when ${what} takes ${worst.processing} ms`,
        why: `${topText ? `Most of it is ${topText}${top && scriptOwner(top.url, results.url).thirdParty ? ", which comes from a third party" : ""}. ` : ""}The browser can't show anything new until the event handlers finish.`,
        steps: [
          "Show visual feedback first (a spinner, the button state), then do the heavy work after yielding to the main thread.",
          "Move work that isn't needed for the next frame (analytics events, saving, recalculating) to after the paint, or to requestIdleCallback.",
          "For typing and scrolling, debounce the handler so it doesn't run on every key press.",
          "If a plugin, app or tag manager adds the handler, check its settings or replace it.",
        ],
        code: YIELD,
      };
    } else {
      const layout = (worst.scripts ?? []).reduce((n, s) => n + (s.layout ?? 0), 0);
      advice = {
        phase,
        title: `Showing the result of ${what} takes ${worst.presentation} ms`,
        why: `The handlers finish quickly, but the browser then spends ${worst.presentation} ms working out styles and layout and painting the change.${layout > 30 ? ` ${layout} ms of it is forced layout: scripts read sizes or positions right after changing the page.` : ""} Large DOM changes (opening a big menu, rendering a long list) cause this.`,
        steps: [
          "Change less of the page at once: update only the part that changes, and render long lists in pages or as the visitor scrolls.",
          "Add content-visibility: auto to large sections that are off screen, so the browser skips them.",
          "Avoid reading element sizes (offsetHeight, getBoundingClientRect) right after changing the page in the same handler.",
          "Keep the page's DOM size down: fewer than about 1,500 elements is a good target.",
        ],
      };
    }
  }
  return { results, rating: inpRating(results.inp), worst, slow, phase, advice, scripts, mobileNote: !/Mobile|Android|iPhone/i.test(results.ua) };
}
