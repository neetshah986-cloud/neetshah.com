// Turns Lighthouse audits into fixes a beginner can follow and a developer can apply.
import { formatBytes, formatMs, type MetricKey, type Rating } from "./metrics";
import type { CodeBlock, Finding, FindingElement, FindingResource, Impact, NodeRef, Strategy } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Audit = {
  id: string;
  title: string;
  description?: string;
  score: number | null;
  scoreDisplayMode?: string;
  displayValue?: string;
  numericValue?: number;
  metricSavings?: Partial<Record<string, number>>;
  details?: any;
};

export type Ctx = {
  pageUrl: string;
  origin: string;
  strategy: Strategy;
  dpr: number;
  viewportWidth: number;
  audits: Record<string, Audit>;
  labRating: Partial<Record<MetricKey, Rating>>;
  labValue: Partial<Record<MetricKey, number>>;
  /** DOM path of the LCP element, so every fix to it also keeps it eager and high priority. */
  lcpPath?: string;
  /** URL of the LCP image, when there is one. */
  lcpUrl?: string;
  /** Natural image sizes, by URL, read from the image delivery audit. */
  natural: Map<string, [number, number]>;
};

// ---------- helpers ----------

export function toNode(n: any): NodeRef | undefined {
  if (!n || n.type !== "node") return undefined;
  const r = n.boundingRect;
  return {
    selector: n.selector ?? "",
    snippet: n.snippet ?? "",
    label: n.nodeLabel ?? "",
    path: n.path,
    rect: r && r.width > 0 && r.height > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : undefined,
  };
}

function siteOf(host: string): string {
  const parts = host.replace(/^www\./, "").split(".");
  if (parts.length > 2 && parts[parts.length - 1].length === 2 && parts[parts.length - 2].length <= 3) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}

