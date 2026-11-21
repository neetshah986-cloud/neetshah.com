// Third-party code: who it belongs to, what it costs, and what to do about it.
import { perfScore, type ScoreMetric } from "./lhscore";
import type { MetricKey } from "./metrics";
import type { MetricValue, Strategy } from "./types";
import type { HtmlTag } from "./tags";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type ThirdPartyCost = "high" | "medium" | "low";

export type ThirdParty = {
  name: string;
  category: string;
  categoryLabel: string;
  homepage?: string;
  bytes: number;
  mainThreadMs: number;
  /** This company's share of the page's Total Blocking Time. */
  blockingMs: number;
  requests: number;
  renderBlocking: boolean;
  /** Started downloading before the main content (LCP) appeared. */
  beforeLcp: boolean;
  firstStartMs?: number;
  /** Estimated score points gained if this company's code waited until after the page loaded. */
  scoreGain: number;
  cost: ThirdPartyCost;
  /** Usually can't be removed (the site's own platform, CDN or consent banner). */
  essential: boolean;
  advice: string[];
  files: { url: string; bytes: number; mainThreadMs: number }[];
};

export type ThirdPartyReport = {
  list: ThirdParty[];
  bytes: number;
  mainThreadMs: number;
  blockingMs: number;
  /** Share of all downloaded bytes and of all main-thread work. */
  byteShare: number;
  mainThreadShare: number;
  /** Estimated score if every non-essential third party waited until after load. */
  scoreIfDelayed: number | null;
  score: number | null;
  /** Tools named in the page HTML that didn't download during the test (set to load later). */
  delayed?: HtmlTag[];
};

const CATEGORY: Record<string, string> = {
  ad: "Advertising",
  analytics: "Analytics",
  social: "Social media",
  video: "Video",
  utility: "Utility",
  hosting: "Hosting and platform",
  marketing: "Marketing",
  "customer-success": "Chat and support",
  content: "Content",
  cdn: "CDN",
  "tag-manager": "Tag manager",
  "consent-provider": "Cookie consent",
  other: "Other",
};

const ESSENTIAL = new Set(["hosting", "cdn", "consent-provider"]);

/** Advice for well-known companies, matched on the start of the name Lighthouse gives. */
const KNOWN: [RegExp, string[]][] = [
  [
    /^Google Tag Manager/,
    [
      "Open the GTM container and pause or delete tags nobody uses any more (old campaigns, duplicate pixels, tests).",
      "Change the trigger of marketing tags (Facebook, Hotjar, ads) from \"All Pages\" or \"Page View\" to \"Window Loaded\", so they run after the page is ready.",
      "Make sure Google Analytics is added once, either in GTM or as gtag.js in the page, not both.",
    ],
  ],
  [/^Google Analytics/, ["Load Google Analytics once, preferably through GTM, and remove any duplicate gtag.js snippet.", "Remove old Universal Analytics (analytics.js) code if it's still on the page."]],
  [/^Facebook/, ["Fire the Facebook pixel after the page has loaded (GTM trigger \"Window Loaded\").", "Send purchase and lead events through Facebook's Conversions API on the server, so the browser has less to run."]],
  [/^(Hotjar|Microsoft Clarity|Lucky Orange|FullStory|Mouseflow|Crazy Egg|Smartlook|Inspectlet)/, ["Session recording is heavy. Record only the pages you're studying, or a sample of visitors.", "Load it after the page has loaded, or remove it once the research is finished."]],
  [/^(Tawk\.to|Intercom|Drift|Zendesk|LiveChat|Crisp|Freshchat|Tidio|HubSpot|Olark|Gorgias|Zopim|LiveChat Inc|Help Scout)/, ["Show a light chat button first, and load the real chat widget only when someone clicks it (a \"facade\").", "Or load the widget after the first scroll or click, or 5 seconds after the page loads (code below)."]],
  [/^(YouTube|Vimeo|Wistia|JW Player|Brightcove)/, ["Replace the embedded player with a thumbnail that loads the real player on click, for example lite-youtube-embed for YouTube.", "Add loading=\"lazy\" to video iframes below the fold."]],
  [/^Google Fonts/, ["Host the font files on your own domain and preload the main one, so the browser doesn't wait on another server.", "Keep font-display: swap so text shows straight away."]],
  [/^(Google\/Doubleclick Ads|Google AdSense|Amazon Ads|Criteo|Taboola|Outbrain|Media\.net|Pubmatic|Rubicon|AppNexus|Index Exchange)/, ["Reserve the size of every ad slot in CSS so ads don't push content down.", "Lazy-load ad slots that are below the fold."]],
  [/^(Shopify|WordPress|Wix|Squarespace|Webflow|Cloudflare|Amazon Web Services|Akamai|Fastly|jsDelivr|unpkg|cdnjs)/, ["This is your platform or CDN, so it usually stays. Check that only the apps and libraries you use are loaded."]],
];