export function isThirdParty(url: string, origin: string): boolean {
  try {
    return siteOf(new URL(url).hostname) !== siteOf(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/** Same-site URLs are shown as paths; others in full. */
export function shortUrl(url: string, origin: string): string {
  try {
    const u = new URL(url);
    if (u.origin === origin) return u.pathname + u.search;
    return u.host + u.pathname + u.search;
  } catch {
    return url;
  }
}

/** URLs inside code samples: a path for the same origin, otherwise the full URL so it still works when pasted. */
export function codeUrl(url: string, origin: string): string {
  try {
    const u = new URL(url);
    return u.origin === origin ? u.pathname + u.search : u.href;
  } catch {
    return url;
  }
}

/** Inline scripts are reported against the page URL itself. */
export function scriptName(url: string, c: { origin: string; pageUrl: string }): string {
  try {
    const u = new URL(url);
    const p = new URL(c.pageUrl);
    if (u.origin === p.origin && u.pathname === p.pathname) return "Inline scripts in the page HTML";
  } catch {
    /* not a URL */
  }
  return shortUrl(url, c.origin);
}

function escapeAttr(v: string) {
  return v.replace(/"/g, "&quot;");
}

/** Sets or replaces an attribute on the opening tag in an element snippet. */
export function setAttr(snippet: string, name: string, value: string | null): string {
  const re = new RegExp(`\\s${name}(\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+))?`, "i");
  const attr = value === null ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`;
  if (re.test(snippet)) return snippet.replace(re, attr);
  return snippet.replace(/\s*(\/?)>/, `${attr}$1>`);
}

export function removeAttr(snippet: string, name: string): string {
  return snippet.replace(new RegExp(`\\s${name}(\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+))?`, "i"), "");
}

export function getAttr(snippet: string, name: string): string | undefined {
  const m = snippet.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[2] ?? m[3] ?? m[4]) : undefined;
}

export function plainText(md = ""): string {
  return md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s*Learn (more|how)[^.]*\.?/gi, "")
    .trim();
}

function savings(a: Audit) {
  const s = a.metricSavings ?? {};
  const pick = (k: string) => (typeof s[k] === "number" ? (s[k] as number) : 0);
  return { LCP: pick("LCP"), FCP: pick("FCP"), TBT: pick("TBT"), INP: pick("INP"), CLS: pick("CLS") };
}

function weigh(a: Audit, extra = 0): number {
  const s = savings(a);
  let w = (s.LCP / 1000) * 25 + (s.FCP / 1000) * 10 + (s.TBT / 1000) * 30 + (s.INP / 1000) * 30 + s.CLS * 250 + extra;
  if (a.score === 0) w = Math.max(w, 3);
  else if ((a.score ?? 1) < 0.5) w = Math.max(w, 2);
  else w = Math.max(w, 1);
  return Math.round(w * 10) / 10;
}

export function impactOf(w: number): Impact {
  return w >= 12 ? "high" : w >= 4 ? "medium" : "low";
}

function metricsOf(a: Audit, fallback: MetricKey[]): MetricKey[] {
  const s = savings(a);
  const out: MetricKey[] = [];
  if (s.LCP > 0) out.push("LCP");
  if (s.FCP > 0) out.push("FCP");
  if (s.TBT > 0 || s.INP > 0) out.push("TBT");
  if (s.CLS > 0) out.push("CLS");
  return out.length ? out : fallback;
}

function failing(a?: Audit): a is Audit {
  if (!a) return false;
  if (a.scoreDisplayMode === "notApplicable" || a.scoreDisplayMode === "error" || a.scoreDisplayMode === "manual") return false;
  return a.score !== null && a.score < 0.9;
}

function base(a: Audit, partial: Omit<Finding, "id" | "auditId" | "impact" | "weight" | "elements" | "resources" | "steps" | "code"> & Partial<Finding>, extraWeight = 0): Finding {
  const weight = partial.weight ?? weigh(a, extraWeight);
  return {
    id: a.id,
    auditId: a.id,
    elements: [],
    resources: [],
    steps: [],
    code: [],
    ...partial,
    weight,
    impact: partial.impact ?? impactOf(weight),
  };
}

function rows(a?: Audit): any[] {
  return Array.isArray(a?.details?.items) ? a!.details.items : [];
}

function scriptTag(url: string) {
  return `<script src="${url}" defer></script>`;
}

// ---------- the fixes ----------

type Builder = (a: Audit, c: Ctx) => Finding | Finding[] | null;

const lcpDiscovery: Builder = (a, c) => {
  const items = rows(a);
  const check = items.find((i) => i.type === "checklist")?.items ?? {};
  const node = toNode(items.find((i) => i.type === "node"));
  const bad = Object.entries(check).filter(([, v]: any) => v && v.value === false).map(([k]) => k);
  if (!bad.length || !node) return null;
  const problems: string[] = [];
  let fixed = node.snippet;
  const steps: string[] = [];
  const code: CodeBlock[] = [];
  const src = getAttr(node.snippet, "src");
  if (bad.includes("eagerlyLoaded")) {
    problems.push('It has loading="lazy", so the browser doesn\'t request it until the layout is worked out.');
    fixed = removeAttr(fixed, "loading");
    steps.push('Remove loading="lazy" from this element. Lazy loading is right for images further down the page, never for the main one.');
  }
  if (bad.includes("priorityHinted")) {
    problems.push('It has no fetchpriority="high", so it downloads at the same priority as everything else.');
    fixed = setAttr(fixed, "fetchpriority", "high");
    steps.push('Add fetchpriority="high" so the browser downloads it before other images and scripts.');
  }
  if (bad.includes("requestDiscoverable")) {
    problems.push("It isn't in the HTML the server sends (it's a CSS background image or added by JavaScript), so the browser finds it late.");
    const href = src ?? c.lcpUrl ?? "/images/hero.webp";
    code.push({ label: "Add to the <head>, before your stylesheets", lang: "html", code: `<link rel="preload" as="image" href="${codeUrl(href, c.origin)}" fetchpriority="high">` });
    steps.push("Put the image in the HTML as a normal <img>, or preload it from the <head> so the browser starts downloading it straight away.");
  }
  steps.push("WordPress: exclude this image from your lazy-load or optimisation plugin. Next.js: add the priority prop to its <Image>.");
  return base(a, {
    title: "Load the main image (LCP element) sooner",
    summary: problems.join(" "),
    why: "Google measures LCP on this element. Every moment the browser waits before it starts downloading it is added straight to your LCP time.",
    metrics: ["LCP"],
    savingsMs: savings(a).LCP || undefined,
    elements: [{ node, current: node.snippet, fixed: fixed !== node.snippet ? fixed : undefined }],
    steps,
    code,
    owner: "Developer",
    weight: Math.max(weigh(a), c.labRating.LCP === "good" ? 4 : 14),
  });
};

const renderBlocking: Builder = (a, c) => {
  if (!failing(a)) return null;
  const items = rows(a).filter((i) => i.url);
  if (!items.length) return null;
  const resources: FindingResource[] = items.map((i) => ({ url: i.url, bytes: i.totalBytes, ms: i.wastedMs, thirdParty: isThirdParty(i.url, c.origin) }));
  const js = items.filter((i) => /\.m?js(\?|$)/i.test(i.url) || /javascript/i.test(i.mimeType ?? ""));
  const css = items.filter((i) => !js.includes(i));
  const code: CodeBlock[] = [];
  const steps: string[] = [];
  if (js.length) {
    steps.push("Add defer to scripts that aren't needed to show the first screen. They still run, but after the HTML is parsed, in the same order.");
    code.push({ label: "Scripts: add defer", lang: "html", code: js.map((i) => scriptTag(codeUrl(i.url, c.origin))).join("\n") });
  }
  const gf = css.filter((i) => /fonts\.googleapis\.com/.test(i.url));
  const own = css.filter((i) => !gf.includes(i));
  if (own.length) {
    steps.push("Inline the small amount of CSS needed for the first screen (critical CSS) in a <style> tag, and load the full stylesheet without blocking.");
    code.push({
      label: "Stylesheets: inline critical CSS, load the rest without blocking",
      lang: "html",
      code: [
        "<style>/* Critical CSS: only what the first screen needs */</style>",
        ...own.map((i) => {
          const u = codeUrl(i.url, c.origin);
          return `<link rel="preload" href="${u}" as="style" onload="this.onload=null;this.rel='stylesheet'">\n<noscript><link rel="stylesheet" href="${u}"></noscript>`;
        }),
      ].join("\n"),
    });
  }
  if (gf.length) {
    steps.push("For Google Fonts, connect to the font server early and add display=swap so text shows while the font loads.");
    code.push({
      label: "Google Fonts",
      lang: "html",
      code: `<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="${gf[0].url.includes("display=") ? gf[0].url : gf[0].url + (gf[0].url.includes("?") ? "&" : "?") + "display=swap"}">`,
    });
  }
  steps.push("WordPress: a performance plugin's \"defer JavaScript\" and \"critical CSS\" options do this. Test the page afterwards, as some scripts must stay in order.");
  const longest = Math.max(...items.map((i) => i.wastedMs ?? 0));
  return base(a, {
    title: "Stop CSS and JavaScript from blocking the first paint",
    summary: `${items.length} file${items.length > 1 ? "s" : ""} must download before the browser can show anything. The slowest takes ${formatMs(longest)}, and the screen stays blank until it arrives.`,
    why: "Until these files arrive, the screen stays empty. Visitors on mobile networks see a white page and some leave before anything appears.",
    metrics: metricsOf(a, ["FCP", "LCP"]),
    savingsMs: Math.max(savings(a).FCP, savings(a).LCP) || undefined,
    resources,
    steps,
    code,
    owner: "Developer",
  });
};

const documentLatency: Builder = (a, c) => {
  if (!failing(a)) return null;
  const check = a.details?.items ?? {};
  const dbg = a.details?.debugData ?? {};
  const steps: string[] = [];
  const code: CodeBlock[] = [];
  const parts: string[] = [];
  if (check.serverResponseIsFast?.value === false) {
    parts.push(`The server took ${formatMs(dbg.serverResponseTime ?? 0)} to start sending the page. Google's target for the whole Time to First Byte is under 800 ms.`);
    steps.push("Turn on full-page caching so the server sends a ready-made page instead of building it for every visitor (WordPress: LiteSpeed Cache, WP Rocket or your host's cache).");
    steps.push("Serve the site through a CDN (Cloudflare, Fastly, CloudFront, Hostinger CDN) so pages come from a server close to the visitor.");
    steps.push("If it's still slow, find what the server is waiting on: slow database queries, heavy plugins or calls to other services while the page is built.");
    code.push({
      label: "Let a CDN cache the HTML for a few minutes",
      lang: "text",
      code: "Cache-Control: public, max-age=0, s-maxage=600, stale-while-revalidate=86400",
    });
  }
  if (check.noRedirects?.value === false) {
    parts.push(`The URL redirects before the page loads${dbg.redirectDuration ? `, costing ${formatMs(dbg.redirectDuration)}` : ""}.`);
    steps.push("Link to the final URL directly (right protocol, www or non-www, trailing slash) in menus, sitemaps, ads and canonical tags.");
  }
  if (check.usesCompression?.value === false) {
    parts.push("The HTML isn't compressed.");
    steps.push("Turn on gzip or Brotli compression for HTML, CSS and JavaScript.");
    code.push({ label: "Apache (.htaccess)", lang: "apache", code: "<IfModule mod_deflate.c>\n  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json image/svg+xml\n</IfModule>" });
    code.push({ label: "Nginx", lang: "nginx", code: "gzip on;\ngzip_types text/css application/javascript application/json image/svg+xml;" });
  }
  void c;
  return base(a, {
    title: check.serverResponseIsFast?.value === false ? "Make the server respond faster" : "Speed up the first response",
    summary: parts.join(" "),
    why: "Nothing else can start until the HTML arrives, so a slow server delays every other metric. It's also the first thing crawlers, including AI crawlers, wait on.",
    metrics: ["TTFB", "FCP", "LCP"],
    savingsMs: savings(a).LCP || savings(a).FCP || undefined,
    steps,
    code,
    owner: "Server / hosting",
  });
};

function srcsetFor(src: string, displayW: number, naturalW?: number) {
  const dot = src.lastIndexOf(".");
  const q = src.indexOf("?");
  const stem = dot > src.lastIndexOf("/") ? src.slice(0, dot) : q > 0 ? src.slice(0, q) : src;
  const target = Math.ceil(displayW / 100) * 100;
  const widths = [...new Set([Math.round(target / 2 / 10) * 10, target, Math.min(target * 2, naturalW ?? target * 2)])].filter((w) => w >= 200).sort((x, y) => x - y);
  return { stem, widths, srcset: widths.map((w) => `${stem}-${w}.webp ${w}w`).join(", ") };
}

const imageDelivery: Builder = (a, c) => {
  if (!failing(a)) return null;
  const items = rows(a).filter((i) => i.url);
  if (!items.length) return null;
  const elements: FindingElement[] = [];
  const resources: FindingResource[] = [];
  for (const i of items) {
    const node = toNode(i.node);
    const reasons: string[] = (i.subItems?.items ?? []).map((s: any) => String(s.reason ?? "")).filter(Boolean);
    const plain = reasons.map((r) =>
      /modern image format|compression/i.test(r)
        ? "Use WebP or AVIF, or compress it more."
        : /larger than it needs to be/i.test(r)
          ? r.replace(/^This image file is larger than it needs to be \((\d+)x(\d+)\) for its displayed dimensions \((\d+)x(\d+)\).*/i, "It's $1×$2 pixels but shown at $3×$4. Serve a smaller version.")
          : /animated/i.test(r)
            ? "It's an animated GIF. A video file is far smaller."
            : r,
    );
    resources.push({ url: i.url, bytes: i.totalBytes, wastedBytes: i.wastedBytes, note: plain.join(" "), thirdParty: isThirdParty(i.url, c.origin) });
    if (node && /^<img\b/i.test(node.snippet)) {
      const src = getAttr(node.snippet, "src") ?? codeUrl(i.url, c.origin);
      const nat = c.natural.get(i.url);
      const displayW = (node.rect?.width ?? 600) * c.dpr;
      const { stem, widths, srcset } = srcsetFor(src, displayW, nat?.[0]);
      const ratio = node.rect ? node.rect.width / c.viewportWidth : 1;
      const sizes = ratio >= 0.9 ? "100vw" : `(max-width: ${Math.round(c.viewportWidth)}px) ${Math.round(ratio * 100)}vw, ${Math.round(node.rect?.width ?? 600)}px`;
      let fixed = setAttr(node.snippet, "src", `${stem}-${widths[Math.min(1, widths.length - 1)]}.webp`);
      fixed = setAttr(fixed, "srcset", srcset);
      fixed = setAttr(fixed, "sizes", sizes);
      const [w, h] = nat ?? (node.rect ? [Math.round(node.rect.width), Math.round(node.rect.height)] : [0, 0]);
      if (w && h && !getAttr(fixed, "width")) fixed = setAttr(setAttr(fixed, "width", String(w)), "height", String(h));
      fixed = keepLcpFast(fixed, node, c);
      elements.push({
        node,
        note: `${formatBytes(i.totalBytes)} now, about ${formatBytes(Math.max(0, i.totalBytes - i.wastedBytes))} after the fix. ${plain.join(" ")}`,
        current: node.snippet,
        fixed,
      });
    } else if (node) elements.push({ node, note: plain.join(" ") });
  }
  const wasted = items.reduce((s, i) => s + (i.wastedBytes ?? 0), 0);
  return base(a, {
    title: "Serve smaller images in modern formats",
    summary: `${items.length} image${items.length > 1 ? "s are" : " is"} heavier than needed. Fixing ${items.length > 1 ? "them" : "it"} saves about ${formatBytes(wasted)}.`,
    why: "Images are usually the heaviest part of a page. On a phone connection a large image can take seconds to download, and if it's the main image that delay is your LCP.",
    metrics: metricsOf(a, ["LCP"]),
    savingsMs: savings(a).LCP || undefined,
    savingsBytes: wasted,
    elements,
    resources,
    steps: [
      "Export each image at the size it's shown (the fixed code below lists the widths to make) and save it as WebP or AVIF.",
      "Add srcset and sizes so phones download a small version and large screens a bigger one.",
      "WordPress: an image plugin (ShortPixel, Imagify, EWWW) or your CDN can convert and resize automatically. Next.js: use <Image>, which does this for you.",
    ],
    owner: "Developer or content editor",
  });
};

const cache: Builder = (a, c) => {
  if (!failing(a)) return null;
  const items = rows(a).filter((i) => i.url);
  if (!items.length) return null;
  const resources: FindingResource[] = items.map((i) => ({
    url: i.url,
    bytes: i.totalBytes,
    note: i.cacheLifetimeMs ? `Cached for ${formatCacheTtl(i.cacheLifetimeMs)}` : "Not cached",
    thirdParty: isThirdParty(i.url, c.origin),
  }));
  const own = resources.filter((r) => !r.thirdParty).length;
  const bytes = items.reduce((s, i) => s + (i.wastedBytes ?? i.totalBytes ?? 0), 0);
  return base(
    a,
    {
      title: "Let browsers cache your static files",
      summary: `${items.length} file${items.length > 1 ? "s have" : " has"} no cache lifetime or a short one, so returning visitors download ${formatBytes(bytes)} again.${own < items.length ? ` ${items.length - own} of them come from third parties, which only they can change.` : ""}`,
      why: "This doesn't change a first visit, but it makes every later page view much faster, and real-user data (what Google uses) includes those repeat visits.",
      metrics: ["LCP", "FCP"],
      resources,
      steps: [
        "Give images, fonts, CSS and JavaScript a long cache lifetime (one year), and change the file name or add a version number when the file changes.",
        "Keep HTML on a short lifetime so content updates show straight away.",
        "On Hostinger and most cPanel hosts, add the Apache rules below to .htaccess. If you use a CDN, set the same in its caching rules.",
      ],
      code: [
        {
          label: "Apache (.htaccess)",
          lang: "apache",
          code: '<IfModule mod_headers.c>\n  <FilesMatch "\\.(css|js|mjs|woff2?|ttf|otf|jpe?g|png|gif|webp|avif|svg|ico)$">\n    Header set Cache-Control "public, max-age=31536000, immutable"\n  </FilesMatch>\n</IfModule>',
        },
        { label: "Nginx", lang: "nginx", code: "location ~* \\.(css|js|mjs|woff2?|jpe?g|png|gif|webp|avif|svg|ico)$ {\n  add_header Cache-Control \"public, max-age=31536000, immutable\";\n}" },
      ],
      owner: "Server / hosting",
      weight: Math.min(6, weigh(a)),
    },
  );
};

function formatCacheTtl(ms: number) {
  const s = ms / 1000;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} days`;
}

const fontDisplay: Builder = (a, c) => {
  if (!failing(a)) return null;
  const items = rows(a).filter((i) => i.url);
  if (!items.length) return null;
  const first = codeUrl(items[0].url, c.origin);
  const format = /\.woff2/i.test(first) ? "woff2" : /\.woff/i.test(first) ? "woff" : "truetype";
  return base(a, {
    title: "Show text while web fonts load",
    summary: `${items.length} web font${items.length > 1 ? "s hide" : " hides"} text until ${items.length > 1 ? "they've" : "it's"} downloaded, so visitors see blank space where words should be.`,
    why: "Without font-display: swap, the browser can hide text for up to 3 seconds while it waits for the font. Showing a fallback font first means people can start reading immediately.",
    metrics: metricsOf(a, ["FCP"]),
    savingsMs: savings(a).FCP || undefined,
    resources: items.map((i) => ({ url: i.url, ms: i.wastedMs, thirdParty: isThirdParty(i.url, c.origin) })),
    steps: [
      "Add font-display: swap to each @font-face rule (keep your font's real family name).",
      "Preload the one or two fonts used on the first screen.",
      "Google Fonts: add &display=swap to the stylesheet URL.",
    ],
    code: [
      { label: "CSS", lang: "css", code: `@font-face {\n  font-family: "YourFont";\n  src: url("${first}") format("${format}");\n  font-display: swap;\n}` },
      { label: "In the <head>", lang: "html", code: `<link rel="preload" href="${first}" as="font" type="font/${format}" crossorigin>` },
    ],
    owner: "Developer",
  });
};

/** Layout shifts: which element moved, and what made it move. */
export function clsCauses(c: Ctx) {
  const a = c.audits["cls-culprits-insight"];
  const out: { node?: NodeRef; score: number; causes: { node?: NodeRef; text: string }[] }[] = [];
  const tables = rows(a).filter((t) => t.type === "table");
  const src = tables.length ? tables.flatMap((t) => t.items ?? []) : rows(c.audits["layout-shifts"]);
  for (const r of src) {
    if (r.node?.type !== "node") continue;
    const causes = (r.subItems?.items ?? []).map((s: any) => ({ node: toNode(s.extra), text: String(s.cause ?? "") }));
    const key = r.node.path ?? r.node.selector;
    const existing = out.find((o) => (o.node?.path ?? o.node?.selector) === key);
    if (existing) existing.score = Math.max(existing.score, r.score ?? 0);
    else out.push({ node: toNode(r.node), score: r.score ?? 0, causes });
  }
  return out.sort((x, y) => y.score - x.score);
}

function absolute(src: string | undefined, c: Ctx) {
  if (!src) return undefined;
  try {
    return new URL(src, c.pageUrl).href;
  } catch {
    return src;
  }
}

/** The LCP element must never be lazy-loaded, whatever else is changed on it. */
function keepLcpFast(snippet: string, node: NodeRef, c: Ctx) {
  if (!c.lcpPath || node.path !== c.lcpPath || !/^<img\b/i.test(snippet)) return snippet;
  return setAttr(removeAttr(snippet, "loading"), "fetchpriority", "high");
}

function sizedSnippet(node: NodeRef, c: Ctx, url?: string) {
  const nat = url ? (c.natural.get(url) ?? c.natural.get(absolute(url, c) ?? "")) : undefined;
  const [w, h] = nat ?? (node.rect ? [Math.round(node.rect.width), Math.round(node.rect.height)] : [0, 0]);
  if (!w || !h) return undefined;
  return keepLcpFast(setAttr(setAttr(node.snippet, "width", String(w)), "height", String(h)), node, c);
}

const layoutShift: Builder = (a, c) => {
  const cls = c.labValue.CLS ?? 0;
  const shifts = clsCauses(c);
  if (!shifts.length || (cls <= 0.1 && !failing(a))) return null;
  const elements: FindingElement[] = [];
  const seen = new Set<string>();
  const steps = new Set<string>();
  const code: CodeBlock[] = [];
  for (const s of shifts.slice(0, 5)) {
    if (!s.causes.length && s.node) {
      elements.push({ node: s.node, note: `This element moved (shift score ${s.score.toFixed(3)}). Something above it changed size or was added after it appeared.` });
      steps.add("Find what appears above the moving element after the page loads (a banner, cookie notice, ad slot, embed or late-loading content) and reserve its space in CSS.");
      continue;
    }
    for (const cause of s.causes) {
      const key = cause.node?.path ?? cause.text;
      if (seen.has(key)) continue;
      seen.add(key);
      if (/unsized image/i.test(cause.text) && cause.node) {
        elements.push({
          node: cause.node,
          note: `This image has no width and height, so the space for it only opens when it loads, pushing "${s.node?.label || s.node?.selector}" down.`,
          current: cause.node.snippet,
          fixed: sizedSnippet(cause.node, c, getAttr(cause.node.snippet, "src")),
        });
        steps.add("Add width and height attributes to images (the real pixel size). CSS can still make them responsive with height: auto.");
      } else if (/font/i.test(cause.text)) {
        const n = cause.node ?? s.node;
        if (n && !elements.some((e) => e.node.path === n.path)) elements.push({ node: n, note: "This text reflowed when the web font loaded, because the fallback font is a different size." });
        steps.add("Match the fallback font's size to your web font with size-adjust, or preload the font so it's ready before the text is drawn.");
        if (!code.some((b) => b.label.startsWith("Fallback")))
          code.push({ label: "Fallback font that matches your web font's size", lang: "css", code: '@font-face {\n  font-family: "YourFont Fallback";\n  src: local("Arial");\n  size-adjust: 105%; /* tune until the text lines up */\n}\nbody { font-family: "YourFont", "YourFont Fallback", sans-serif; }' });
      } else if (/iframe|embed|injected|media/i.test(cause.text)) {
        if (cause.node) elements.push({ node: cause.node, note: `${cause.text}: it arrived after the page appeared and pushed content down.` });
        steps.add("Give embeds, iframes, ads and video players a fixed space before they load, with width and height or aspect-ratio in CSS.");
        if (!code.some((b) => b.label.startsWith("Reserve")))
          code.push({ label: "Reserve space for an embed or ad slot", lang: "css", code: ".embed-slot {\n  aspect-ratio: 16 / 9; /* or min-height: 250px; for an ad */\n  width: 100%;\n}" });
      } else if (cause.node) elements.push({ node: cause.node, note: cause.text });
      else if (s.node && !elements.some((e) => e.node.path === s.node!.path)) elements.push({ node: s.node, note: `${cause.text}: this element moved (shift score ${s.score.toFixed(3)}).` });
    }
  }
  if (!elements.length) return null;
  return base(a, {
    title: "Stop the layout from jumping",
    summary: `The page shifts while it loads (CLS ${cls.toFixed(3)}; Google's limit for good is 0.1). The elements below are what moved and what pushed them.`,
    why: "Layout shifts make people tap the wrong thing and lose their place. CLS is one of the three Core Web Vitals Google uses.",
    metrics: ["CLS"],
    savingsCls: cls,
    elements,
    steps: [...steps],
    code,
    owner: "Developer",
    weight: Math.max(cls * 120, 3),
  });
};

const unsizedImages: Builder = (a, c) => {
  if (!failing(a)) return null;
  const items = rows(a).filter((i) => i.node);
  if (!items.length) return null;
  const elements: FindingElement[] = items.slice(0, 8).map((i) => {
    const node = toNode(i.node)!;
    return { node, current: node.snippet, fixed: sizedSnippet(node, c, i.url) };
  });
  return base(a, {
    title: "Give every image a width and height",
    summary: `${items.length} image${items.length > 1 ? "s have" : " has"} no width and height attributes, so the browser can't reserve space before ${items.length > 1 ? "they load" : "it loads"}.`,
    why: "Without a size the image starts at zero height, then pushes everything below it down when it arrives. That's counted in CLS.",
    metrics: ["CLS"],
    elements,
    steps: ["Add width and height (the image's real pixel size) to each <img>. Keep CSS like img { max-width: 100%; height: auto; } so it stays responsive."],
    code: [{ label: "CSS that keeps sized images responsive", lang: "css", code: "img {\n  max-width: 100%;\n  height: auto;\n}" }],
    owner: "Developer",
    weight: (c.labValue.CLS ?? 0) > 0.1 ? 6 : 2,
  });
};

const jsExecution: Builder = (a, c) => {
  if (!failing(a)) return null;
  const items = rows(a).filter((i) => i.url && i.url !== "Unattributable" && (i.total ?? 0) > 50);
  if (!items.length) return null;
  const longTasks = rows(c.audits["long-tasks"]).length;
  const top = items[0];
  const resources = items.slice(0, 8).map((i) => ({ url: /^Inline/.test(scriptName(i.url, c)) ? "Inline scripts in the page HTML" : i.url, ms: i.total, note: `${formatMs(i.scripting ?? 0)} running, ${formatMs(i.scriptParseCompile ?? 0)} parsing`, thirdParty: isThirdParty(i.url, c.origin) }));
  const nonEssential = resources.find((r) => r.thirdParty) ?? resources[1] ?? resources[0];
  return base(a, {
    title: "Cut the JavaScript that keeps the page busy",
    summary: `Scripts keep the browser busy for ${formatMs(items.reduce((s, i) => s + (i.total ?? 0), 0))}${longTasks ? ` in ${longTasks} long task${longTasks > 1 ? "s" : ""}` : ""}. The biggest is ${scriptName(top.url, c)} at ${formatMs(top.total)}.`,
    why: "While JavaScript runs, the page can't respond to taps or clicks. That's what Total Blocking Time measures in the lab and Interaction to Next Paint (INP) measures for real users.",
    metrics: ["TBT", "INP"],
    savingsMs: savings(a).TBT || undefined,
    resources,
    steps: [
      "Remove scripts you don't use: old tracking tags, chat widgets, A/B testing tools and unused plugins.",
      "Load scripts that aren't needed straight away with defer, or only when the visitor interacts.",
      "Split large bundles so each page loads only its own code (dynamic import()).",
      "Break up long-running work so the browser can respond in between (await scheduler.yield(), or setTimeout).",
    ],
    code: [
      {
        label: "Load a non-essential script only after the first interaction",
        lang: "js",
        code: `let loaded = false;\nfunction loadLater() {\n  if (loaded) return;\n  loaded = true;\n  const s = document.createElement("script");\n  s.src = "${nonEssential && !/^Inline/.test(scriptName(nonEssential.url, c)) ? codeUrl(nonEssential.url, c.origin) : "/js/widget.js"}";\n  s.async = true;\n  document.head.append(s);\n}\n["pointerdown", "keydown", "scroll"].forEach((e) => addEventListener(e, loadLater, { once: true, passive: true }));`,
      },
    ],
    owner: "Developer",
  });
};