const BY_CATEGORY: Record<string, string[]> = {
  ad: ["Reserve the size of every ad slot so ads don't move content.", "Lazy-load ad slots below the fold."],
  analytics: ["Keep one analytics tool if two do the same job.", "Load it after the page has loaded."],
  social: ["Replace embedded social widgets with plain links or images.", "Load social pixels after the page has loaded."],
  video: ["Show a thumbnail and load the player on click.", "Lazy-load video iframes below the fold."],
  "customer-success": ["Load the chat widget on first click, scroll or after 5 seconds."],
  marketing: ["Load marketing scripts after the page has loaded, and remove ones nobody checks."],
  "tag-manager": ["Remove unused tags and fire marketing tags on \"Window Loaded\"."],
  "consent-provider": ["Keep it, but load it with async and avoid blocking the page while it decides."],
  hosting: ["This is your platform, so it usually stays. Check that only the apps you use are loaded."],
  cdn: ["This is a CDN, so it usually stays. Load only the files the page uses."],
  content: ["Load embedded content lazily when it's below the fold."],
  utility: ["Check whether the page still needs it, and load it with defer or async."],
  other: ["Check whether the page still needs it. If it does, load it with defer or after the page has loaded."],
};

/** A small script that loads other scripts after the first interaction or 5 seconds. */
export const DELAY_LOADER = `<script>
  // Load non-essential scripts after the visitor first interacts, or after 5 seconds.
  (function () {
    var done = false;
    function load() {
      if (done) return;
      done = true;
      ["https://example.com/chat-widget.js", "https://example.com/recorder.js"].forEach(function (src) {
        var s = document.createElement("script");
        s.src = src;
        s.async = true;
        document.body.appendChild(s);
      });
    }
    ["scroll", "click", "keydown", "touchstart"].forEach(function (e) {
      window.addEventListener(e, load, { once: true, passive: true });
    });
    window.addEventListener("load", function () { setTimeout(load, 5000); });
  })();
</script>`;

function scoreValues(lab: Partial<Record<MetricKey, MetricValue>>): Record<ScoreMetric, number> | null {
  const v = (k: MetricKey) => lab[k]?.value;
  const out = { FCP: v("FCP"), SI: v("SI"), LCP: v("LCP"), TBT: v("TBT"), CLS: v("CLS") };
  return Object.values(out).every((x) => typeof x === "number") ? (out as Record<ScoreMetric, number>) : null;
}