const thirdParties: Builder = (a, c) => {
  const items = rows(a).filter((i) => (i.mainThreadTime ?? 0) > 100 || (i.transferSize ?? 0) > 200 * 1024);
  if (!items.length) return null;
  void c;
  const ms = items.reduce((s, i) => s + (i.mainThreadTime ?? 0), 0);
  return base(a, {
    title: "Rein in third-party scripts",
    summary: `Code from other companies takes ${formatMs(ms)} of main-thread time: ${items.slice(0, 4).map((i) => (typeof i.entity === "string" ? i.entity : i.entity?.text ?? "Unknown")).join(", ")}.`,
    why: "Third-party tags (analytics, ads, chat, social embeds) compete with your own code for the browser's attention, and you can't optimise their code, only when and whether they load.",
    metrics: ["TBT", "INP"],
    resources: items.map((i) => ({ url: typeof i.entity === "string" ? i.entity : i.entity?.text ?? "", bytes: i.transferSize, ms: i.mainThreadTime, thirdParty: true })),
    steps: [
      "Remove any tag nobody uses any more.",
      "Load chat widgets, video players and social embeds only when someone clicks them (a lightweight placeholder, or \"facade\", until then).",
      "Move tags into Google Tag Manager and fire non-essential ones on Window Loaded instead of Page View.",
    ],
    owner: "Marketing and developer",
    weight: Math.max(weigh(a), ms / 1000 * 12),
  });
};

const viewport: Builder = (a) => {
  if (!failing(a)) return null;
  const node = toNode(rows(a).find((i) => i.node)?.node);
  const fixed = '<meta name="viewport" content="width=device-width, initial-scale=1">';
  return base(a, {
    title: "Add a mobile viewport tag",
    summary: node ? "The viewport tag stops the page from fitting mobile screens properly." : "The page has no viewport meta tag, so phones show it as a shrunk desktop page.",
    why: "Without it, mobile browsers lay the page out at desktop width and can delay taps by up to 300 ms. It also affects how Google sees the page's mobile-friendliness.",
    metrics: ["INP"],
    elements: node ? [{ node, current: node.snippet, fixed }] : [],
    code: node ? [] : [{ label: "Add inside <head>", lang: "html", code: fixed }],
    steps: ["Add the tag inside <head>, before any stylesheets."],
    owner: "Developer",
    weight: 5,
  });
};

const unused = (kind: "JavaScript" | "CSS"): Builder => (a, c) => {
  if (!failing(a)) return null;
  const items = rows(a).filter((i) => i.url && (i.wastedBytes ?? 0) > 10 * 1024);
  if (!items.length) return null;
  const wasted = items.reduce((s, i) => s + (i.wastedBytes ?? 0), 0);
  return base(a, {
    title: `Remove unused ${kind}`,
    summary: `About ${formatBytes(wasted)} of ${kind} is downloaded but never used on this page.`,
    why: `Every unused byte still has to download${kind === "JavaScript" ? " and be parsed" : ", and stylesheets block the first paint"}. On slow phones that time adds up.`,
    metrics: metricsOf(a, kind === "CSS" ? ["FCP", "LCP"] : ["LCP", "TBT"]),
    savingsMs: savings(a).LCP || savings(a).FCP || undefined,
    savingsBytes: wasted,
    resources: items.map((i) => ({ url: i.url, bytes: i.totalBytes, wastedBytes: i.wastedBytes, note: i.wastedPercent ? `${Math.round(i.wastedPercent)}% unused` : undefined, thirdParty: isThirdParty(i.url, c.origin) })),
    steps:
      kind === "CSS"
        ? ["Remove CSS from themes and plugins that this page doesn't use, or load it only on the pages that do.", "Use a build step that strips unused CSS (Tailwind does this by default; PurgeCSS for others).", "Inline the critical CSS and load the rest without blocking."]
        : ["Load code only on the pages that use it (split bundles with dynamic import()).", "Remove libraries you no longer need, and swap heavy ones for lighter alternatives.", "WordPress: stop plugins loading their scripts on every page (Perfmatters or Asset CleanUp can do this)."],
    owner: "Developer",
  });
};