export function buildThirdParties(lhr: any, audits: Record<string, any>, lab: Partial<Record<MetricKey, MetricValue>>, strategy: Strategy): ThirdPartyReport {
  const items: any[] = audits["third-parties-insight"]?.details?.items ?? [];
  const entities: any[] = lhr.entities ?? [];
  const requests: any[] = audits["network-requests"]?.details?.items ?? [];
  const blockingUrls = new Set<string>((audits["render-blocking-insight"]?.details?.items ?? []).map((i: any) => String(i.url ?? "")));
  const lcpMs = lab.LCP?.value ?? Infinity;
  const tbt = lab.TBT?.value ?? 0;
  // The insight reports unthrottled time; Lighthouse's other numbers include the simulated slower CPU.
  const cs = lhr.configSettings ?? {};
  const cpu = cs.throttlingMethod === "simulate" ? (cs.throttling?.cpuSlowdownMultiplier ?? 1) : 1;

  // Share Total Blocking Time between companies by the long tasks their scripts caused.
  const tasks: any[] = audits["long-tasks"]?.details?.items ?? [];
  const entityOf = (url: string) => {
    const r = requests.find((x) => x.url === url);
    if (r?.entity) return String(r.entity);
    try {
      const o = new URL(url).origin;
      return entities.find((e) => (e.origins ?? []).includes(o))?.name as string | undefined;
    } catch {
      return undefined;
    }
  };
  const taskBlock = new Map<string, number>();
  let allBlock = 0;
  for (const t of tasks) {
    const b = Math.max(0, (t.duration ?? 0) - 50);
    if (!b) continue;
    allBlock += b;
    const name = entityOf(String(t.url ?? ""));
    if (name) taskBlock.set(name, (taskBlock.get(name) ?? 0) + b);
  }

  const values = scoreValues(lab);
  const score = values ? perfScore(strategy, values).total : null;
  const gainFor = (blockingMs: number) => (values && score !== null ? Math.max(0, perfScore(strategy, { ...values, TBT: Math.max(0, values.TBT - blockingMs) }).total - score) : 0);

  const list: ThirdParty[] = items.map((i) => {
    const name = typeof i.entity === "string" ? i.entity : (i.entity?.text ?? "Unknown");
    const ent = entities.find((e) => e.name === name);
    const category = ent?.category ?? "other";
    const reqs = requests.filter((r) => r.entity === name);
    const files = ((i.subItems?.items ?? []) as any[]).map((s) => ({ url: String(s.url ?? ""), bytes: s.transferSize ?? 0, mainThreadMs: (s.mainThreadTime ?? 0) * cpu }));
    const urls = new Set([...reqs.map((r) => String(r.url)), ...files.map((f) => f.url)]);
    const blockingMs = allBlock ? Math.round(((taskBlock.get(name) ?? 0) / allBlock) * tbt) : 0;
    const starts = reqs.map((r) => r.networkRequestTime ?? r.rendererStartTime).filter((x: any) => typeof x === "number");
    const firstStartMs = starts.length ? Math.min(...starts) : undefined;
    const renderBlocking = [...urls].some((u) => blockingUrls.has(u));
    const essential = ESSENTIAL.has(category);
    const mainThreadMs = (i.mainThreadTime ?? 0) * cpu;
    const bytes = i.transferSize ?? 0;
    const cost: ThirdPartyCost = renderBlocking || blockingMs >= 100 || mainThreadMs >= 250 ? "high" : blockingMs >= 30 || mainThreadMs >= 80 || bytes >= 100_000 ? "medium" : "low";
    let advice = KNOWN.find(([re]) => re.test(name))?.[1] ?? BY_CATEGORY[category] ?? BY_CATEGORY.other;
    // The same script loaded several times (for example one gtag.js per Google tag ID).
    const paths = new Map<string, number>();
    for (const f of files) {
      try {
        const u = new URL(f.url);
        const k = u.host + u.pathname;
        paths.set(k, (paths.get(k) ?? 0) + 1);
      } catch {
        /* not a URL */
      }
    }
    const dup = [...paths.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1])[0];
    if (dup) {
      const isGtag = /googletagmanager\.com\/gtag\/js/.test(dup[0]);
      advice = [
        isGtag
          ? `gtag.js is loaded ${dup[1]} times, once for each Google tag ID (Analytics, Ads, Merchant Center). Load it once and add the other IDs with gtag('config', ...), or move them all into one Google Tag Manager container.`
          : `${dup[0]} is loaded ${dup[1]} times. Load it once and reuse it.`,
        ...advice,
      ];
    }
    return {
      name,
      category,
      categoryLabel: CATEGORY[category] ?? "Other",
      homepage: ent?.homepage,
      bytes,
      mainThreadMs,
      blockingMs,
      requests: reqs.length || files.length,
      renderBlocking,
      beforeLcp: firstStartMs !== undefined && firstStartMs < lcpMs,
      firstStartMs,
      scoreGain: essential ? 0 : gainFor(blockingMs),
      cost,
      essential,
      advice: renderBlocking ? ["It blocks the first paint: add async or defer to its script tag, or load it after the page has loaded.", ...advice] : advice,
      files,
    };
  });
  list.sort((a, b) => b.blockingMs - a.blockingMs || b.mainThreadMs - a.mainThreadMs || b.bytes - a.bytes);

  const totalBytes = requests.reduce((s, r) => s + (r.transferSize ?? 0), 0);
  const totalMain = audits["mainthread-work-breakdown"]?.numericValue ?? 0;
  const bytes = list.reduce((s, t) => s + t.bytes, 0);
  const mainThreadMs = list.reduce((s, t) => s + t.mainThreadMs, 0);
  const blockingMs = list.reduce((s, t) => s + t.blockingMs, 0);
  const delayable = list.filter((t) => !t.essential).reduce((s, t) => s + t.blockingMs, 0);
  return {
    list,
    bytes,
    mainThreadMs,
    blockingMs,
    byteShare: totalBytes ? bytes / totalBytes : 0,
    mainThreadShare: totalMain ? Math.min(1, mainThreadMs / totalMain) : 0,
    scoreIfDelayed: score !== null && values ? score + gainFor(delayable) : null,
    score,
  };
}