const minify = (kind: "JavaScript" | "CSS"): Builder => (a, c) => {
  if (!failing(a)) return null;
  const items = rows(a).filter((i) => i.url);
  if (!items.length) return null;
  const wasted = items.reduce((s, i) => s + (i.wastedBytes ?? 0), 0);
  return base(a, {
    title: `Minify ${kind}`,
    summary: `${items.length} ${kind} file${items.length > 1 ? "s are" : " is"} sent with spaces and comments still in, wasting ${formatBytes(wasted)}.`,
    why: "Minifying removes characters the browser doesn't need. It's a quick, safe saving.",
    metrics: metricsOf(a, ["FCP"]),
    savingsBytes: wasted,
    resources: items.map((i) => ({ url: i.url, bytes: i.totalBytes, wastedBytes: i.wastedBytes, thirdParty: isThirdParty(i.url, c.origin) })),
    steps: ["Turn on minification in your build tool, CDN or performance plugin."],
    owner: "Developer",
  });
};

const dependencyTree: Builder = (a, c) => {
  if (!failing(a)) return null;
  const items = rows(a);
  const tree = items.find((i) => i.value?.type === "network-tree")?.value;
  const candidates = items.find((i) => /preconnect candidates/i.test(i.title ?? ""))?.value;
  const origins: string[] = Array.isArray(candidates?.items) ? candidates.items.map((x: any) => x.origin ?? x.url).filter(Boolean) : [];
  // Walk the longest chain.
  const chain: { url: string; ms: number }[] = [];
  let level = tree?.chains;
  while (level && Object.keys(level).length) {
    const next: any = Object.values(level).find((n: any) => n.isLongest) ?? Object.values(level)[0];
    chain.push({ url: next.url, ms: next.navStartToEndTime });
    level = next.children;
  }
  if (chain.length < 3 && !origins.length) return null;
  return base(a, {
    title: "Shorten chains of requests",
    summary: `The longest chain is ${chain.length} requests deep: each file is only discovered after the one before it downloads, ending ${formatMs(chain.at(-1)?.ms ?? 0)} after the page started loading.`,
    why: "The browser can only request a file once it knows about it. When a stylesheet loads a font, or a script loads another script, the waits stack up.",
    metrics: ["LCP", "FCP"],
    resources: chain.map((x, i) => ({ url: x.url, ms: x.ms, note: i === 0 ? "Page" : `Step ${i + 1}`, thirdParty: isThirdParty(x.url, c.origin) })),
    steps: [
      "Preload files that are found late but needed early, such as fonts and the main image.",
      "Avoid @import in CSS and scripts that load more scripts.",
      ...(origins.length ? ["Connect early to the other servers the page depends on (preconnect)."] : []),
    ],
    code: origins.length
      ? [{ label: "Preconnect, in the <head>", lang: "html", code: origins.slice(0, 4).map((o) => `<link rel="preconnect" href="${o}" crossorigin>`).join("\n") }]
      : chain.some((x) => /\.woff2?(\?|$)/i.test(x.url))
        ? [{ label: "Preload the font, in the <head>", lang: "html", code: `<link rel="preload" href="${codeUrl(chain.find((x) => /\.woff2?(\?|$)/i.test(x.url))!.url, c.origin)}" as="font" type="font/woff2" crossorigin>` }]
        : [],
    owner: "Developer",
  });
};

const domSize: Builder = (a) => {
  if (!failing(a)) return null;
  const items = rows(a);
  const total = items.find((i) => /total/i.test(i.statistic ?? ""))?.value?.value;
  const depth = items.find((i) => /depth/i.test(i.statistic ?? ""))?.value?.value;
  const elements = items.map((i) => toNode(i.node)).filter(Boolean).map((n) => ({ node: n! }));
  return base(a, {
    title: "Reduce the number of page elements",
    summary: `The page has ${Number(total ?? 0).toLocaleString("en-US")} HTML elements${depth ? `, nested up to ${depth} levels deep` : ""}. Under about 1,400 is a healthy target.`,
    why: "Every element costs memory and time whenever the page changes. A very large page makes taps and scrolling feel slow, which shows up in INP.",
    metrics: ["INP", "TBT"],
    elements: elements.slice(0, 2),
    steps: ["Remove hidden or duplicate markup (separate mobile and desktop menus, hidden tabs, huge mega menus).", "Load long lists, reviews and comments in pages or as the visitor scrolls."],
    owner: "Developer",
  });
};

const simpleList = (title: string, why: string, steps: string[], metrics: MetricKey[], owner = "Developer"): Builder => (a, c) => {
  if (!failing(a)) return null;
  const items = rows(a);
  const resources: FindingResource[] = items.filter((i) => typeof i.url === "string").map((i) => ({ url: i.url, bytes: i.totalBytes, wastedBytes: i.wastedBytes, ms: i.wastedMs, note: i.protocol ?? i.reason, thirdParty: isThirdParty(i.url, c.origin) }));
  const elements = items.map((i) => toNode(i.node)).filter(Boolean).slice(0, 4).map((n) => ({ node: n! }));
  const reasons = items.map((i) => i.reason).filter(Boolean);
  return base(a, {
    title,
    summary: a.displayValue ? `${plainText(a.title)}: ${a.displayValue.replace(/KiB/g, "KB").replace(/MiB/g, "MB")}.` : reasons.length ? reasons.slice(0, 3).join(" ") : plainText(a.description).split(". ")[0] + ".",
    why,
    metrics: metricsOf(a, metrics),
    savingsMs: savings(a).LCP || savings(a).FCP || savings(a).TBT || undefined,
    resources,
    elements,
    steps,
    owner,
  });
};

export const BUILDERS: Record<string, Builder> = {
  "lcp-discovery-insight": lcpDiscovery,
  "render-blocking-insight": renderBlocking,
  "document-latency-insight": documentLatency,
  "image-delivery-insight": imageDelivery,
  "cache-insight": cache,
  "font-display-insight": fontDisplay,
  "cls-culprits-insight": layoutShift,
  "unsized-images": unsizedImages,
  "bootup-time": jsExecution,
  "third-parties-insight": thirdParties,
  "viewport-insight": viewport,
  "unused-javascript": unused("JavaScript"),
  "unused-css-rules": unused("CSS"),
  "unminified-css": minify("CSS"),
  "unminified-javascript": minify("JavaScript"),
  "network-dependency-tree-insight": dependencyTree,
  "dom-size-insight": domSize,
  "legacy-javascript-insight": simpleList(
    "Stop sending old-browser JavaScript to modern browsers",
    "Polyfills and transforms for old browsers make files bigger and slower to run, and modern browsers don't need them.",
    ["Update your build tool's browser targets (browserslist) so it stops adding code for very old browsers."],
    ["TBT"],
  ),
  "duplicated-javascript-insight": simpleList(
    "Remove duplicated JavaScript",
    "The same library is downloaded more than once, often by different plugins or bundles.",
    ["Make sure each library is bundled once and shared, and remove plugins that bring their own copy."],
    ["TBT"],
  ),
  "modern-http-insight": simpleList(
    "Serve files over HTTP/2 or HTTP/3",
    "HTTP/1.1 downloads only a few files at a time from each server. HTTP/2 and HTTP/3 download many at once over one connection.",
    ["Turn on HTTP/2 or HTTP/3 at your host or CDN. Most modern hosts and CDNs support it with a switch."],
    ["LCP"],
    "Server / hosting",
  ),
  "bf-cache": simpleList(
    "Let the back button restore the page instantly",
    "Browsers can keep a page in memory so Back and Forward are instant, but only if nothing on the page prevents it.",
    ["Fix the reasons listed: most often an unload event handler, Cache-Control: no-store on the HTML, or an open connection."],
    ["LCP"],
  ),
  redirects: simpleList("Avoid redirects before the page loads", "Each redirect is a full round trip before the page can start loading.", ["Link straight to the final URL everywhere: menus, sitemaps, canonicals, ads and emails."], ["TTFB", "LCP"], "Developer or SEO"),
  "forced-reflow-insight": simpleList(
    "Stop scripts forcing extra layout work",
    "When a script changes the page and then immediately reads sizes or positions, the browser has to recalculate the layout on the spot.",
    ["Read layout values (offsetHeight, getBoundingClientRect) first, then make your changes, or batch changes in requestAnimationFrame."],
    ["TBT", "INP"],
  ),
  "non-composited-animations": simpleList(
    "Use animations the browser can run smoothly",
    "Animating properties like width, top or margin makes the browser redo layout on every frame.",
    ["Animate transform and opacity instead, which the browser can handle without redoing layout."],
    ["CLS"],
  ),
  "total-byte-weight": simpleList(
    "Make the page lighter",
    "A heavy page takes longer to load on mobile data and costs visitors money on metered plans.",
    ["Start with the largest files in the list: usually images, video and JavaScript bundles."],
    ["LCP"],
  ),
};

/** Audits shown elsewhere in the report, or replaced by a newer insight. */
export const HANDLED_ELSEWHERE = new Set([
  "layout-shifts",
  "server-response-time",
  "long-tasks",
  "mainthread-work-breakdown",
  "lcp-breakdown-insight",
  "inp-breakdown-insight",
  "largest-contentful-paint-element",
  "prioritize-lcp-image",
  "lcp-lazy-loaded",
  "render-blocking-resources",
  "uses-optimized-images",
  "modern-image-formats",
  "uses-responsive-images",
  "efficient-animated-content",
  "uses-long-cache-ttl",
  "font-display",
  "uses-rel-preconnect",
  "critical-request-chains",
  "dom-size",
  "third-party-summary",
  "third-party-facades",
  "diagnostics",
  "metrics",
  "network-requests",
  "network-rtt",
  "network-server-latency",
  "main-thread-tasks",
  "resource-summary",
  "screenshot-thumbnails",
  "final-screenshot",
  "script-treemap-data",
  "user-timings",
  "max-potential-fid",
  "interactive",
]);

export function buildFindings(c: Ctx): Finding[] {
  const out: Finding[] = [];
  for (const [id, a] of Object.entries(c.audits)) {
    if (HANDLED_ELSEWHERE.has(id)) continue;
    const b = BUILDERS[id];
    if (b) {
      const f = b(a, c);
      if (f) out.push(...(Array.isArray(f) ? f : [f]));
      continue;
    }
    // Any other failing audit with a measurable cost still gets listed.
    if (failing(a) && a.scoreDisplayMode === "metricSavings") {
      const f = simpleList(plainText(a.title), plainText(a.description), [], ["LCP"])(a, c);
      if (f) out.push(...(Array.isArray(f) ? f : [f]));
    }
  }
  return out.sort((x, y) => y.weight - x.weight);
}

export function passedAudits(c: Ctx, findings: Finding[]): string[] {
  const shown = new Set(findings.map((f) => f.auditId));
  return Object.values(c.audits)
    .filter((a) => !HANDLED_ELSEWHERE.has(a.id) && !shown.has(a.id) && a.score !== null && a.score >= 0.9 && a.scoreDisplayMode !== "informative" && a.scoreDisplayMode !== "numeric" && a.scoreDisplayMode !== "notApplicable")
    .map((a) => plainText(a.title));
}
